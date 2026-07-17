import * as vscode from "vscode";
import { MutagenClient } from "../mutagen/client";
import { SessionTreeProvider } from "../views/sessionTreeProvider";
import { SyncMode } from "../mutagen/types";
import { logError, showOutputChannel } from "../util/logger";

const SYNC_MODES: { label: string; mode: SyncMode; description: string }[] = [
	{ label: "Two-way safe (default)", mode: "two-way-safe", description: "Bidirectional sync; conflicts are left unresolved for manual review" },
	{ label: "Two-way resolved", mode: "two-way-resolved", description: "Bidirectional sync; alpha wins automatically on conflicts" },
	{ label: "One-way safe", mode: "one-way-safe", description: "Alpha → beta only; won't overwrite beta changes it doesn't understand" },
	{ label: "One-way replica", mode: "one-way-replica", description: "Alpha → beta only; beta is forced to exactly mirror alpha" },
];

/**
 * Prompts the user for one sync endpoint, either via a folder picker or free-text path/URL.
 */
async function pickEndpoint(role: "alpha" | "beta", workspaceRoot?: string): Promise<string | undefined>
{
	const choice = await vscode.window.showQuickPick(
		[
			{ label: "$(folder) Browse for a local folder...", mode: "browse" as const },
			{ label: "$(edit) Enter a path or URL manually...", mode: "manual" as const },
		],
		{ placeHolder: `Select the ${role === "alpha" ? "alpha (source)" : "beta (target)"} endpoint` }
	);
	if (!choice)
	{
		return undefined;
	}

	if (choice.mode === "browse")
	{
		const picked = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			defaultUri: workspaceRoot ? vscode.Uri.file(workspaceRoot) : undefined,
			openLabel: `Use as ${role}`,
		});
		return picked?.[0]?.fsPath;
	}

	return vscode.window.showInputBox({
		prompt: `Path or URL for the ${role} endpoint`,
		placeHolder: "e.g. C:\\path\\to\\folder, user@host:/remote/path, or docker://container/path",
		ignoreFocusOut: true,
	});
}

/**
 * Runs the interactive multi-step flow that collects endpoints, mode, and
 * options, then creates the resulting sync session.
 */
export async function runCreateSessionWizard(client: MutagenClient, provider: SessionTreeProvider): Promise<void>
{
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	const alpha = await pickEndpoint("alpha", workspaceRoot);
	if (!alpha)
	{
		return;
	}

	const beta = await pickEndpoint("beta", workspaceRoot);
	if (!beta)
	{
		return;
	}

	const modePick = await vscode.window.showQuickPick(
		SYNC_MODES.map((m) => ({ label: m.label, description: m.description, mode: m.mode })),
		{ placeHolder: "Select a synchronization mode" }
	);
	if (!modePick)
	{
		return;
	}

	const name = await vscode.window.showInputBox({
		prompt: "Session name (optional, makes the session easier to identify later)",
		placeHolder: "e.g. my-project (letters, digits, dash, underscore, dot — no spaces)",
		ignoreFocusOut: true,
		validateInput: (value) =>
			value && !/^[A-Za-z0-9_.-]+$/.test(value)
				? "Mutagen session names may only contain letters, digits, '-', '_', and '.' (no spaces)."
				: undefined,
	});
	if (name === undefined)
	{
		return;
	}

	const ignoresRaw = await vscode.window.showInputBox({
		prompt: "Ignore paths (optional, comma-separated)",
		placeHolder: "e.g. node_modules, .git, *.log",
		ignoreFocusOut: true,
	});
	if (ignoresRaw === undefined)
	{
		return;
	}
	const ignores = ignoresRaw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

	const extraArgsRaw = await vscode.window.showInputBox({
		prompt: "Extra `mutagen sync create` flags (optional, advanced)",
		placeHolder: "e.g. --symlink-mode=posix-raw --watch-mode=force-poll",
		ignoreFocusOut: true,
	});
	if (extraArgsRaw === undefined)
	{
		return;
	}
	const extraArgs = extraArgsRaw.trim() ? extraArgsRaw.trim().split(/\s+/) : [];

	try
	{
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: "Creating Mutagen sync session..." },
			() =>
				client.createSession({
					alpha,
					beta,
					name: name || undefined,
					mode: modePick.mode,
					ignores,
					extraArgs,
				})
		);
		await provider.refresh();
		vscode.window.showInformationMessage(`Better Mutagen: sync session "${name || `${alpha} ↔ ${beta}`}" created.`);
	}
	catch (err)
	{
		logError("Failed to create sync session", err);
		const choice = await vscode.window.showErrorMessage(`Better Mutagen: failed to create sync session: ${(err as Error).message}`, "Show Logs");
		if (choice === "Show Logs")
		{
			showOutputChannel();
		}
	}
}
