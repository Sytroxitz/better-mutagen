import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getPlatformTokens } from "./platform";
import { fetchRelease, pickAsset } from "./githubRelease";
import { downloadToFile, extractArchive } from "./download";
import { run } from "../util/exec";
import { log, logError } from "../util/logger";

/**
 * Resolves and downloads the mutagen executable used by this extension,
 * storing it inside the extension's own install directory.
 */
export class BinaryManager
{
	private resolvedPath: string | undefined;

	/**
   * Creates a manager bound to a specific extension context.
   */
	constructor(private readonly context: vscode.ExtensionContext)
	{}

	/**
   * Returns the current "mutagen" configuration section.
   */
	private get config()
	{
		return vscode.workspace.getConfiguration("mutagen");
	}

	/**
   * Returns the directory (inside the extension folder) that holds the managed binary.
   */
	private get binDir(): string
	{
		return path.join(this.context.extensionPath, "bin");
	}

	/** Resolves the path to a usable mutagen executable, downloading it if necessary. */
	async ensure(): Promise<string>
	{
		if (this.resolvedPath)
		{
			return this.resolvedPath;
		}

		const customPath = this.config.get<string>("customPath") ?? "";
		if (customPath)
		{
			if (!fs.existsSync(customPath))
			{
				throw new Error(`mutagen.binary.customPath is set to "${customPath}", but no file exists there.`);
			}
			log(`Using custom mutagen binary: ${customPath}`);
			this.resolvedPath = customPath;
			return customPath;
		}

		const tokens = getPlatformTokens();
		const canonicalPath = path.join(this.binDir, tokens.executableName);

		if (fs.existsSync(canonicalPath))
		{
			this.resolvedPath = canonicalPath;
			return canonicalPath;
		}

		await this.download(canonicalPath);
		this.resolvedPath = canonicalPath;
		return canonicalPath;
	}

	/** Forces a fresh download, replacing any existing extension-managed binary. */
	async reinstall(): Promise<string>
	{
		const tokens = getPlatformTokens();
		const canonicalPath = path.join(this.binDir, tokens.executableName);
		this.resolvedPath = undefined;
		if (fs.existsSync(this.binDir))
		{
			fs.rmSync(this.binDir, { recursive: true, force: true });
		}
		await this.download(canonicalPath);
		this.resolvedPath = canonicalPath;
		return canonicalPath;
	}

	/**
   * Resolves the configured release, downloads its matching asset, extracts
   * it, and copies its contents into the extension's bin directory.
   */
	private async download(canonicalPath: string): Promise<void>
	{
		const tokens = getPlatformTokens();
		const version = this.config.get<string>("version") ?? "latest";

		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Mutagen",
				cancellable: false,
			},
			async (progress) =>
			{
				progress.report({ message: `Resolving ${version} release...` });
				const release = await fetchRelease(version);
				const asset = pickAsset(release, tokens);
				log(`Selected mutagen asset "${asset.name}" from release ${release.tag_name}`);

				const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "better-mutagen-"));
				const archivePath = path.join(tmpDir, asset.name);

				try
				{
					let lastPercent = -1;
					progress.report({ message: `Downloading ${asset.name}...` });
					await downloadToFile(asset.browser_download_url, archivePath, (received, total) =>
					{
						if (!total)
						{
							return;
						}
						const percent = Math.floor((received / total) * 100);
						if (percent !== lastPercent)
						{
							lastPercent = percent;
							progress.report({ message: `Downloading ${asset.name}... ${percent}%` });
						}
					});

					progress.report({ message: "Extracting..." });
					const extractionDir = path.join(tmpDir, "extracted");
					const extractedDir = await extractArchive(archivePath, extractionDir, tokens.executableName);

					// Copy everything alongside the executable (e.g. mutagen-agents.tar.gz,
					// required for SSH/remote sync endpoints), not just the binary itself.
					fs.mkdirSync(this.binDir, { recursive: true });
					for (const entry of fs.readdirSync(extractedDir))
					{
						fs.cpSync(path.join(extractedDir, entry), path.join(this.binDir, entry), { recursive: true });
					}
					if (process.platform !== "win32")
					{
						fs.chmodSync(canonicalPath, 0o755);
					}

					progress.report({ message: "Verifying installation..." });
					const versionResult = await run(canonicalPath, ["version"]);
					log(`Installed mutagen at ${canonicalPath}: ${versionResult.stdout.trim()}`);
				}
				finally
				{
					fs.rmSync(tmpDir, { recursive: true, force: true });
				}
			}
		);
	}
}

/**
 * Ensures a mutagen binary is available, showing an error (with retry) instead
 * of throwing if installation fails.
 */
export async function ensureBinaryOrNotify(manager: BinaryManager): Promise<string | undefined>
{
	try
	{
		return await manager.ensure();
	}
	catch (err)
	{
		logError("Failed to install mutagen binary", err);
		const choice = await vscode.window.showErrorMessage(
			`Better Mutagen: failed to install the mutagen binary (${(err as Error).message}). ` +
        `You can set "mutagen.binary.customPath" to point at a manually installed copy instead.`,
			"Show Logs",
			"Retry"
		);
		if (choice === "Show Logs")
		{
			vscode.commands.executeCommand("mutagen.showLogs");
		}
		else if (choice === "Retry")
		{
			return ensureBinaryOrNotify(manager);
		}
		return undefined;
	}
}
