export interface EndpointState
{
	protocol: string;
	path?: string;
	host?: string;
	/** Only present for remote (e.g. ssh) endpoints; not verified against every mutagen version. */
	user?: string;
	connected: boolean;
	scanned?: boolean;
	directories?: number;
	files?: number;
	totalFileSize?: number;
}

/**
 * Mirrors the JSON shape produced by `mutagen sync list --template='{{json .}}'`
 * (verified against mutagen v0.18.1). Only the fields the UI actually uses are
 * declared; unknown fields are ignored rather than rejected.
 */
export interface SyncSession
{
	identifier: string;
	name?: string;
	paused: boolean;
	status: string;
	mode?: string;
	creationTime?: string;
	alpha: EndpointState;
	beta: EndpointState;
	successfulCycles?: number;
	lastError?: string;
	conflicts?: unknown[];
	/** Present once at least one `--ignore` path was set (verified against mutagen v0.18.1). */
	ignore?: { paths?: string[] };
}

export type SyncMode = "two-way-safe" | "two-way-resolved" | "one-way-safe" | "one-way-replica";

export interface CreateSessionOptions
{
	alpha: string;
	beta: string;
	name?: string;
	mode?: SyncMode;
	ignores?: string[];
	extraArgs?: string[];
}
