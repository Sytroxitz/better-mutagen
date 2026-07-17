import * as vscode from "vscode";
import { MutagenClient } from "../mutagen/client";
import { SessionTreeProvider } from "../views/sessionTreeProvider";
import { SyncSession } from "../mutagen/types";
import { TreeNode } from "../views/treeNodes";
import { logError, showOutputChannel } from "../util/logger";
import { label, resolveSession } from "./sessionArg";

/**
 * Runs an action, logging and showing an error message (with a "Show Logs"
 * shortcut) instead of letting the exception propagate.
 */
async function withErrorReporting(action: string, fn: () => Promise<void>): Promise<void>
{
	try
	{
		await fn();
	}
	catch (err)
	{
		logError(`Failed to ${action}`, err);
		const choice = await vscode.window.showErrorMessage(`Better Mutagen: failed to ${action}: ${(err as Error).message}`, "Show Logs");
		if (choice === "Show Logs")
		{
			showOutputChannel();
		}
	}
}

/**
 * Registers all per-session commands (pause, resume, terminate, reset, flush,
 * show details, and the status-bar quick pick).
 */
export function registerSessionActionCommands(
	context: vscode.ExtensionContext,
	client: MutagenClient,
	provider: SessionTreeProvider
): void
{
	context.subscriptions.push(
		vscode.commands.registerCommand("mutagen.refresh", () => provider.refresh()),

		vscode.commands.registerCommand("mutagen.pauseSession", async (arg?: TreeNode | SyncSession) =>
		{
			const session = await resolveSession(arg, provider);
			if (!session)
			{
				return;
			}
			await withErrorReporting(`pause "${label(session)}"`, async () =>
			{
				await client.pauseSession(session.identifier);
				await provider.refresh();
			});
		}),

		vscode.commands.registerCommand("mutagen.resumeSession", async (arg?: TreeNode | SyncSession) =>
		{
			const session = await resolveSession(arg, provider);
			if (!session)
			{
				return;
			}
			await withErrorReporting(`resume "${label(session)}"`, async () =>
			{
				await client.resumeSession(session.identifier);
				await provider.refresh();
			});
		}),

		vscode.commands.registerCommand("mutagen.terminateSession", async (arg?: TreeNode | SyncSession) =>
		{
			const session = await resolveSession(arg, provider);
			if (!session)
			{
				return;
			}
			const confirmed = await vscode.window.showWarningMessage(
				`Terminate sync session "${label(session)}"? This stops syncing but does not delete any files.`,
				{ modal: true },
				"Terminate"
			);
			if (confirmed !== "Terminate")
			{
				return;
			}
			await withErrorReporting(`terminate "${label(session)}"`, async () =>
			{
				await client.terminateSession(session.identifier);
				await provider.refresh();
			});
		}),

		vscode.commands.registerCommand("mutagen.resetSession", async (arg?: TreeNode | SyncSession) =>
		{
			const session = await resolveSession(arg, provider);
			if (!session)
			{
				return;
			}
			const confirmed = await vscode.window.showWarningMessage(
				`Reset synchronization history for "${label(session)}"? Mutagen will re-scan both endpoints from scratch.`,
				{ modal: true },
				"Reset"
			);
			if (confirmed !== "Reset")
			{
				return;
			}
			await withErrorReporting(`reset "${label(session)}"`, async () =>
			{
				await client.resetSession(session.identifier);
				await provider.refresh();
			});
		}),

		vscode.commands.registerCommand("mutagen.flushSession", async (arg?: TreeNode | SyncSession) =>
		{
			const session = await resolveSession(arg, provider);
			if (!session)
			{
				return;
			}
			await withErrorReporting(`flush "${label(session)}"`, async () =>
			{
				await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: `Flushing "${label(session)}"...` },
					() => client.flushSession(session.identifier)
				);
				await provider.refresh();
			});
		}),

		vscode.commands.registerCommand("mutagen.openSessionDetails", async (arg?: TreeNode | SyncSession) =>
		{
			const session = await resolveSession(arg, provider);
			if (!session)
			{
				return;
			}
			await withErrorReporting(`show details for "${label(session)}"`, async () =>
			{
				const details = await client.sessionDetails(session.identifier);
				const doc = await vscode.workspace.openTextDocument({ content: details, language: "plaintext" });
				await vscode.window.showTextDocument(doc, { preview: true });
			});
		}),

		vscode.commands.registerCommand("mutagen.showSessionQuickPick", async () =>
		{
			const sessions = provider.getVisibleSessions();
			if (sessions.length === 0)
			{
				const choice = await vscode.window.showInformationMessage("No Mutagen sync sessions yet.", "Create Sync Session");
				if (choice)
				{
					await vscode.commands.executeCommand("mutagen.createSession");
				}
				return;
			}

			const picked = await vscode.window.showQuickPick(
				sessions.map((session) => ({
					label: label(session),
					description: session.paused ? "paused" : session.status,
					session,
				})),
				{ placeHolder: "Select a Mutagen sync session" }
			);
			if (!picked)
			{
				return;
			}

			const action = await vscode.window.showQuickPick(
				[
					picked.session.paused
						? { label: "$(debug-start) Resume", action: "mutagen.resumeSession" }
						: { label: "$(debug-pause) Pause", action: "mutagen.pauseSession" },
					{ label: "$(sync) Flush", action: "mutagen.flushSession" },
					{ label: "$(info) Show Details", action: "mutagen.openSessionDetails" },
					{ label: "$(eye-closed) Hide", action: "mutagen.hideSession" },
					{ label: "$(trash) Terminate", action: "mutagen.terminateSession" },
				],
				{ placeHolder: `Action for "${label(picked.session)}"` }
			);
			if (!action)
			{
				return;
			}
			await vscode.commands.executeCommand(action.action, picked.session);
		})
	);
}
