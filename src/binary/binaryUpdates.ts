import * as vscode from "vscode";
import { BinaryManager, versionsEqual } from "./binaryManager";
import { fetchRelease } from "./githubRelease";
import { MutagenClient } from "../mutagen/client";
import { SessionTreeProvider } from "../views/sessionTreeProvider";
import { log, logError, showOutputChannel } from "../util/logger";

/** globalState key remembering a release the user chose to skip. */
const SKIPPED_VERSION_KEY = "mutagen.skippedUpdateVersion";

/**
 * Reinstalls the managed binary to whatever version is currently configured,
 * restarts the daemon so the new binary actually takes effect, and refreshes
 * the view. Errors are surfaced but never thrown.
 */
async function reinstallManagedBinary(
	binaryManager: BinaryManager,
	client: MutagenClient,
	provider: SessionTreeProvider,
	successMessage: string
): Promise<void>
{
	try
	{
		// Suspend polling while the binary is swapped and the daemon restarts, so
		// the view doesn't report transient errors during the changeover.
		await provider.withPollingSuspended(async () =>
		{
			// reinstall() stops the daemon (so the old, locked binary can be
			// removed on Windows) before swapping; start it again afterwards.
			await binaryManager.reinstall();
			await client.ensureDaemonRunning();
		});
		await provider.refresh();
		vscode.window.showInformationMessage(successMessage);
	}
	catch (err)
	{
		logError("Failed to install mutagen binary", err);
		const choice = await vscode.window.showErrorMessage(
			`Better Mutagen: failed to install the mutagen binary: ${(err as Error).message}`,
			"Show Logs"
		);
		if (choice === "Show Logs")
		{
			showOutputChannel();
		}
	}
}

/**
 * Checks GitHub for a newer mutagen release and, if one exists, offers to
 * update. Only runs when the extension manages its own binary and the version
 * is set to "latest" — if the user pinned a specific version they want exactly
 * that one, so we never nag them. Network/parse failures are logged and ignored.
 */
export async function checkForMutagenUpdate(
	context: vscode.ExtensionContext,
	binaryManager: BinaryManager,
	client: MutagenClient,
	provider: SessionTreeProvider
): Promise<void>
{
	try
	{
		if (binaryManager.isUsingCustomPath())
		{
			return;
		}
		if (binaryManager.getConfiguredVersion() !== "latest")
		{
			return;
		}

		const installed = binaryManager.getInstalledVersion();
		if (!installed)
		{
			return;
		}

		const release = await fetchRelease("latest");
		const latest = release.tag_name;
		if (versionsEqual(installed, latest))
		{
			return;
		}

		const skipped = context.globalState.get<string>(SKIPPED_VERSION_KEY);
		if (skipped && versionsEqual(skipped, latest))
		{
			log(`Mutagen ${latest} is available but was skipped by the user.`);
			return;
		}

		log(`Mutagen update available: installed ${installed}, latest ${latest}.`);
		const choice = await vscode.window.showInformationMessage(
			`Better Mutagen: Mutagen ${latest} is available (you have ${installed}).`,
			"Update Now",
			"Later",
			"Skip This Version"
		);

		if (choice === "Update Now")
		{
			await reinstallManagedBinary(
				binaryManager,
				client,
				provider,
				`Better Mutagen: updated to Mutagen ${latest}.`
			);
		}
		else if (choice === "Skip This Version")
		{
			await context.globalState.update(SKIPPED_VERSION_KEY, latest);
		}
	}
	catch (err)
	{
		logError("Failed to check for mutagen updates", err);
	}
}

/**
 * Wires up binary-version maintenance: reacts to changes of the version /
 * custom-path settings, and runs an initial update check on activation.
 */
export function registerBinaryUpdates(
	context: vscode.ExtensionContext,
	binaryManager: BinaryManager,
	client: MutagenClient,
	provider: SessionTreeProvider
): void
{
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (event) =>
		{
			// Switching the custom path changes which binary the daemon/client are
			// bound to; that only takes effect after a reload.
			if (event.affectsConfiguration("mutagen.binary.customPath"))
			{
				const choice = await vscode.window.showInformationMessage(
					"Better Mutagen: the custom mutagen binary path changed. Reload the window to apply it.",
					"Reload Window"
				);
				if (choice === "Reload Window")
				{
					vscode.commands.executeCommand("workbench.action.reloadWindow");
				}
				return;
			}

			// Switching the version reinstalls the newly requested release. reinstall()
			// wipes the bin directory first, so the previously installed version is
			// removed — only ever the newest (or the explicitly chosen) version stays.
			if (event.affectsConfiguration("mutagen.binary.version"))
			{
				// Ignore version changes the extension itself wrote (e.g. the
				// fallback-to-latest reset), which are already installed.
				if (binaryManager.consumeSuppressedVersionChange())
				{
					return;
				}
				if (binaryManager.isUsingCustomPath())
				{
					return;
				}
				// A deliberate version switch supersedes any earlier "skip".
				await context.globalState.update(SKIPPED_VERSION_KEY, undefined);

				const version = binaryManager.getConfiguredVersion();
				const label = version === "latest" ? "the latest Mutagen release" : `Mutagen ${version}`;
				await reinstallManagedBinary(
					binaryManager,
					client,
					provider,
					`Better Mutagen: switched to ${label}.`
				);
			}
		})
	);

	void checkForMutagenUpdate(context, binaryManager, client, provider);
}
