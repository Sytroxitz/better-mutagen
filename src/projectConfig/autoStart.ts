import * as vscode from "vscode";
import { MutagenClient } from "../mutagen/client";
import { findProjectFiles } from "./projectConfigLoader";
import { logError, showOutputChannel } from "../util/logger";

/**
 * Starts each workspace folder's project file sessions, if auto-start is enabled.
 */
export async function autoStartProjectSessions(client: MutagenClient): Promise<void>
{
	const enabled = vscode.workspace.getConfiguration("mutagen").get<boolean>("autoStartProjectOnOpen");
	if (!enabled)
	{
		return;
	}

	for (const project of findProjectFiles())
	{
		try
		{
			await client.startProject(project.fileName, project.workspaceFolder.uri.fsPath);
		}
		catch (err)
		{
			logError(`Failed to auto-start project sessions from ${project.absolutePath}`, err);
			const choice = await vscode.window.showWarningMessage(
				`Better Mutagen: failed to start project sessions from "${project.fileName}" in ${project.workspaceFolder.name}: ${(err as Error).message}`,
				"Show Logs"
			);
			if (choice === "Show Logs")
			{
				showOutputChannel();
			}
		}
	}
}

/**
 * Registers the manual "start/stop project sessions" commands.
 */
export function registerProjectCommands(context: vscode.ExtensionContext, client: MutagenClient, refresh: () => Promise<void>): void
{
	context.subscriptions.push(
		vscode.commands.registerCommand("mutagen.startProjectSessions", async () =>
		{
			const projects = findProjectFiles();
			if (projects.length === 0)
			{
				vscode.window.showInformationMessage("Better Mutagen: no project configuration file found in the open workspace folder(s).");
				return;
			}
			for (const project of projects)
			{
				try
				{
					await client.startProject(project.fileName, project.workspaceFolder.uri.fsPath);
				}
				catch (err)
				{
					logError(`Failed to start project sessions from ${project.absolutePath}`, err);
					const choice = await vscode.window.showErrorMessage(
						`Better Mutagen: failed to start project sessions from "${project.fileName}": ${(err as Error).message}`,
						"Show Logs"
					);
					if (choice === "Show Logs")
					{
						showOutputChannel();
					}
				}
			}
			await refresh();
		}),

		vscode.commands.registerCommand("mutagen.stopProjectSessions", async () =>
		{
			const projects = findProjectFiles();
			if (projects.length === 0)
			{
				vscode.window.showInformationMessage("Better Mutagen: no project configuration file found in the open workspace folder(s).");
				return;
			}
			for (const project of projects)
			{
				try
				{
					await client.terminateProject(project.fileName, project.workspaceFolder.uri.fsPath);
				}
				catch (err)
				{
					logError(`Failed to stop project sessions from ${project.absolutePath}`, err);
					const choice = await vscode.window.showErrorMessage(
						`Better Mutagen: failed to stop project sessions from "${project.fileName}": ${(err as Error).message}`,
						"Show Logs"
					);
					if (choice === "Show Logs")
					{
						showOutputChannel();
					}
				}
			}
			await refresh();
		})
	);
}
