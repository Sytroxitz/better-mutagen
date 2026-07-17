import * as vscode from "vscode";
import { SessionTreeProvider } from "./sessionTreeProvider";

/**
 * Aggregate status bar item summarizing all sync sessions, with color cues for warnings/errors.
 */
export class StatusBarController implements vscode.Disposable
{
	private readonly item: vscode.StatusBarItem;
	private readonly subscription: vscode.Disposable;

	/**
   * Creates and shows the status bar item, wiring it to the given provider's updates.
   */
	constructor(private readonly provider: SessionTreeProvider)
	{
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.item.command = "mutagen.showSessionQuickPick";
		this.item.show();
		this.subscription = provider.onDidChangeTreeData(() => this.update());
		this.update();
	}

	/**
   * Recomputes the status bar text, tooltip, and background color from the current sessions.
   */
	private update(): void
	{
		const error = this.provider.getLastError();
		if (error)
		{
			this.item.text = "$(alert) Better Mutagen: error";
			this.item.tooltip = error;
			this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
			this.item.color = undefined;
			return;
		}

		const sessions = this.provider.getSessions();
		if (sessions.length === 0)
		{
			this.item.text = "$(sync) Mutagen";
			this.item.tooltip = "No sync sessions — click to create one";
			this.item.backgroundColor = undefined;
			return;
		}

		const paused = sessions.filter((s) => s.paused).length;
		const conflicts = sessions.filter((s) => s.conflicts?.length).length;
		const errored = sessions.filter((s) => s.lastError).length;
		const disconnected = sessions.filter((s) => !s.alpha.connected || !s.beta.connected).length;
		const active = sessions.length - paused;

		const parts = [`${active} active`];
		if (paused)
		{
			parts.push(`${paused} paused`);
		}
		if (conflicts)
		{
			parts.push(`${conflicts} conflict(s)`);
		}
		if (errored)
		{
			parts.push(`${errored} error(s)`);
		}

		const icon = errored || disconnected ? "$(error)" : conflicts ? "$(warning)" : paused === sessions.length ? "$(debug-pause)" : "$(sync)";
		this.item.text = `${icon} Better Mutagen: ${parts.join(", ")}`;
		this.item.tooltip = `${sessions.length} sync session(s) — click for actions`;

		if (errored || disconnected)
		{
			this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
		}
		else if (conflicts || paused)
		{
			this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
		}
		else
		{
			this.item.backgroundColor = undefined;
		}
	}

	/**
   * Disposes the status bar item and its subscription.
   */
	dispose(): void
	{
		this.item.dispose();
		this.subscription.dispose();
	}
}
