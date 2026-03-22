import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getNonce, renderHtml } from "./utils";
import { AiCore } from "./ai-core/aiCore";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  _aiCore?: AiCore;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    const config = vscode.workspace.getConfiguration("liteweight-coding-ai");

    this._view = webviewView;
    this._aiCore = new AiCore(
      "You are a coding assistant with access to tools.You must follow these rules strictly:1. If the user request involves files, code, or project structure:   → You MUST call a tool.2. Do NOT make up file contents.3. When calling a tool:   → Return ONLY valid JSON with tool_calls   → Do NOT include any explanation or extra text4. Only answer normally when no tool is needed.5. Always prefer using tools over guessing.Available tools will be provided."
    );

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,

      localResourceRoots: [
        this._extensionUri,
        vscode.Uri.joinPath(this._extensionUri, "webview"),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      if (!this._aiCore) {
        return;
      }
      await this._aiCore.handleWebviewMessage(data, {
        config,
        postMessage: (message) => webviewView.webview.postMessage(message),
        showInformationMessage: (message) => vscode.window.showInformationMessage(message),
        showErrorMessage: (message) => vscode.window.showErrorMessage(message),
      });
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
      styleTailwindUri: styleTailwindUri.toString(),
      vueUri: vueUri.toString(),
      bundleJsUri: bundleJsUri.toString(),
    });
  }
}
