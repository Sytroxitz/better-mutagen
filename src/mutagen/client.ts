import { run, runChecked } from "../util/exec";
import { CreateSessionOptions, SyncSession } from "./types";

/**
 * Thin wrapper around the mutagen CLI: every method shells out to the managed binary.
 */
export class MutagenClient
{
	/**
   * Creates a client bound to a specific mutagen executable path.
   */
	constructor(private readonly binaryPath: string)
	{}

	/**
   * Returns the mutagen CLI's own version string.
   */
	async version(): Promise<string>
	{
		const result = await runChecked(this.binaryPath, ["version"]);
		return result.stdout.trim();
	}

	/** Idempotent: mutagen only starts the daemon if it isn't already running. */
	async ensureDaemonRunning(): Promise<void>
	{
		await runChecked(this.binaryPath, ["daemon", "start"]);
	}

	/**
   * Stops the mutagen daemon if it's running.
   */
	async stopDaemon(): Promise<void>
	{
		await run(this.binaryPath, ["daemon", "stop"]);
	}

	/**
   * Lists all sync sessions known to the daemon, parsed from mutagen's JSON template output.
   */
	async listSessions(): Promise<SyncSession[]>
	{
		const result = await runChecked(this.binaryPath, ["sync", "list", "--template={{json .}}"]);
		const trimmed = result.stdout.trim();
		if (!trimmed)
		{
			return [];
		}
		return JSON.parse(trimmed) as SyncSession[];
	}

	/**
   * Creates and starts a new sync session from the given options.
   */
	async createSession(options: CreateSessionOptions): Promise<void>
	{
		const args = ["sync", "create", options.alpha, options.beta];
		if (options.name)
		{
			args.push("--name", options.name);
		}
		if (options.mode)
		{
			args.push("--mode", options.mode);
		}
		for (const ignore of options.ignores ?? [])
		{
			args.push("--ignore", ignore);
		}
		if (options.extraArgs?.length)
		{
			args.push(...options.extraArgs);
		}
		await runChecked(this.binaryPath, args);
	}

	/**
   * Pauses a sync session by identifier or name.
   */
	async pauseSession(identifier: string): Promise<void>
	{
		await runChecked(this.binaryPath, ["sync", "pause", identifier]);
	}

	/**
   * Resumes a paused or disconnected sync session by identifier or name.
   */
	async resumeSession(identifier: string): Promise<void>
	{
		await runChecked(this.binaryPath, ["sync", "resume", identifier]);
	}

	/**
   * Permanently terminates a sync session by identifier or name.
   */
	async terminateSession(identifier: string): Promise<void>
	{
		await runChecked(this.binaryPath, ["sync", "terminate", identifier]);
	}

	/**
   * Resets a sync session's synchronization history, forcing a full re-scan.
   */
	async resetSession(identifier: string): Promise<void>
	{
		await runChecked(this.binaryPath, ["sync", "reset", identifier]);
	}

	/**
   * Forces an immediate synchronization cycle for a session.
   */
	async flushSession(identifier: string): Promise<void>
	{
		await runChecked(this.binaryPath, ["sync", "flush", identifier]);
	}

	/**
   * Returns mutagen's full human-readable long-form details for a single session.
   */
	async sessionDetails(identifier: string): Promise<string>
	{
		const result = await runChecked(this.binaryPath, ["sync", "list", "-l", identifier]);
		return result.stdout;
	}

	/**
   * Starts all sync sessions defined in a mutagen project file.
   */
	async startProject(projectFile: string, cwd: string): Promise<void>
	{
		await runChecked(this.binaryPath, ["project", "start", "--project-file", projectFile], { cwd });
	}

	/**
   * Terminates all sync sessions defined in a mutagen project file.
   */
	async terminateProject(projectFile: string, cwd: string): Promise<void>
	{
		await runChecked(this.binaryPath, ["project", "terminate", "--project-file", projectFile], { cwd });
	}
}
