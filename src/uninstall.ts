/**
 * Runs as the package.json "vscode:uninstall" lifecycle script, right before
 * VS Code deletes this extension's install directory. Plain Node.js only —
 * no "vscode" module is available in this context.
 *
 * Stops the Mutagen daemon spawned from our bundled binary so its exe file
 * isn't locked (Windows refuses to delete a running process's executable),
 * letting the folder deletion succeed cleanly. This intentionally does NOT
 * terminate the user's sync sessions — only the extension-managed daemon
 * process is stopped; session state/config is left untouched.
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * Locates the extension-managed mutagen binary and stops its daemon, if present.
 */
function main(): void
{
	const executableName = process.platform === "win32" ? "mutagen.exe" : "mutagen";
	const binaryPath = path.join(__dirname, "..", "bin", executableName);

	if (!fs.existsSync(binaryPath))
	{
		return;
	}

	try
	{
		spawnSync(binaryPath, ["daemon", "stop"], { windowsHide: true, timeout: 10_000 });
	}
	catch
	{
		// Best-effort: if this fails, VS Code's folder deletion may leave a
		// locked exe behind on Windows, but nothing else depends on it succeeding.
	}
}

main();
