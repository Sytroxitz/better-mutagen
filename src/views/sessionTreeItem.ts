import * as vscode from "vscode";
import { SyncSession } from "../mutagen/types";
import { DetailNode, SessionNode } from "./treeNodes";

/**
 * Colors chosen from VS Code's generic `charts.*` theme palette so they stay
 * consistent (and theme-aware) without hardcoding hex values.
 */
function severityColor(severity: DetailNode["severity"]): vscode.ThemeColor | undefined
{
	switch (severity)
	{
		case "good":
			return new vscode.ThemeColor("charts.green");
		case "warning":
			return new vscode.ThemeColor("charts.yellow");
		case "error":
			return new vscode.ThemeColor("charts.red");
		default:
			return undefined;
	}
}

/**
 * Classifies a session's overall health so the tree/status bar can color-code it.
 */
function sessionSeverity(session: SyncSession): DetailNode["severity"]
{
	if (session.lastError || session.conflicts?.length)
	{
		return session.lastError ? "error" : "warning";
	}
	if (session.paused)
	{
		return "warning";
	}
	if (!session.alpha.connected || !session.beta.connected)
	{
		return "error";
	}
	if (session.status === "watching")
	{
		return "good";
	}
	return "neutral";
}

/**
 * Picks a codicon id representing a session's current state.
 */
function sessionIconId(session: SyncSession, severity: DetailNode["severity"]): string
{
	if (severity === "error")
	{
		return session.lastError ? "error" : "debug-disconnect";
	}
	if (severity === "warning")
	{
		return session.paused ? "debug-pause" : "warning";
	}
	if (severity === "good")
	{
		return "pass-filled";
	}
	return "circle-large-outline";
}

/**
 * Builds the short status text shown next to a session's label.
 */
function statusLine(session: SyncSession): string
{
	if (session.paused)
	{
		return "paused";
	}
	if (session.lastError)
	{
		return "error";
	}
	if (session.conflicts?.length)
	{
		return `${session.conflicts.length} conflict(s)`;
	}
	return session.status;
}

/**
 * Tree row representing one sync session, with a color-coded icon and a
 * markdown tooltip summarizing its endpoints and status.
 */
export class SessionTreeItem extends vscode.TreeItem
{
	/**
   * Builds the tree item from a session node, dimming it if marked hidden.
   */
	constructor(node: SessionNode)
	{
		const session = node.session;
		super(session.name || session.identifier, vscode.TreeItemCollapsibleState.Expanded);

		const severity = sessionSeverity(session);

		this.id = session.identifier;
		this.description = node.hidden ? `${statusLine(session)} (hidden)` : statusLine(session);
		this.iconPath = new vscode.ThemeIcon(sessionIconId(session, severity), node.hidden ? undefined : severityColor(severity));
		this.tooltip = new vscode.MarkdownString(
			[
				`**${session.name || session.identifier}**`,
				``,
				`- Identifier: \`${session.identifier}\``,
				`- Status: ${session.status}${session.paused ? " (paused)" : ""}`,
				`- Mode: ${session.mode ?? "default"}`,
				`- Alpha: \`${session.alpha.path ?? session.alpha.host ?? "?"}\` (${session.alpha.connected ? "connected" : "disconnected"})`,
				`- Beta: \`${session.beta.path ?? session.beta.host ?? "?"}\` (${session.beta.connected ? "connected" : "disconnected"})`,
				session.conflicts?.length ? `- Conflicts: ${session.conflicts.length}` : "",
				session.lastError ? `- Last error: ${session.lastError}` : "",
			]
				.filter(Boolean)
				.join("\n")
		);

		const flags = ["session"];
		flags.push(session.paused ? "canResume" : "canPause");
		flags.push(node.hidden ? "hidden" : "visible");
		this.contextValue = flags.join(" ");
	}
}

/**
 * Tree row representing one informational detail line under an expanded session.
 */
export class DetailTreeItem extends vscode.TreeItem
{
	/**
   * Builds the tree item from a detail node.
   */
	constructor(node: DetailNode)
	{
		super(node.label, vscode.TreeItemCollapsibleState.None);
		this.description = node.description;
		this.iconPath = new vscode.ThemeIcon(node.iconId, severityColor(node.severity));
		this.tooltip = node.tooltip ?? `${node.label}${node.description ? `: ${node.description}` : ""}`;
		this.command = node.command;
		// Deliberately doesn't contain "session" so it never matches the
		// view/item/context `viewItem =~ /session/` clauses used for session actions.
		this.contextValue = "mutagenDetailRow";
	}
}
