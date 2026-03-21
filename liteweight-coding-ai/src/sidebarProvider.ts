import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getNonce, renderHtml } from "./utils";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _doc?: vscode.TextDocument;
  _systemPrompt?: string;
  _messages?: Array<{ role: string; content: string }>;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {

    const config = vscode.workspace.getConfiguration("liteweight-coding-ai");

    this._view = webviewView;
    this._systemPrompt = "You must ALWAYS respond in the SAME language as the user's input. If the user writes in Vietnamese, respond in Vietnamese. If English, respond in English. Never use Chinese unless explicitly asked.";
    this._messages = [];

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, "webview"),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Lắng nghe message từ webview (Message Bus)
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "getModels": {
          
          const baseUrl =
            (isRecord(data.value) && typeof data.value.baseUrl === "string" && data.value.baseUrl.length > 0
              ? data.value.baseUrl
              : null) ?? (config.get<string>("ollama.baseUrl") ?? "http://localhost:11434");
          const model = config.get<string>("ollama.model") ?? "deepcoder:1.5b";

          const models = await safeOllamaListModels(baseUrl);
          webviewView.webview.postMessage({
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
          
          const baseUrl = config.get<string>("ollama.baseUrl") ?? "http://localhost:11434";
          const configModel = config.get<string>("ollama.model") ?? "deepcoder:1.5b";

          const prompt =
            isRecord(data.value) && typeof data.value.prompt === "string"
              ? data.value.prompt
              : String(data.value);
          const model =
            isRecord(data.value) && typeof data.value.model === "string" && data.value.model.length > 0
              ? data.value.model
              : configModel;

          try {
            const response = await ollamaGenerate({ 
              baseUrl, model, prompt, 
              systemPrompt: this._systemPrompt ?? "", 
              messages: this._messages ?? [] 
            });
            webviewView.webview.postMessage({
              type: "addResponse",
              value: response,
            });

            this._messages?.push({ role: "user", content: prompt });
            this._messages?.push({ role: "assistant", content: response });

          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const maybeModels = await safeOllamaListModels(baseUrl);
            const modelHelp =
              maybeModels && maybeModels.length > 0
                ? `\n\n**Available models:**\n\n${maybeModels.map((m) => `- \`${m}\``).join("\n")}\n`
                : "";
            webviewView.webview.postMessage({
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
          vscode.window.showInformationMessage(data.value);
          break;
        }
        case "onError": {
          if (!data.value) {
            return;
          }
          vscode.window.showErrorMessage(data.value);
          break;
        }
      }
    });
  }

  public revive(panel: vscode.WebviewView) {
    this._view = panel;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview", "styles", "reset.css")
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview", "styles", "vscode.css")
    );

    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview", "styles", "main.css")
    );

    const styleTailwindUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview", "styles", "tailwind.css")
    );

    const vueUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview", "vue.runtime.global.prod.js")
    );

    const bundleJsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "webview", "dist", "webview.js")
    );

    const htmlPath = path.join(this._extensionUri.fsPath, "webview", "index.html");
    const template = fs.readFileSync(htmlPath, "utf8");

    const nonce = getNonce();

    return renderHtml(template, {
      cspSource: webview.cspSource,
      nonce: nonce,
      styleResetUri: styleResetUri.toString(),
      styleVSCodeUri: styleVSCodeUri.toString(),
      // styleMainUri: styleMainUri.toString(),
      styleTailwindUri: styleTailwindUri.toString(),
      vueUri: vueUri.toString(),
      bundleJsUri: bundleJsUri.toString(),
    });
  }
}

type OllamaGenerateInput = {
  baseUrl: string;
  model: string;
  prompt: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
};

async function ollamaGenerate(input: OllamaGenerateInput): Promise<string> {
  const res = await fetch(input.baseUrl+"/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.prompt,
      stream: false,
      system: input.systemPrompt,
      messages: input.messages,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const result = await res.json() as unknown;

  if (isRecord(result) && typeof result.error === "string" && result.error.length > 0) {
    throw new Error(result.error);
  }

  if (!isRecord(result) || typeof result.response !== "string") {
    throw new Error("Invalid response from Ollama");
  }

  return result.response;
}

async function safeOllamaListModels(baseUrl: string): Promise<string[] | null> {
  try {
    return await ollamaListModels(baseUrl);
  } catch {
    return null;
  }
}

async function ollamaListModels(baseUrl: string): Promise<string[]> {
  const res = await fetch(baseUrl+"/api/tags");

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const result = await res.json() as unknown;

  if (!isRecord(result) || !Array.isArray(result.models)) {
    return [];
  }

  const names = result.models.map((m: unknown) => isRecord(m) && typeof m.name === "string" && m.name.length > 0 ? m.name : "");
  return names;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
