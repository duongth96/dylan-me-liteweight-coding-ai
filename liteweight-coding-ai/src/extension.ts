import * as vscode from 'vscode';
import { SidebarProvider } from './sidebarProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "liteweight-coding-ai" is now active!');

	const sidebarProvider = new SidebarProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			"liteweight-coding-ai-sidebar",
			sidebarProvider
		)
	);

	const disposable = vscode.commands.registerCommand('liteweight-coding-ai.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from liteweight-coding-ai!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {
	return;
}
