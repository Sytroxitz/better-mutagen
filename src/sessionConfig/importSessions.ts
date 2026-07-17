import * as vscode from "vscode";
import * as path from "path";
import { MutagenClient } from "../mutagen/client";
import { SessionTreeProvider } from "../views/sessionTreeProvider";
import { logError, showOutputChannel } from "../util/logger";

/**
 * Registers the "Import Sessions..." command: lets the user pick a mutagen
 * project YAML file (e.g. one produced by "Export Sessions...") and starts
 * the sync sessions it defines.
 */
export function registerImportSessionsCommand(context: vscode.ExtensionContext, client: MutagenClient, provider: SessionTreeProvider): void
{
	context.subscriptions.push(
		vscode.commands.registerCommand("mutagen.importSessions", async () =>
		{
			const picked = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: { "Mutagen Project": ["yml", "yaml"] },
				openLabel: "Import",
			});
			const fileUri = picked?.[0];
			if (!fileUri)
			{
				return;
			}

			const fileName = path.basename(fileUri.fsPath);
			const confirmed = await vscode.window.showWarningMessage(
				`Import and start the sync sessions defined in "${fileName}"?`,
				{ modal: true },
				"Import"
			);
			if (confirmed !== "Import")
			{
				return;
			}

			try
			{
				await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: "Importing Mutagen sessions..." },
					() => client.startProject(fileUri.fsPath, path.dirname(fileUri.fsPath))
				);
				await provider.refresh();
				vscode.window.showInformationMessage(`Better Mutagen: sessions from "${fileName}" imported.`);
			}
			catch (err)
			{
				logError("Failed to import sessions", err);
				const choice = await vscode.window.showErrorMessage(`Better Mutagen: failed to import sessions: ${(err as Error).message}`, "Show Logs");
				if (choice === "Show Logs")
				{
					showOutputChannel();
				}
			}
		})
	);
}
