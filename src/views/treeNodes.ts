import * as vscode from "vscode";
import { SyncSession } from "../mutagen/types";

export interface SessionNode
{
	kind: "session";
	session: SyncSession;
	hidden: boolean;
}

export interface DetailNode
{
	kind: "detail";
	id: string;
	parent: SyncSession;
	label: string;
	description?: string;
	severity: "neutral" | "good" | "warning" | "error";
	iconId: string;
	tooltip?: string;
	command?: vscode.Command;
}

export type TreeNode = SessionNode | DetailNode;

/**
 * Type guard distinguishing a session row from a detail row.
 */
export function isSessionNode(node: TreeNode): node is SessionNode
{
	return node.kind === "session";
}

/**
 * Formats a byte count as a human-readable size (e.g. "1.5 MB").
 */
function formatBytes(bytes: number): string
{
	if (bytes < 1024)
	{
		return `${bytes} B`;
	}
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1)
	{
		value /= 1024;
		unitIndex++;
	}
	return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Builds the detail row describing one endpoint (alpha or beta) of a session.
 */
function endpointDetail(id: string, role: "Alpha" | "Beta", parent: SyncSession): DetailNode
{
	const endpoint = role === "Alpha" ? parent.alpha : parent.beta;
	const location = endpoint.path ?? endpoint.host ?? "?";

	if (!endpoint.connected)
	{
		return {
			kind: "detail",
			id,
			parent,
			label: `${role}: ${location}`,
			description: "disconnected",
			severity: "error",
			iconId: "debug-disconnect",
		};
	}

	const parts: string[] = [];
	if (endpoint.directories !== undefined)
	{
		parts.push(`${endpoint.directories} dir`);
	}
	if (endpoint.files !== undefined)
	{
		parts.push(`${endpoint.files} files`);
	}
	if (endpoint.totalFileSize !== undefined)
	{
		parts.push(formatBytes(endpoint.totalFileSize));
	}

	return {
		kind: "detail",
		id,
		parent,
		label: `${role}: ${location}`,
		description: parts.length ? parts.join(", ") : "connected",
		severity: "good",
		iconId: role === "Alpha" ? "arrow-circle-right" : "arrow-circle-left",
	};
}

/** Builds the informational child rows shown when a session is expanded. */
export function buildDetailNodes(session: SyncSession): DetailNode[]
{
	const nodes: DetailNode[] = [
		endpointDetail(`${session.identifier}:alpha`, "Alpha", session),
		endpointDetail(`${session.identifier}:beta`, "Beta", session),
	];

	nodes.push({
		kind: "detail",
		id: `${session.identifier}:mode`,
		parent: session,
		label: `Mode: ${session.mode ?? "default"}`,
		severity: "neutral",
		iconId: "arrow-swap",
	});

	if (session.successfulCycles !== undefined)
	{
		nodes.push({
			kind: "detail",
			id: `${session.identifier}:cycles`,
			parent: session,
			label: `Successful cycles: ${session.successfulCycles}`,
			severity: "neutral",
			iconId: "history",
		});
	}

	if (session.conflicts?.length)
	{
		nodes.push({
			kind: "detail",
			id: `${session.identifier}:conflicts`,
			parent: session,
			label: `${session.conflicts.length} conflict(s)`,
			description: "needs manual resolution",
			severity: "warning",
			iconId: "warning",
			tooltip: "Use \"Show Session Details\" for the full conflict list.",
		});
	}

	if (session.lastError)
	{
		nodes.push({
			kind: "detail",
			id: `${session.identifier}:error`,
			parent: session,
			label: "Last error",
			description: session.lastError,
			severity: "error",
			iconId: "error",
			tooltip: session.lastError,
		});
	}

	if (session.creationTime)
	{
		const created = new Date(session.creationTime);
		nodes.push({
			kind: "detail",
			id: `${session.identifier}:created`,
			parent: session,
			label: "Created",
			description: isNaN(created.getTime()) ? session.creationTime : created.toLocaleString(),
			severity: "neutral",
			iconId: "calendar",
		});
	}

	nodes.push({
		kind: "detail",
		id: `${session.identifier}:showDetails`,
		parent: session,
		label: "Show full details...",
		severity: "neutral",
		iconId: "list-tree",
		command: { command: "mutagen.openSessionDetails", title: "Show Session Details", arguments: [session] },
	});

	return nodes;
}
