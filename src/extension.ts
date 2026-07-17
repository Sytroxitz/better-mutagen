import * as vscode from "vscode";
import { BinaryManager, ensureBinaryOrNotify } from "./binary/binaryManager";
import { MutagenClient } from "./mutagen/client";
import { TreeNode } from "./views/treeNodes";
import { SessionTreeProvider } from "./views/sessionTreeProvider";
import { StatusBarController } from "./views/statusBar";
import { registerCommands } from "./commands/index";
import { registerProjectCommands, autoStartProjectSessions } from "./projectConfig/autoStart";
import { initLogger, log, logError, showOutputChannel } from "./util/logger";

interface Setup
{
	client: MutagenClient;
}

/**
 * Ensures the mutagen binary is installed and the daemon is running, returning a ready-to-use client.
 */
async function setUpMutagen(binaryManager: BinaryManager): Promise<Setup | undefined>
{
	const binaryPath = await ensureBinaryOrNotify(binaryManager);
	if (!binaryPath)
	{
		return undefined;
	}

	const client = new MutagenClient(binaryPath);

	if (vscode.workspace.getConfiguration("mutagen").get<boolean>("autoStartDaemon"))
	{
		try
		{
			await client.ensureDaemonRunning();
		}
		catch (err)
		{
			logError("Failed to start the mutagen daemon", err);
		}
	}

	return { client };
}

/**
 * VS Code extension entry point: sets up the binary/daemon, tree view, status bar, and commands.
 */
export async function activate(context: vscode.ExtensionContext): Promise<void>
{
	initLogger(context);
	log("Better Mutagen activating...");

	context.subscriptions.push(vscode.commands.registerCommand("mutagen.showLogs", () => showOutputChannel()));

	const binaryManager = new BinaryManager(context);
	const setup = await setUpMutagen(binaryManager);

	if (!setup)
	{
		context.subscriptions.push(
			vscode.commands.registerCommand("mutagen.reinstallBinary", async () =>
			{
				const result = await setUpMutagen(binaryManager);
				if (result)
				{
					vscode.window
						.showInformationMessage(
							"Mutagen: binary installed successfully. Reload the window to finish setting up Better Mutagen.",
							"Reload Window"
						)
						.then((choice) =>
						{
							if (choice === "Reload Window")
							{
								vscode.commands.executeCommand("workbench.action.reloadWindow");
							}
						});
				}
			})
		);
		log("Better Mutagen activation halted: mutagen binary is not available yet.");
		return;
	}

	const { client } = setup;

	const provider = new SessionTreeProvider(client, context);
	context.subscriptions.push(provider);

	const view = vscode.window.createTreeView<TreeNode>("mutagenSessions", { treeDataProvider: provider });
	context.subscriptions.push(view);
	provider.attachView(view);

	const statusBar = new StatusBarController(provider);
	context.subscriptions.push(statusBar);

	registerCommands(context, client, provider, binaryManager);
	registerProjectCommands(context, client, () => provider.refresh());

	await autoStartProjectSessions(client);
	await provider.refresh();

	log("Better Mutagen activated.");
}

/**
 * VS Code extension teardown hook. Deliberately a no-op — see the comment below.
 */
export function deactivate(): void
{
	// Intentionally does NOT stop the mutagen daemon: sync sessions should keep
	// running in the background even while VS Code is closed. The daemon is
	// only ever stopped from src/uninstall.ts, right before the extension
	// (and its bundled binary) is removed from disk.
}
