import * as vscode from "vscode";
import { MutagenClient } from "../mutagen/client";
import { SessionTreeProvider } from "../views/sessionTreeProvider";
import { BinaryManager } from "../binary/binaryManager";
import { runCreateSessionWizard } from "./createSession";
import { registerSessionActionCommands } from "./sessionActions";
import { registerVisibilityCommands } from "./visibilityActions";
import { registerExportSessionsCommand } from "../sessionConfig/exportSessions";
import { registerImportSessionsCommand } from "../sessionConfig/importSessions";
import { logError, showOutputChannel } from "../util/logger";

/**
 * Registers the top-level (non session-action) commands: create session,
 * reinstall binary, session visibility, and session export/import.
 */
export function registerCommands(
	context: vscode.ExtensionContext,
	client: MutagenClient,
	provider: SessionTreeProvider,
	binaryManager: BinaryManager
): void
{
	registerSessionActionCommands(context, client, provider);
	registerVisibilityCommands(context, provider);
	registerExportSessionsCommand(context, provider);
	registerImportSessionsCommand(context, client, provider);

	context.subscriptions.push(
		vscode.commands.registerCommand("mutagen.createSession", () => runCreateSessionWizard(client, provider)),

		vscode.commands.registerCommand("mutagen.reinstallBinary", async () =>
		{
			try
			{
				await binaryManager.reinstall();
				await client.ensureDaemonRunning();
				await provider.refresh();
				vscode.window.showInformationMessage("Mutagen: binary reinstalled successfully.");
			}
			catch (err)
			{
				logError("Failed to reinstall mutagen binary", err);
				const choice = await vscode.window.showErrorMessage(
					`Mutagen: failed to reinstall the binary: ${(err as Error).message}`,
					"Show Logs"
				);
				if (choice === "Show Logs")
				{
					showOutputChannel();
				}
			}
		})
	);
}
