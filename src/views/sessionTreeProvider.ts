import * as vscode from "vscode";
import { MutagenClient } from "../mutagen/client";
import { SyncSession } from "../mutagen/types";
import { logError } from "../util/logger";
import { DetailTreeItem, SessionTreeItem } from "./sessionTreeItem";
import { buildDetailNodes, isSessionNode, TreeNode } from "./treeNodes";

const HIDDEN_SESSIONS_KEY = "mutagen.hiddenSessionIds";
const SHOW_HIDDEN_CONTEXT_KEY = "mutagen.showHidden";

/**
 * Supplies the Sync Sessions tree view with data, polling mutagen for session
 * status while the view is visible and tracking which sessions are hidden.
 */
export class SessionTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private sessions: SyncSession[] = [];
	private lastError: string | undefined;
	private timer: ReturnType<typeof setInterval> | undefined;
	private view: vscode.TreeView<TreeNode> | undefined;
	private refreshing = false;
	private hiddenIds: Set<string>;
	private showHidden = false;

	/**
   * Creates the provider, loading any previously hidden session ids from global state.
   */
	constructor(
    private readonly client: MutagenClient,
    private readonly context: vscode.ExtensionContext
	)
	{
		this.hiddenIds = new Set(context.globalState.get<string[]>(HIDDEN_SESSIONS_KEY, []));
		void vscode.commands.executeCommand("setContext", SHOW_HIDDEN_CONTEXT_KEY, this.showHidden);
	}

	/**
   * Binds the provider to its tree view so it can poll only while visible.
   */
	attachView(view: vscode.TreeView<TreeNode>): void
	{
		this.view = view;
		view.onDidChangeVisibility(() => this.reschedule());
		this.reschedule();
	}

	/**
   * Returns the message from the last failed refresh, if any.
   */
	getLastError(): string | undefined
	{
		return this.lastError;
	}

	/** Flat list of every known session (including hidden ones), used internally. */
	getSessions(): SyncSession[]
	{
		return this.sessions;
	}

	/** Flat list of sessions that should currently be surfaced to the user (status bar, quick picks). */
	getVisibleSessions(): SyncSession[]
	{
		return this.sessions.filter((session) => this.showHidden || !this.hiddenIds.has(session.identifier));
	}

	/**
   * Returns whether hidden sessions are currently being shown (dimmed) in the tree.
   */
	isShowingHidden(): boolean
	{
		return this.showHidden;
	}

	/**
   * Flips whether hidden sessions are shown (dimmed) in the tree, and re-renders.
   */
	toggleShowHidden(): void
	{
		this.showHidden = !this.showHidden;
		void vscode.commands.executeCommand("setContext", SHOW_HIDDEN_CONTEXT_KEY, this.showHidden);
		this._onDidChangeTreeData.fire();
	}

	/**
   * Marks a session as hidden and persists the choice, then re-renders.
   */
	async hideSession(identifier: string): Promise<void>
	{
		this.hiddenIds.add(identifier);
		await this.persistHiddenIds();
		this._onDidChangeTreeData.fire();
	}

	/**
   * Clears a session's hidden flag and persists the choice, then re-renders.
   */
	async unhideSession(identifier: string): Promise<void>
	{
		this.hiddenIds.delete(identifier);
		await this.persistHiddenIds();
		this._onDidChangeTreeData.fire();
	}

	/**
   * Saves the current hidden-session id set to global state.
   */
	private async persistHiddenIds(): Promise<void>
	{
		await this.context.globalState.update(HIDDEN_SESSIONS_KEY, [...this.hiddenIds]);
	}

	/**
   * Converts a tree node into the VS Code TreeItem used to render it.
   */
	getTreeItem(node: TreeNode): vscode.TreeItem
	{
		return isSessionNode(node) ? new SessionTreeItem(node) : new DetailTreeItem(node);
	}

	/**
   * Returns the root session rows, or a session's detail rows when expanding it.
   */
	getChildren(node?: TreeNode): TreeNode[]
	{
		if (!node)
		{
			return this.sessions
				.filter((session) => this.showHidden || !this.hiddenIds.has(session.identifier))
				.map((session) => ({ kind: "session", session, hidden: this.hiddenIds.has(session.identifier) }));
		}
		if (isSessionNode(node))
		{
			return buildDetailNodes(node.session);
		}
		return [];
	}

	/**
   * Re-fetches the session list from mutagen and notifies the tree view of the change.
   */
	async refresh(): Promise<void>
	{
		if (this.refreshing)
		{
			return;
		}
		this.refreshing = true;
		try
		{
			this.sessions = await this.client.listSessions();
			this.lastError = undefined;
		}
		catch (err)
		{
			this.lastError = (err as Error).message;
			logError("Failed to list mutagen sessions", err);
		}
		finally
		{
			this.refreshing = false;
			this._onDidChangeTreeData.fire();
		}
	}

	/**
   * Starts or stops the polling timer depending on whether the view is currently visible.
   */
	private reschedule(): void
	{
		if (this.timer)
		{
			clearInterval(this.timer);
			this.timer = undefined;
		}
		if (!this.view?.visible)
		{
			return;
		}
		void this.refresh();
		const intervalMs = vscode.workspace.getConfiguration("mutagen").get<number>("refreshIntervalMs") ?? 2000;
		this.timer = setInterval(() => void this.refresh(), intervalMs);
	}

	/**
   * Stops polling and disposes the change-event emitter.
   */
	dispose(): void
	{
		if (this.timer)
		{
			clearInterval(this.timer);
		}
		this._onDidChangeTreeData.dispose();
	}
}
