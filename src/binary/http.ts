import * as fs from "fs";
import * as https from "https";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { log } from "../util/logger";

const USER_AGENT = "better-mutagen-vscode-extension";

/** Reports download progress in bytes. */
export interface DownloadProgress
{
  (receivedBytes: number, totalBytes: number): void;
}

/**
 * Pauses for the given number of milliseconds.
 */
function delay(ms: number): Promise<void>
{
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a set of attempt strategies in order and returns the first success. We
 * try `fetch` (undici) first because Node's built-in `https` parser is strict
 * and can reject otherwise-usable responses from proxies/AV with a "Parse
 * Error", then fall back to `https` (which honors VS Code's proxy patching).
 */
async function tryStrategies<T>(label: string, attempts: Array<() => Promise<T>>): Promise<T>
{
	let lastError: unknown;
	for (let i = 0; i < attempts.length; i++)
	{
		try
		{
			return await attempts[i]();
		}
		catch (err)
		{
			lastError = err;
			log(`${label}: attempt ${i + 1}/${attempts.length} failed: ${(err as Error).message}`);
			if (i < attempts.length - 1)
			{
				await delay(500 * (i + 1));
			}
		}
	}
	throw lastError;
}

/**
 * Fetches a URL and parses the JSON body, retrying and falling back from
 * `fetch` to Node's `https`.
 */
export async function getJson<T>(url: string): Promise<T>
{
	return tryStrategies<T>(`GET ${url}`, [
		() => fetchJson<T>(url),
		() => fetchJson<T>(url),
		() => httpsJson<T>(url, true),
	]);
}

/**
 * Downloads a URL to a local file (following redirects), retrying and falling
 * back from `fetch` to Node's `https`.
 */
export async function downloadToFile(url: string, destPath: string, onProgress?: DownloadProgress): Promise<void>
{
	await tryStrategies<void>(`DOWNLOAD ${url}`, [
		() => fetchToFile(url, destPath, onProgress),
		() => fetchToFile(url, destPath, onProgress),
		() => httpsToFile(url, destPath, onProgress, 5, true),
	]);
}

/** JSON GET via the global `fetch` (undici). */
async function fetchJson<T>(url: string): Promise<T>
{
	const res = await fetch(url, {
		headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" },
	});
	if (!res.ok)
	{
		throw new Error(`GitHub API request failed: ${res.status} ${res.statusText} (${url})`);
	}
	return (await res.json()) as T;
}

/** File download via the global `fetch` (undici), streamed to disk with progress. */
async function fetchToFile(url: string, destPath: string, onProgress?: DownloadProgress): Promise<void>
{
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!res.ok || !res.body)
	{
		throw new Error(`Download failed: ${res.status} ${res.statusText} (${url})`);
	}
	const total = Number(res.headers.get("content-length") ?? 0);
	let received = 0;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const source = Readable.fromWeb(res.body as any);
	source.on("data", (chunk: Buffer) =>
	{
		received += chunk.length;
		onProgress?.(received, total);
	});
	try
	{
		await pipeline(source, fs.createWriteStream(destPath));
	}
	catch (err)
	{
		try
		{
			fs.rmSync(destPath, { force: true });
		}
		catch
		{
			// ignore cleanup failure; a later attempt overwrites the file anyway
		}
		throw err;
	}
}

/** JSON GET via Node's `https`, following redirects. */
function httpsJson<T>(url: string, insecureHTTPParser: boolean, redirectsLeft = 5): Promise<T>
{
	return new Promise((resolve, reject) =>
	{
		const request = https.get(
			url,
			{ headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" }, insecureHTTPParser },
			(res) =>
			{
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0)
				{
					res.resume();
					httpsJson<T>(res.headers.location, insecureHTTPParser, redirectsLeft - 1).then(resolve, reject);
					return;
				}
				if (res.statusCode !== 200)
				{
					res.resume();
					reject(new Error(`GitHub API request failed: ${res.statusCode} ${res.statusMessage} (${url})`));
					return;
				}
				let body = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => (body += chunk));
				res.on("error", reject);
				res.on("end", () =>
				{
					try
					{
						resolve(JSON.parse(body) as T);
					}
					catch (err)
					{
						reject(new Error(`Failed to parse GitHub API response from ${url}: ${(err as Error).message}`));
					}
				});
			}
		);
		request.on("error", reject);
	});
}

/** File download via Node's `https`, following redirects. */
function httpsToFile(
	url: string,
	destPath: string,
	onProgress: DownloadProgress | undefined,
	redirectsLeft: number,
	insecureHTTPParser: boolean
): Promise<void>
{
	return new Promise((resolve, reject) =>
	{
		const request = https.get(
			url,
			{ headers: { "User-Agent": USER_AGENT }, insecureHTTPParser },
			(res) =>
			{
				if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0)
				{
					res.resume();
					httpsToFile(res.headers.location, destPath, onProgress, redirectsLeft - 1, insecureHTTPParser).then(
						resolve,
						reject
					);
					return;
				}
				if (res.statusCode !== 200)
				{
					res.resume();
					reject(new Error(`Download failed: ${res.statusCode} ${res.statusMessage} (${url})`));
					return;
				}

				const total = Number(res.headers["content-length"] ?? 0);
				let received = 0;
				const file = fs.createWriteStream(destPath);

				res.on("data", (chunk: Buffer) =>
				{
					received += chunk.length;
					onProgress?.(received, total);
				});
				res.on("error", reject);

				res.pipe(file);
				file.on("finish", () => file.close(() => resolve()));
				file.on("error", reject);
			}
		);
		request.on("error", reject);
	});
}
