import * as vscode from "vscode";
import { SessionTreeProvider } from "../views/sessionTreeProvider";
import { buildProjectYaml } from "./mutagenYaml";
import { logError, showOutputChannel } from "../util/logger";

/**
 * Registers the "Export Sessions..." command: lets the user pick sessions and
 * saves them as a mutagen project YAML file that can be shared and imported
 * elsewhere (via this extension's "Import Sessions..." or plain `mutagen
 * project start -f`).
 */
export function registerExportSessionsCommand(context: vscode.ExtensionContext, provider: SessionTreeProvider): void
{
	context.subscriptions.push(
		vscode.commands.registerCommand("mutagen.exportSessions", async () =>
		{
			const sessions = provider.getVisibleSessions();
			if (sessions.length === 0)
			{
				vscode.window.showInformationMessage("Mutagen: no sync sessions to export.");
				return;
			}

			const picks = await vscode.window.showQuickPick(
				sessions.map((session) => ({
					label: session.name || session.identifier,
					description: session.paused ? "paused" : session.status,
					picked: true,
					session,
				})),
				{ canPickMany: true, placeHolder: "Select sessions to export" }
			);
			if (!picks || picks.length === 0)
			{
				return;
			}

			const { yaml, uncertainSessionNames } = buildProjectYaml(picks.map((pick) => pick.session));

			const targetUri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file("mutagen-sessions.yml"),
				filters: { "Mutagen Project": ["yml", "yaml"] },
				saveLabel: "Export",
			});
			if (!targetUri)
			{
				return;
			}

			try
			{
				await vscode.workspace.fs.writeFile(targetUri, Buffer.from(yaml, "utf8"));
				const message = uncertainSessionNames.length
					? `Mutagen: exported ${picks.length} session(s) to ${targetUri.fsPath}. Remote endpoints are reconstructed best-effort — please double-check the connection string for: ${uncertainSessionNames.join(", ")}.`
					: `Mutagen: exported ${picks.length} session(s) to ${targetUri.fsPath}.`;
				vscode.window.showInformationMessage(message);
			}
			catch (err)
			{
				logError("Failed to export sessions", err);
				const choice = await vscode.window.showErrorMessage(`Mutagen: failed to export sessions: ${(err as Error).message}`, "Show Logs");
				if (choice === "Show Logs")
				{
					showOutputChannel();
				}
			}
		})
	);
}
