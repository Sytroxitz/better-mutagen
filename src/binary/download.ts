import * as fs from "fs";
import * as path from "path";
import * as tar from "tar";
import AdmZip from "adm-zip";

export { downloadToFile } from "./http";
export type { DownloadProgress } from "./http";

/**
 * Extracts a downloaded mutagen archive into destDir and returns the
 * directory that directly contains the executable. Mutagen release archives
 * also ship an agent bundle (e.g. mutagen-agents.tar.gz) alongside the main
 * executable, needed for SSH/remote sync endpoints — callers should copy the
 * whole returned directory's contents, not just the executable, so remote
 * sync keeps working. Handles both zip (Windows) and tar.gz (macOS/Linux)
 * archives.
 */
export async function extractArchive(
	archivePath: string,
	destDir: string,
	executableName: string
): Promise<string>
{
	fs.mkdirSync(destDir, { recursive: true });

	if (archivePath.toLowerCase().endsWith(".zip"))
	{
		const zip = new AdmZip(archivePath);
		zip.extractAllTo(destDir, true);
	}
	else
	{
		await tar.x({ file: archivePath, cwd: destDir });
	}

	const executablePath = findExecutable(destDir, executableName);
	if (!executablePath)
	{
		throw new Error(`Extracted mutagen archive did not contain an executable named "${executableName}" (looked under ${destDir}).`);
	}

	return path.dirname(executablePath);
}

/**
 * Recursively searches a directory for a file matching the given executable name.
 */
function findExecutable(dir: string, executableName: string): string | undefined
{
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries)
	{
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory())
		{
			const found = findExecutable(fullPath, executableName);
			if (found)
			{
				return found;
			}
		}
		else if (entry.name.toLowerCase() === executableName.toLowerCase())
		{
			return fullPath;
		}
	}
	return undefined;
}
