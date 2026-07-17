import { EndpointState, SyncSession } from "../mutagen/types";

/**
 * Quotes a string as a single-quoted YAML scalar, escaping embedded single quotes.
 * Single quotes (not double) are used because they don't treat backslashes as
 * escape characters, which matters for Windows paths like `C:\Users\...`.
 */
function singleQuoted(value: string): string
{
	return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Quotes a string as a double-quoted YAML mapping key, escaping backslashes and quotes.
 */
function doubleQuotedKey(value: string): string
{
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

/**
 * Reconstructs the connection spec mutagen expects for one endpoint. Local
 * endpoints round-trip exactly (verified against mutagen v0.18.1); remote
 * (e.g. ssh/docker) endpoints are best-effort, since their exact JSON field
 * layout wasn't verified against a live remote session.
 */
export function reconstructEndpointSpec(endpoint: EndpointState): { spec: string; uncertain: boolean }
{
	if (endpoint.protocol === "local")
	{
		return { spec: endpoint.path ?? "", uncertain: false };
	}

	const userPart = endpoint.user ? `${endpoint.user}@` : "";
	const hostPart = endpoint.host ?? "";
	const pathPart = endpoint.path ?? "";

	if (endpoint.protocol === "ssh")
	{
		return { spec: `${userPart}${hostPart}:${pathPart}`, uncertain: true };
	}
	if (endpoint.protocol === "docker")
	{
		return { spec: `docker://${hostPart}${pathPart}`, uncertain: true };
	}
	return { spec: pathPart || hostPart, uncertain: true };
}

/**
 * Builds a mutagen project YAML document (consumable by `mutagen project
 * start -f <file>`, with or without this extension) describing the given
 * sessions. Returns the document text plus the names of any sessions whose
 * endpoint spec was reconstructed best-effort and should be double-checked.
 */
export function buildProjectYaml(sessions: SyncSession[]): { yaml: string; uncertainSessionNames: string[] }
{
	const lines: string[] = ["sync:"];
	const uncertainSessionNames: string[] = [];

	for (const session of sessions)
	{
		const name = session.name || session.identifier;
		const alpha = reconstructEndpointSpec(session.alpha);
		const beta = reconstructEndpointSpec(session.beta);
		if (alpha.uncertain || beta.uncertain)
		{
			uncertainSessionNames.push(name);
		}

		lines.push(`  ${doubleQuotedKey(name)}:`);
		lines.push(`    alpha: ${singleQuoted(alpha.spec)}`);
		lines.push(`    beta: ${singleQuoted(beta.spec)}`);
		if (session.mode)
		{
			lines.push(`    mode: ${session.mode}`);
		}

		const ignorePaths = session.ignore?.paths;
		if (ignorePaths?.length)
		{
			lines.push("    ignore:");
			lines.push("      paths:");
			for (const path of ignorePaths)
			{
				lines.push(`        - ${singleQuoted(path)}`);
			}
		}
	}

	return { yaml: lines.join("\n") + "\n", uncertainSessionNames };
}
