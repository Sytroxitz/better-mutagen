import { spawn, SpawnOptionsWithoutStdio } from "child_process";
import { log } from "./logger";

export interface ExecResult
{
	code: number | null;
	stdout: string;
	stderr: string;
}

/**
 * Error thrown when a mutagen CLI invocation exits with a non-zero code.
 */
export class MutagenCliError extends Error
{
	/**
   * Builds the error from the failed command and its captured output.
   */
	constructor(
    public readonly command: string,
    public readonly result: ExecResult
	)
	{
		super(
			`Command failed (${result.code}): ${command}\n${result.stderr || result.stdout}`
		);
	}
}

/**
 * Runs a command and captures its output. Every invocation is mirrored to the
 * "Mutagen" output channel so users can always see exactly what was run.
 */
export function run(
	command: string,
	args: string[],
	options: SpawnOptionsWithoutStdio = {}
): Promise<ExecResult>
{
	return new Promise((resolve, reject) =>
	{
		log(`$ ${command} ${args.join(" ")}`);
		const child = spawn(command, args, { ...options, windowsHide: true });

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (chunk: Buffer) =>
		{
			stdout += chunk.toString();
		});
		child.stderr?.on("data", (chunk: Buffer) =>
		{
			stderr += chunk.toString();
		});

		child.on("error", (err) =>
		{
			log(`! failed to launch: ${err.message}`);
			reject(err);
		});

		child.on("close", (code) =>
		{
			if (stdout.trim())
			{
				log(stdout.trim());
			}
			if (stderr.trim())
			{
				log(stderr.trim());
			}
			resolve({ code, stdout, stderr });
		});
	});
}

/** Like {@link run}, but rejects with {@link MutagenCliError} on a non-zero exit code. */
export async function runChecked(
	command: string,
	args: string[],
	options: SpawnOptionsWithoutStdio = {}
): Promise<ExecResult>
{
	const result = await run(command, args, options);
	if (result.code !== 0)
	{
		throw new MutagenCliError(`${command} ${args.join(" ")}`, result);
	}
	return result;
}
