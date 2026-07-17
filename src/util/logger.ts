import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

/**
 * Creates the shared "Mutagen" output channel and ties its lifetime to the extension.
 */
export function initLogger(context: vscode.ExtensionContext): void
{
	channel = vscode.window.createOutputChannel("Mutagen");
	context.subscriptions.push(channel);
}

/**
 * Appends a timestamped line to the "Mutagen" output channel.
 */
export function log(message: string): void
{
	const line = `[${new Date().toISOString()}] ${message}`;
	channel?.appendLine(line);
}

/**
 * Logs an error message together with the underlying exception's stack or message.
 */
export function logError(message: string, err: unknown): void
{
	const detail = err instanceof Error ? err.stack ?? err.message : String(err);
	log(`ERROR: ${message}\n${detail}`);
}

/**
 * Brings the "Mutagen" output channel into view.
 */
export function showOutputChannel(): void
{
	channel?.show(true);
}
