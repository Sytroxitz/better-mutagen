import * as https from "https";
import { PlatformTokens } from "./platform";

export interface GithubAsset
{
	name: string;
	browser_download_url: string;
	size: number;
}

export interface GithubRelease
{
	tag_name: string;
	assets: GithubAsset[];
}

const REPO = "mutagen-io/mutagen";
const USER_AGENT = "better-mutagen-vscode-extension";

/**
 * Performs a GET request against the GitHub API and parses the JSON response, following redirects.
 */
function get<T>(url: string): Promise<T>
{
	return new Promise((resolve, reject) =>
	{
		const request = https.get(
			url,
			{ headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" } },
			(res) =>
			{
				if (
					res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
				)
				{
					res.resume();
					get<T>(res.headers.location).then(resolve, reject);
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

/**
 * Fetches release metadata from GitHub, either the latest release or a specific tag.
 */
export async function fetchRelease(versionOrLatest: string): Promise<GithubRelease>
{
	const url = versionOrLatest === "latest" || !versionOrLatest
		? `https://api.github.com/repos/${REPO}/releases/latest`
		: `https://api.github.com/repos/${REPO}/releases/tags/${encodeURIComponent(versionOrLatest)}`;
	return get<GithubRelease>(url);
}

/**
 * Picks the asset matching the current OS/arch. Doesn't assume a specific
 * naming scheme — it just requires an OS token, an arch token, and a known
 * archive extension to all appear in the file name.
 */
export function pickAsset(release: GithubRelease, tokens: PlatformTokens): GithubAsset
{
	const candidates = release.assets.filter((asset) =>
	{
		const name = asset.name.toLowerCase();
		const hasOs = tokens.osTokens.some((t) => name.includes(t));
		const hasArch = tokens.archTokens.some((t) => name.includes(t));
		const hasExt = tokens.archiveExtensions.some((ext) => name.endsWith(ext));
		return hasOs && hasArch && hasExt;
	});

	if (candidates.length === 0)
	{
		const available = release.assets.map((a) => a.name).join(", ");
		throw new Error(
			`Could not find a mutagen release asset for this platform (os tokens: ${tokens.osTokens.join(
				"/"
			)}, arch tokens: ${tokens.archTokens.join("/")}) in release ${release.tag_name}. ` +
        `Available assets: ${available || "(none)"}. ` +
        `You can set "mutagen.binary.customPath" to point at a manually installed mutagen binary instead.`
		);
	}

	// Prefer the most specific match if several extensions matched (e.g. .tar.gz over .zip on macOS).
	candidates.sort(
		(a, b) =>
			tokens.archiveExtensions.findIndex((ext) => a.name.toLowerCase().endsWith(ext)) -
      tokens.archiveExtensions.findIndex((ext) => b.name.toLowerCase().endsWith(ext))
	);

	return candidates[0];
}
