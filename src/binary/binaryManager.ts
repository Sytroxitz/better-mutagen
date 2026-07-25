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
	private suppressNextVersionChange = false;

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

	/**
   * Path to the small marker file that records which release tag the currently
   * installed managed binary came from.
   */
	private get versionFile(): string
	{
		return path.join(this.binDir, ".installed-version");
	}

	/** Returns the configured absolute path to a manually installed binary, or "" if unset. */
	getCustomPath(): string
	{
		return this.config.get<string>("binary.customPath") ?? "";
	}

	/** Returns whether the user has pointed the extension at a manually installed binary. */
	isUsingCustomPath(): boolean
	{
		return !!this.getCustomPath();
	}

	/** Returns the configured release to install ("latest" or a specific tag). */
	getConfiguredVersion(): string
	{
		return this.config.get<string>("binary.version") || "latest";
	}

	/**
   * Returns the release tag of the currently installed managed binary, or
   * undefined if no managed binary is installed / the marker is missing.
   */
	getInstalledVersion(): string | undefined
	{
		try
		{
			if (!fs.existsSync(this.versionFile))
			{
				return undefined;
			}
			return fs.readFileSync(this.versionFile, "utf8").trim() || undefined;
		}
		catch
		{
			return undefined;
		}
	}

	/** Resolves the path to a usable mutagen executable, downloading it if necessary. */
	async ensure(): Promise<string>
	{
		if (this.resolvedPath)
		{
			return this.resolvedPath;
		}

		const customPath = this.getCustomPath();
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
			// Binaries installed before version tracking existed have no marker
			// file. Backfill one from the binary itself so update checks and
			// version reconciliation have something to compare against.
			if (!this.getInstalledVersion())
			{
				await this.backfillVersionMarker(canonicalPath);
			}

			// If a specific version is pinned and the installed binary is a
			// different one, reconcile by reinstalling the pinned version. (For
			// "latest" we leave the existing binary in place; the update check
			// handles offering newer releases.)
			const desired = this.getConfiguredVersion();
			const installed = this.getInstalledVersion();
			if (desired !== "latest" && installed && !versionsEqual(installed, desired))
			{
				log(`Installed mutagen ${installed} differs from pinned ${desired}; reinstalling.`);
				return this.reinstall();
			}

			this.resolvedPath = canonicalPath;
			return canonicalPath;
		}

		await this.downloadWithLatestFallback(this.binDir);
		this.resolvedPath = canonicalPath;
		return canonicalPath;
	}

	/**
   * Downloads the configured release into `destDir`. If a *specific* pinned
   * version fails to install, falls back to "latest" and records that choice in
   * the settings (so the user can see the extension is now tracking latest).
   * A failure of "latest" itself is surfaced to the caller.
   */
	private async downloadWithLatestFallback(destDir: string): Promise<void>
	{
		const version = this.getConfiguredVersion();
		try
		{
			await this.download(destDir, version);
		}
		catch (err)
		{
			if (version === "latest")
			{
				throw err;
			}
			logError(`Failed to install mutagen ${version}; falling back to "latest"`, err);
			await this.download(destDir, "latest");
			await this.persistLatestSetting();
		}
	}

	/**
   * Writes "latest" back to the mutagen.binary.version setting so a fallback is
   * reflected in the UI. Suppresses the resulting configuration-change reinstall
   * since the latest binary was just installed.
   */
	private async persistLatestSetting(): Promise<void>
	{
		try
		{
			this.suppressNextVersionChange = true;
			await this.config.update("binary.version", "latest", vscode.ConfigurationTarget.Global);
			log("Reset mutagen.binary.version to \"latest\" after fallback.");
		}
		catch (err)
		{
			this.suppressNextVersionChange = false;
			logError("Failed to update mutagen.binary.version setting", err);
		}
	}

	/**
   * Returns and clears the flag that tells the configuration-change handler to
   * ignore a version change the extension itself just wrote.
   */
	consumeSuppressedVersionChange(): boolean
	{
		if (this.suppressNextVersionChange)
		{
			this.suppressNextVersionChange = false;
			return true;
		}
		return false;
	}

	/**
   * Writes a version marker for an already-installed binary that predates
   * version tracking, deriving the tag from `mutagen version`. Best-effort:
   * failures are logged and left as "no marker" so update checks simply skip.
   */
	private async backfillVersionMarker(canonicalPath: string): Promise<void>
	{
		try
		{
			const result = await run(canonicalPath, ["version"]);
			const version = result.stdout.trim();
			if (version)
			{
				// mutagen prints a bare version like "0.18.1"; release tags carry a
				// leading "v", so normalize to the tag shape we record on download.
				const tag = /^v/i.test(version) ? version : `v${version}`;
				fs.writeFileSync(this.versionFile, tag, "utf8");
				log(`Backfilled installed mutagen version marker: ${tag}`);
			}
		}
		catch (err)
		{
			logError("Failed to determine installed mutagen version", err);
		}
	}

	/**
   * Forces a fresh install of the configured release, replacing any existing
   * extension-managed binary. The new release is downloaded into a staging
   * directory *first*, so a failed download never leaves the extension without
   * a working binary — the live one is only removed once the new one is ready.
   */
	async reinstall(): Promise<string>
	{
		const tokens = getPlatformTokens();
		const canonicalPath = path.join(this.binDir, tokens.executableName);
		const stagingDir = path.join(this.context.extensionPath, "bin.staging");

		// 1. Download into staging while the current binary/daemon keep working.
		if (fs.existsSync(stagingDir))
		{
			await this.removeDir(stagingDir);
		}
		try
		{
			await this.downloadWithLatestFallback(stagingDir);
		}
		catch (err)
		{
			// Leave the existing installation untouched on failure.
			if (fs.existsSync(stagingDir))
			{
				await this.removeDir(stagingDir).catch(() => undefined);
			}
			throw err;
		}

		this.resolvedPath = undefined;

		// 2. On Windows a running executable is locked on disk, so the daemon
		// (launched from this very binary, possibly in a previous VS Code session)
		// must be stopped before we can delete it — otherwise removal fails with
		// EPERM. Best-effort: with no daemon, `daemon stop` is a harmless no-op.
		if (fs.existsSync(canonicalPath))
		{
			try
			{
				await run(canonicalPath, ["daemon", "stop"]);
			}
			catch (err)
			{
				logError("Failed to stop mutagen daemon before reinstall", err);
			}
		}

		// 3. Swap staging into place. The window where no binary exists is only
		// the rename below, keeping any concurrent poll's failure window tiny.
		if (fs.existsSync(this.binDir))
		{
			await this.removeDir(this.binDir);
		}
		fs.renameSync(stagingDir, this.binDir);

		this.resolvedPath = canonicalPath;
		return canonicalPath;
	}

	/**
   * Deletes a directory, retrying briefly on Windows where the OS can take a
   * moment to release a file handle after the owning process (the daemon) exits.
   */
	private async removeDir(dir: string): Promise<void>
	{
		const maxAttempts = 5;
		for (let attempt = 1; attempt <= maxAttempts; attempt++)
		{
			try
			{
				fs.rmSync(dir, { recursive: true, force: true });
				return;
			}
			catch (err)
			{
				if (attempt === maxAttempts)
				{
					throw err;
				}
				log(`Could not remove ${dir} (attempt ${attempt}/${maxAttempts}); retrying shortly...`);
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
		}
	}

	/**
   * Resolves the given release (defaulting to the configured one), downloads its
   * matching asset, extracts it, and copies its contents into `destDir` (which
   * is created if needed). Also writes the release-tag marker there and verifies
   * the binary runs.
   */
	private async download(destDir: string, version = this.getConfiguredVersion()): Promise<void>
	{
		const tokens = getPlatformTokens();
		const canonicalPath = path.join(destDir, tokens.executableName);

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
					fs.mkdirSync(destDir, { recursive: true });
					for (const entry of fs.readdirSync(extractedDir))
					{
						fs.cpSync(path.join(extractedDir, entry), path.join(destDir, entry), { recursive: true });
					}
					if (process.platform !== "win32")
					{
						fs.chmodSync(canonicalPath, 0o755);
					}

					// Record which release tag we just installed so later runs can
					// compare against the latest release (see binary/binaryUpdates.ts).
					fs.writeFileSync(path.join(destDir, ".installed-version"), release.tag_name, "utf8");

					progress.report({ message: "Verifying installation..." });
					const versionResult = await run(canonicalPath, ["version"]);
					log(`Installed mutagen ${release.tag_name} at ${canonicalPath}: ${versionResult.stdout.trim()}`);
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
 * Compares two mutagen version identifiers, ignoring a leading "v" so that a
 * pinned setting like "0.18.1" matches a release tag like "v0.18.1".
 */
export function versionsEqual(a: string, b: string): boolean
{
	const normalize = (v: string): string => v.trim().replace(/^v/i, "");
	return normalize(a) === normalize(b);
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
