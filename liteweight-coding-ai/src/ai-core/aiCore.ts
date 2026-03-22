import { OllamaToolCall, ollamaChat, safeOllamaListModels } from "../ai-api/ollamaApi";
import {
  describeToolkitFunctions,
  getProjectStructureFlat,
  readFileContent,
  searchCode,
} from "./filesMnToolkit";

type AiCoreDeps = {
  config: { get<T>(key: string): T | undefined };
  postMessage: (message: { type: string; value?: unknown }) => void;
  showInformationMessage: (message: string) => void;
  showErrorMessage: (message: string) => void;
};

type ChatMessage = { role: string; content: string };

export class AiCore {
  private systemPrompt: string;
  private messages: ChatMessage[];

  constructor(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
    this.messages = [
      { role: "system", content: this.systemPrompt },
    ];
  }

  public async handleWebviewMessage(data: unknown, deps: AiCoreDeps) {
    if (!isRecord(data) || typeof data.type !== "string") {
      return;
    }

    switch (data.type) {
      case "getModels": {
        const baseUrl =
          (isRecord(data.value) &&
          typeof data.value.baseUrl === "string" &&
          data.value.baseUrl.length > 0
            ? data.value.baseUrl
            : null) ??
          (deps.config.get<string>("ollama.baseUrl") ?? "http://localhost:11434");
        const model = deps.config.get<string>("ollama.model") ?? "deepcoder:1.5b";

        const models = await safeOllamaListModels(baseUrl);
        deps.postMessage({
          type: "ollamaModels",
          value: {
            models: models ?? [],
            selectedModel: model,
          },
        });
        break;
      }
      case "onSendMessage": {
        if (!data.value) {
          return;
        }

        const baseUrl = deps.config.get<string>("ollama.baseUrl") ?? "http://localhost:11434";
        const configModel = deps.config.get<string>("ollama.model") ?? "deepcoder:1.5b";

        const prompt =
          isRecord(data.value) && typeof data.value.prompt === "string"
            ? data.value.prompt
            : String(data.value);
        const model =
          isRecord(data.value) && typeof data.value.model === "string" && data.value.model.length > 0
            ? data.value.model
            : configModel;

        try {
          const tools = describeToolkitFunctions();
          const loopMessages: {
            role: string;
            content: string;
            name?: string;
            tool_call_id?: string;
          }[] = [...this.messages, { role: "user", content: prompt }];
          const maxLoops = 6;

          let finalResponse = "";
          let handled = false;
          for (let i = 0; i < maxLoops; i += 1) {
            const response = await ollamaChat({
              baseUrl,
              model,
              messages: loopMessages,
              tools,
            });

            if (!response.toolCalls) {
              finalResponse = response.content;
              deps.postMessage({
                type: "addResponse",
                value: finalResponse,
              });
              this.messages.push({ role: "user", content: prompt });
              this.messages.push(response);
              handled = true;
              break;
            }
            deps.postMessage({
              type: "addResponse",
              value: response.content?response.content:"...",
            });
            loopMessages.push(response);

            const toolResults = await runToolCalls(response.toolCalls, deps);
            for (const toolResult of toolResults) {
              loopMessages.push({
                role: "tool",
                content: toolResult.content,
                name: toolResult.name,
                tool_call_id: toolResult.tool_call_id,
              });
            }
          }
          console.log(loopMessages);
          if (!handled) {
            deps.postMessage({
              type: "addResponse",
              value: "AI xử lý quá lâu, vui lòng thử lại.",
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const maybeModels = await safeOllamaListModels(baseUrl);
          const modelHelp =
            maybeModels && maybeModels.length > 0
              ? `\n\n**Available models:**\n\n${maybeModels
                  .map((m) => `- \`${m}\``)
                  .join("\n")}\n`
              : "";
          deps.postMessage({
            type: "addResponse",
            value: `**Ollama error:**\n\n\`\`\`\n${message}\n\`\`\`${modelHelp}`,
          });
        }
        break;
      }
      case "onInfo": {
        if (!data.value) {
          return;
        }
        deps.showInformationMessage(String(data.value));
        break;
      }
      case "onError": {
        if (!data.value) {
          return;
        }
        deps.showErrorMessage(String(data.value));
        break;
      }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type ToolResult = {
  name?: string;
  tool_call_id?: string;
  content: string;
};

async function runToolCalls(toolCalls: OllamaToolCall[], deps: AiCoreDeps): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  for (const call of toolCalls) {
    const name = call.function?.name;
    const args = parseArgs(call.function?.arguments);
    if (!name) {
      results.push({
        name,
        tool_call_id: call.id,
        content: "Invalid tool call",
      });
      continue;
    }

    deps.postMessage({
      type: "addResponse",
      value: `**AI đang xử lý:** ${name}`,
    });

    try {
      const content = await executeTool(name, args);
      results.push({
        name,
        tool_call_id: call.id,
        content,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name,
        tool_call_id: call.id,
        content: `Tool error: ${message}`,
      });
    }
  }
  return results;
}

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "get_project_structure") {
    const rootPath = String(args.rootPath ?? "");
    const ignoreDirs = toStringArray(args.ignoreDirs);
    const includeExtensions = toStringArray(args.includeExtensions);
    return await getProjectStructureFlat(rootPath, {
      ignoreDirs: ignoreDirs.length > 0 ? ignoreDirs : undefined,
      includeExtensions: includeExtensions.length > 0 ? includeExtensions : undefined,
    });
  }

  if (name === "read_file") {
    const filePath = String(args.path ?? "");
    const maxChars = typeof args.maxChars === "number" ? args.maxChars : undefined;
    return await readFileContent(filePath, { maxChars });
  }

  if (name === "search_code") {
    const rootPath = String(args.rootPath ?? "");
    const query = String(args.query ?? "");
    const ignoreDirs = toStringArray(args.ignoreDirs);
    const includeExtensions = toStringArray(args.includeExtensions);
    const maxResults = typeof args.maxResults === "number" ? args.maxResults : undefined;
    const matches = await searchCode(rootPath, query, {
      ignoreDirs: ignoreDirs.length > 0 ? ignoreDirs : undefined,
      includeExtensions: includeExtensions.length > 0 ? includeExtensions : undefined,
      maxResults,
    });
    return JSON.stringify(matches);
  }

  throw new Error(`Unknown tool: ${name}`);
}

function parseArgs(value?: string): Record<string, unknown> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((v) => typeof v === "string") as string[];
}
