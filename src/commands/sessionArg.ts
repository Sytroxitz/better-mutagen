import * as vscode from "vscode";
import { SessionTreeProvider } from "../views/sessionTreeProvider";
import { SyncSession } from "../mutagen/types";
import { TreeNode } from "../views/treeNodes";

/**
 * Returns a human-friendly label for a session (its name, or its identifier as a fallback).
 */
export function label(session: SyncSession): string
{
	return session.name || session.identifier;
}

/**
 * Command handlers can be invoked several ways: a tree context-menu click
 * passes a TreeNode, a quick-pick flow passes a raw SyncSession, and (as
 * observed in practice) VS Code can also invoke a command with no argument
 * at all. This normalizes all three, falling back to an interactive picker
 * instead of crashing when nothing usable was passed.
 */
export async function resolveSession(
	arg: TreeNode | SyncSession | undefined,
	provider: SessionTreeProvider
): Promise<SyncSession | undefined>
{
	if (arg && "kind" in arg && arg.kind === "session")
	{
		return arg.session;
	}
	if (arg && "identifier" in arg)
	{
		return arg;
	}

	const sessions = provider.getVisibleSessions();
	if (sessions.length === 0)
	{
		vscode.window.showInformationMessage("Mutagen: no sync sessions to act on yet.");
		return undefined;
	}
	const picked = await vscode.window.showQuickPick(
		sessions.map((session) => ({ label: label(session), description: session.paused ? "paused" : session.status, session })),
		{ placeHolder: "Select a Mutagen sync session" }
	);
	return picked?.session;
}
