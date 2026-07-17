import * as vscode from "vscode";
import { SessionTreeProvider } from "../views/sessionTreeProvider";
import { SyncSession } from "../mutagen/types";
import { TreeNode } from "../views/treeNodes";
import { logError, showOutputChannel } from "../util/logger";
import { label, resolveSession } from "./sessionArg";

/**
 * Registers the commands that let users hide sessions from the tree view
 * (and reveal them again), so noisy or irrelevant sessions can be tucked away
 * without terminating them.
 */
export function registerVisibilityCommands(context: vscode.ExtensionContext, provider: SessionTreeProvider): void
{
	context.subscriptions.push(
		vscode.commands.registerCommand("mutagen.hideSession", async (arg?: TreeNode | SyncSession) =>
		{
			const session = await resolveSession(arg, provider);
			if (!session)
			{
				return;
			}
			try
			{
				await provider.hideSession(session.identifier);
			}
			catch (err)
			{
				logError(`Failed to hide "${label(session)}"`, err);
				const choice = await vscode.window.showErrorMessage(`Better Mutagen: failed to hide "${label(session)}": ${(err as Error).message}`, "Show Logs");
				if (choice === "Show Logs")
				{
					showOutputChannel();
				}
			}
		}),

		vscode.commands.registerCommand("mutagen.unhideSession", async (arg?: TreeNode | SyncSession) =>
		{
			const session = await resolveSession(arg, provider);
			if (!session)
			{
				return;
			}
			try
			{
				await provider.unhideSession(session.identifier);
			}
			catch (err)
			{
				logError(`Failed to unhide "${label(session)}"`, err);
				const choice = await vscode.window.showErrorMessage(`Better Mutagen: failed to unhide "${label(session)}": ${(err as Error).message}`, "Show Logs");
				if (choice === "Show Logs")
				{
					showOutputChannel();
				}
			}
		}),

		vscode.commands.registerCommand("mutagen.showHiddenSessions", () => provider.toggleShowHidden()),
		vscode.commands.registerCommand("mutagen.hideHiddenSessionsAgain", () => provider.toggleShowHidden())
	);
}
