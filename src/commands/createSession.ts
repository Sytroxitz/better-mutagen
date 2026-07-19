import * as vscode from "vscode";
import { MutagenClient } from "../mutagen/client";
import { SessionTreeProvider } from "../views/sessionTreeProvider";
import { SyncMode, SyncSession } from "../mutagen/types";
import { reconstructEndpointSpec } from "../sessionConfig/mutagenYaml";
import { logError, showOutputChannel } from "../util/logger";

const SYNC_MODES: { label: string; mode: SyncMode; description: string }[] = [
	{ label: "Two-way safe (default)", mode: "two-way-safe", description: "Bidirectional sync; conflicts are left unresolved for manual review" },
	{ label: "Two-way resolved", mode: "two-way-resolved", description: "Bidirectional sync; alpha wins automatically on conflicts" },
	{ label: "One-way safe", mode: "one-way-safe", description: "Alpha → beta only; won't overwrite beta changes it doesn't understand" },
	{ label: "One-way replica", mode: "one-way-replica", description: "Alpha → beta only; beta is forced to exactly mirror alpha" },
];

/**
 * Prompts the user for one sync endpoint, either via a folder picker, free-text
 * path/URL, or (when editing) keeping the session's current value as-is.
 */
async function pickEndpoint(role: "alpha" | "beta", workspaceRoot?: string, currentValue?: string): Promise<string | undefined>
{
	const choices: { label: string; mode: "keep" | "browse" | "manual" }[] = [];
	if (currentValue)
	{
		choices.push({ label: `$(check) Keep current: ${currentValue}`, mode: "keep" });
	}
	choices.push(
		{ label: "$(folder) Browse for a local folder...", mode: "browse" },
		{ label: "$(edit) Enter a path or URL manually...", mode: "manual" }
	);

	const choice = await vscode.window.showQuickPick(choices, {
		placeHolder: `Select the ${role === "alpha" ? "alpha (source)" : "beta (target)"} endpoint`,
	});
	if (!choice)
	{
		return undefined;
	}

	if (choice.mode === "keep")
	{
		return currentValue;
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
		value: currentValue,
		ignoreFocusOut: true,
	});
}

/**
 * Runs the interactive multi-step flow that collects endpoints, mode, and
 * options, then creates the resulting sync session. If `editingSession` is
 * given, every step is pre-filled with its current settings, and confirming
 * terminates the old session and creates a new one in its place — Mutagen has
 * no way to edit a session in place, so this is the only way to "edit" one.
 */
export async function runCreateSessionWizard(client: MutagenClient, provider: SessionTreeProvider, editingSession?: SyncSession): Promise<void>
{
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	const currentAlpha = editingSession ? reconstructEndpointSpec(editingSession.alpha).spec : undefined;
	const currentBeta = editingSession ? reconstructEndpointSpec(editingSession.beta).spec : undefined;

	const alpha = await pickEndpoint("alpha", workspaceRoot, currentAlpha);
	if (!alpha)
	{
		return;
	}

	const beta = await pickEndpoint("beta", workspaceRoot, currentBeta);
	if (!beta)
	{
		return;
	}

	const modeChoices = SYNC_MODES.map((m) => ({
		label: m.mode === editingSession?.mode ? `${m.label} (current)` : m.label,
		description: m.description,
		mode: m.mode,
	}));
	if (editingSession)
	{
		modeChoices.sort((a, b) => (a.mode === editingSession.mode ? -1 : b.mode === editingSession.mode ? 1 : 0));
	}
	const modePick = await vscode.window.showQuickPick(modeChoices, { placeHolder: "Select a synchronization mode" });
	if (!modePick)
	{
		return;
	}

	const name = await vscode.window.showInputBox({
		prompt: "Session name (optional, makes the session easier to identify later)",
		placeHolder: "e.g. my-project (letters, digits, dash, underscore, dot — no spaces)",
		value: editingSession?.name ?? "",
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
		value: editingSession?.ignore?.paths?.join(", ") ?? "",
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

	if (editingSession)
	{
		const confirmed = await vscode.window.showWarningMessage(
			`Mutagen has no way to edit a session in place — "${editingSession.name || editingSession.identifier}" will be terminated and a new session created with the updated settings. Continue?`,
			{ modal: true },
			"Terminate && Recreate"
		);
		if (confirmed !== "Terminate && Recreate")
		{
			return;
		}
	}

	const actionLabel = editingSession ? "Updating" : "Creating";
	try
	{
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `${actionLabel} Mutagen sync session...` },
			async () =>
			{
				if (editingSession)
				{
					await client.terminateSession(editingSession.identifier);
				}
				await client.createSession({
					alpha,
					beta,
					name: name || undefined,
					mode: modePick.mode,
					ignores,
					extraArgs,
				});
			}
		);
		await provider.refresh();
		vscode.window.showInformationMessage(
			`Better Mutagen: sync session "${name || `${alpha} ↔ ${beta}`}" ${editingSession ? "updated" : "created"}.`
		);
	}
	catch (err)
	{
		logError(`Failed to ${editingSession ? "update" : "create"} sync session`, err);
		const choice = await vscode.window.showErrorMessage(
			`Better Mutagen: failed to ${editingSession ? "update" : "create"} sync session: ${(err as Error).message}`,
			"Show Logs"
		);
		if (choice === "Show Logs")
		{
			showOutputChannel();
		}
	}
}
