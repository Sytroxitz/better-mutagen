import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface WorkspaceProjectFile
{
	workspaceFolder: vscode.WorkspaceFolder;
	absolutePath: string;
	fileName: string;
}

/**
 * Locates the configured project file (default ".mutagen.yml") in each open
 * workspace folder. Parsing is left entirely to `mutagen project` itself —
 * we only need to know whether the file exists.
 */
export function findProjectFiles(): WorkspaceProjectFile[]
{
	const fileName = vscode.workspace.getConfiguration("mutagen").get<string>("projectConfigFile") || ".mutagen.yml";
	const folders = vscode.workspace.workspaceFolders ?? [];

	const found: WorkspaceProjectFile[] = [];
	for (const workspaceFolder of folders)
	{
		const absolutePath = path.join(workspaceFolder.uri.fsPath, fileName);
		if (fs.existsSync(absolutePath))
		{
			found.push({ workspaceFolder, absolutePath, fileName });
		}
	}
	return found;
}
