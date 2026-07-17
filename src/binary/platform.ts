export interface PlatformTokens
{
  /** Candidate substrings that identify this OS in a release asset file name. */
	osTokens: string[];
  /** Candidate substrings that identify this architecture in a release asset file name. */
	archTokens: string[];
  /** Expected archive extensions for this OS, in preference order. */
	archiveExtensions: string[];
  /** Executable file name inside the archive / on disk. */
	executableName: string;
}

/**
 * Mutagen's release assets aren't hardcoded here on purpose — different mutagen
 * versions may name assets slightly differently. We only encode the tokens
 * needed to *recognize* the right asset out of whatever the release actually
 * contains (see binary/githubRelease.ts).
 */
export function getPlatformTokens(): PlatformTokens
{
	const platform = process.platform;
	const arch = process.arch;

	let osTokens: string[];
	let archiveExtensions: string[];
	let executableName: string;

	switch (platform)
	{
		case "win32":
			osTokens = ["windows", "win"];
			archiveExtensions = [".zip"];
			executableName = "mutagen.exe";
			break;
		case "darwin":
			osTokens = ["darwin", "macos", "osx"];
			archiveExtensions = [".tar.gz", ".tgz", ".zip"];
			executableName = "mutagen";
			break;
		case "linux":
			osTokens = ["linux"];
			archiveExtensions = [".tar.gz", ".tgz", ".zip"];
			executableName = "mutagen";
			break;
		default:
			throw new Error(`Unsupported platform: ${platform}`);
	}

	let archTokens: string[];
	switch (arch)
	{
		case "x64":
			archTokens = ["amd64", "x86_64", "x64"];
			break;
		case "arm64":
			archTokens = ["arm64", "aarch64"];
			break;
		case "ia32":
			archTokens = ["386", "i386", "x86"];
			break;
		default:
			throw new Error(`Unsupported architecture: ${arch}`);
	}

	return { osTokens, archTokens, archiveExtensions, executableName };
}
