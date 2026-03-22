import { OllamaToolCall, ollamaChat, ollamaGenerate, safeOllamaListModels } from "../ai-api/ollamaApi";
import { describeToolkitFunctions } from "./basicToolkit";
import { executeTool } from "./toolkitExecutor";

type AiCoreDeps = {
  config: { get<T>(key: string): T | undefined; update(key: string, value: unknown, global?: boolean): Thenable<void> };
  postMessage: (message: { type: string; value?: unknown }) => void;
  showInformationMessage: (message: string) => void;
  showErrorMessage: (message: string) => void;
  executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
  workspaceRoot?: string;
};

type ChatMessage = { role: string; content: string };

export class AiCore {
  private systemPrompt: string;
  private defaultSystemPrompt: string;
  private messages: ChatMessage[];
  private chatContext: number[] | null;
  private isProcessing: boolean;
  private cancelRequested: boolean;
  private currentAbortController: AbortController | null;

  constructor(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
    this.defaultSystemPrompt = systemPrompt;
    this.messages = [
      { role: "system", content: this.systemPrompt },
    ];
    this.chatContext = null;
    this.isProcessing = false;
    this.cancelRequested = false;
    this.currentAbortController = null;
  }

  private updateSystemMessage(content: string) {
    if (this.messages.length === 0) {
      this.messages.push({ role: "system", content });
      return;
    }
    if (this.messages[0].role !== "system") {
      this.messages.unshift({ role: "system", content });
      return;
    }
    this.messages[0] = { role: "system", content };
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
      case "getToolkitSettings": {
        const toolkitDefinitions = getToolkitDefinitions();
        const names = toolkitDefinitions.map((toolkit) => toolkit.name);
        const enabled = getEnabledToolkits(
          deps.config.get<string[]>("toolkits.enabled"),
          deps.config.get<string[]>("toolkits.defaultEnabled"),
          names
        );
        deps.postMessage({
          type: "toolkitSettings",
          value: { toolkits: toolkitDefinitions, enabled },
        });
        break;
      }
      case "getSystemPrompt": {
        const current = deps.config.get<string>("systemPrompt") ?? this.defaultSystemPrompt;
        deps.postMessage({
          type: "systemPrompt",
          value: { systemPrompt: current, defaultSystemPrompt: this.defaultSystemPrompt },
        });
        break;
      }
      case "updateSystemPrompt": {
        if (!data.value) {
          return;
        }
        const next =
          isRecord(data.value) && typeof data.value.systemPrompt === "string"
            ? data.value.systemPrompt
            : "";
        await deps.config.update("systemPrompt", next, true);
        this.systemPrompt = next || this.defaultSystemPrompt;
        this.updateSystemMessage(this.systemPrompt);
        deps.postMessage({
          type: "systemPrompt",
          value: { systemPrompt: this.systemPrompt, defaultSystemPrompt: this.defaultSystemPrompt },
        });
        break;
      }
      case "resetSystemPrompt": {
        await deps.config.update("systemPrompt", this.defaultSystemPrompt, true);
        this.systemPrompt = this.defaultSystemPrompt;
        this.updateSystemMessage(this.systemPrompt);
        deps.postMessage({
          type: "systemPrompt",
          value: { systemPrompt: this.systemPrompt, defaultSystemPrompt: this.defaultSystemPrompt },
        });
        break;
      }
      case "openExtensionSettings": {
        await deps.executeCommand("workbench.action.openSettings", "liteweight-coding-ai");
        break;
      }
      case "cancelPrompt": {
        if (this.currentAbortController) {
          this.cancelRequested = true;
          this.currentAbortController.abort();
        }
        deps.postMessage({ type: "addResponse", value: "Đã hủy yêu cầu." });
        break;
      }
      case "resetConversationContext": {
        if (this.currentAbortController) {
          this.cancelRequested = true;
          this.currentAbortController.abort();
        }
        this.messages = [{ role: "system", content: this.systemPrompt }];
        this.chatContext = null;
        this.isProcessing = false;
        this.cancelRequested = false;
        this.currentAbortController = null;
        deps.postMessage({ type: "processingEnd" });
        break;
      }
      case "updateToolkitSettings": {
        if (!data.value) {
          return;
        }
        const toolkitDefinitions = getToolkitDefinitions();
        const names = toolkitDefinitions.map((toolkit) => toolkit.name);
        const enabled =
          isRecord(data.value) && Array.isArray(data.value.enabledToolkits)
            ? data.value.enabledToolkits.filter((name) => typeof name === "string" && names.includes(name))
            : getEnabledToolkits(undefined, deps.config.get<string[]>("toolkits.defaultEnabled"), names);
        await deps.config.update("toolkits.enabled", enabled, true);
        deps.postMessage({
          type: "toolkitSettings",
          value: { toolkits: toolkitDefinitions, enabled },
        });
        break;
      }
      case "onSendMessage": {
        if (!data.value) {
          return;
        }
        if (this.isProcessing) {
          deps.postMessage({
            type: "addResponse",
            value: "Please wait, processing previous request...",
          });
          return;
        }

        const baseUrl = deps.config.get<string>("ollama.baseUrl") ?? "http://localhost:11434";
        const configModel = deps.config.get<string>("ollama.model") ?? "qwen2.5:7b";

        const prompt =
          isRecord(data.value) && typeof data.value.prompt === "string"
            ? data.value.prompt
            : String(data.value);
        const model =
          isRecord(data.value) && typeof data.value.model === "string" && data.value.model.length > 0
            ? data.value.model
            : configModel;
        const mode =
          isRecord(data.value) && typeof data.value.mode === "string"
            ? data.value.mode
            : "coder";

        this.isProcessing = true;
        this.cancelRequested = false;
        this.currentAbortController = new AbortController();
        deps.postMessage({ type: "processingStart" });

        try {
          const activeSystemPrompt =
            deps.config.get<string>("systemPrompt") ?? this.defaultSystemPrompt;
          this.systemPrompt = activeSystemPrompt;
          this.updateSystemMessage(activeSystemPrompt);
          if (mode === "chat") {
            if (this.cancelRequested) {
              deps.postMessage({ type: "addResponse", value: "Đã hủy yêu cầu." });
              break;
            }
            const response = await ollamaGenerate({
              baseUrl,
              model,
              prompt,
              systemPrompt: activeSystemPrompt,
              context: this.chatContext ?? undefined,
              signal: this.currentAbortController?.signal,
            });
            deps.postMessage({
              type: "addResponse",
              value: response.response,
            });
            this.chatContext = response.context ?? this.chatContext;
            this.messages.push({ role: "user", content: prompt });
            this.messages.push({ role: "assistant", content: response.response });
            break;
          }

          const tools = describeToolkitFunctions();
          const toolNames = tools
            .map((tool) => tool.function?.name)
            .filter((name): name is string => typeof name === "string");
          const enabledToolkits = getEnabledToolkits(
            deps.config.get<string[]>("toolkits.enabled"),
            deps.config.get<string[]>("toolkits.defaultEnabled"),
            toolNames
          );
          const filteredTools = tools.filter((tool) =>
            enabledToolkits.includes(tool.function?.name ?? "")
          );
          const loopMessages: {
            role: string;
            content: string;
            tool_name?: string;
            tool_call_id?: string;
          }[] = [...this.messages, { role: "user", content: prompt }];
          const maxLoops = 20;
          let loopCount = 0;
          let privToolName = "";

          let finalResponse = "";
          let handled = false;
          while(loopCount < maxLoops) {
            if (this.cancelRequested) {
              deps.postMessage({ type: "addResponse", value: "Canceled." });
              handled = true;
              break;
            }
            const response = await ollamaChat({
              baseUrl,
              model,
              messages: loopMessages,
              tools: filteredTools,
              signal: this.currentAbortController?.signal,
            });
            loopCount += 1;

            if (!response.toolCalls || response.toolCalls.length === 0) {
              finalResponse = response.content;
              deps.postMessage({
                type: "addResponse",
                value: `${finalResponse}`,
              });
              deps.postMessage({
                type: "addResponse",
                value: "DONE!",
              });
              this.messages.push({ role: "user", content: prompt });
              this.messages.push(response);
              handled = true;
              break;
            }
            if(response.content){
              deps.postMessage({
                type: "addResponse",
                value: response.content,
              });
            }
            
            loopMessages.push(response);

            const toolResults = await runToolCalls(response.toolCalls, deps, deps.workspaceRoot);
            for (const toolResult of toolResults) {
              loopMessages.push({
                role: "tool",
                content: toolResult.content,
                tool_name: toolResult.tool_name,
                tool_call_id: toolResult.tool_call_id,
              });
              if(toolResult.tool_name != privToolName){
                privToolName = toolResult.tool_name||"";
                loopCount = 0;
              }
              switch(toolResult.tool_name){
                case "run_command": {
                  deps.postMessage({
                    type: "addResponse",
                    value: `\`\`\`output\n${toolResult.content}\n\`\`\``,
                  });
                  break
                }
                default:
                  break;
              }
            }
          }
          
          if (!handled) {
            deps.postMessage({
              type: "addResponse",
              value: "AI overload, try again.",
            });
          }
          console.log(`[lwai:ollama] loopMessages: `, loopMessages);
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            if (!this.cancelRequested) {
              deps.postMessage({ type: "addResponse", value: "Canceled." });
            }
          } else if (this.cancelRequested) {
            deps.postMessage({ type: "addResponse", value: "Canceled." });
          } else {
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
        } finally {
          this.isProcessing = false;
          this.cancelRequested = false;
          this.currentAbortController = null;
          deps.postMessage({ type: "processingEnd" });
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

    console.log(`[lwai:ollama] messages: `, this.messages);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type ToolResult = {
  tool_name?: string;
  tool_call_id?: string;
  content: string;
};

async function runToolCalls(
  toolCalls: OllamaToolCall[],
  deps: AiCoreDeps,
  defaultRootPath?: string
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  const searchEngines = deps.config.get<string[]>("search.engines");
  for (const call of toolCalls) {
    const name = call.function?.name;
    const args = parseArgs(call.function?.arguments);
    if (!name) {
      results.push({
        tool_name: name,
        tool_call_id: call.id,
        content: "Invalid tool call",
      });
      continue;
    }
    
    if (name === "read_file" || name === "write_file") {
      deps.postMessage({
        type: "addResponse",
        value: `**AI is processing:** ${name}(${JSON.stringify(args)})`,
      });
    } else {
      deps.postMessage({
        type: "addResponse",
        value: `**AI is processing:** ${name}`,
      });
    }
    try {
      const content = await executeTool(name, args, { defaultRootPath, searchEngines });
      results.push({
        tool_name: name,
        tool_call_id: call.id,
        content,
      });
      console.log(`[lwai:toolkit] ${name}(${JSON.stringify(args)}) => ${content}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        tool_name: name,
        tool_call_id: call.id,
        content: `Tool error: ${message}`,
      });
      console.error(`[lwai:toolkit] ${name}(${JSON.stringify(args)}) => ${message}`);
    }
  }
  return results;
}

function parseArgs(value?: Record<string, unknown>): Record<string, unknown> {
  if (!value) {
    return {};
  }
  return isRecord(value) ? value : {};
}

function getToolkitDefinitions(): Array<{ name: string; description: string }> {
  const tools = describeToolkitFunctions();
  const mapped = tools
    .map((tool) => ({
      name: typeof tool.function?.name === "string" ? tool.function.name : "",
      description: typeof tool.function?.description === "string" ? tool.function.description : "",
    }))
    .filter((tool) => tool.name.length > 0);
  return mapped;
}

function getEnabledToolkits(
  value: unknown,
  defaults: unknown,
  allNames: string[]
): string[] {
  const fallback =
    Array.isArray(defaults) && defaults.length > 0
      ? defaults.filter((name) => typeof name === "string" && allNames.includes(name))
      : allNames.filter((name) => name !== "write_file" && name !== "run_command");
  if (Array.isArray(value)) {
    return value.filter((name) => typeof name === "string" && allNames.includes(name));
  }
  return fallback;
}
