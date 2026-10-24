import type { LogLevel } from "@lilsnibbi/logger";
import { dataProperty, safeContext, safeText } from "./redact";

/** Console output settings used when Virello creates a logger. */
export interface ConsoleLogOptions {
	/** Overrides VIRELLO_LOG_FORMAT. Default: text. */
	format?: "text" | "json";
	/** Overrides VIRELLO_LOG_STACKS. Default: short (three source locations). */
	stacks?: "off" | "short" | "full";
	/** Additional credential values to scrub. Values shorter than six characters are ignored. */
	redact?: readonly string[];
	/** Text display width in columns (32..200). Defaults to the terminal width, capped at 120; pipes use 100. */
	width?: number;
	/** Compact native displays by default; full includes every safe field and correlation ID. DEBUG defaults to full. */
	detail?: "compact" | "full";
}
/** Structured framework log entry, exported as ConsoleLogEntry. */
export interface LogEntry {
	/** Short name of the part of the application reporting the event. */
	component: string;
	/** Stable event name used to group related log records. */
	event: string;
	/** Short explanation of what happened. */
	message: string;
	/** Optional metadata. The console formatter filters and redacts unsafe values. */
	context?: Record<string, unknown>;
	/** Optional thrown value. The console formatter summarizes its cause and source locations. */
	error?: unknown;
}
export interface ConsoleRecord {
	timestamp: string;
	level: "debug" | "info" | "warn" | "error";
	component: string;
	event: string;
	message: string;
	context?: Record<string, unknown>;
	error?: Record<string, unknown>;
}
export const severity = {
	DEBUG: "debug",
	NOTIF: "info",
	ALERT: "warn",
	ERROR: "error",
} as const;

export function supportsColor(
	env: Record<string, string | undefined>,
	isTTY: boolean,
	colors: boolean | "auto" = "auto",
): boolean {
	if (
		colors === false ||
		env.NO_COLOR !== undefined ||
		env.TERM === "dumb" ||
		env.FORCE_COLOR === "0"
	)
		return false;
	return colors === true || isTTY || !!env.FORCE_COLOR;
}

const hints: Record<string, string> = {
	ECONNREFUSED:
		"Connection refused; check the endpoint and service availability.",
	ENOTFOUND: "Host lookup failed; check DNS and endpoint configuration.",
	EAI_AGAIN: "Temporary DNS failure; check resolver availability.",
	ECONNRESET: "Connection reset; check the network and upstream service.",
	ETIMEDOUT: "Operation timed out; check latency and service health.",
	ENOENT: "File missing; check module patterns and packaged files.",
	EACCES: "Access denied; check file and service permissions.",
	SQLITE_BUSY:
		"Database is locked by another connection or process; inspect concurrent access.",
	SQLITE_LOCKED:
		"A database connection holds a conflicting lock; inspect active state access.",
	SQLITE_CORRUPT:
		"SQLite reported damaged database structure; preserve the database and journal for inspection.",
	SQLITE_NOTADB:
		"The state file is not a valid SQLite database; preserve it for inspection.",
	SQLITE_IOERR:
		"State storage I/O failed; inspect the filesystem and device before retrying.",
	SQLITE_FULL: "State storage is full; inspect disk capacity before retrying.",
	SQLITE_READONLY:
		"State storage is read-only; check filesystem access and the state path.",
	"50013":
		"Discord denied the action; check bot permissions and role hierarchy.",
	"10062": "Discord interaction expired; check acknowledgement timing.",
	"40060":
		"Discord interaction already acknowledged; check the reply lifecycle.",
	CLOSED: "Resource closed; check the shutdown and connection lifecycle.",
	PROTOCOL: "Invalid sharding protocol; check framework versions on all hosts.",
	AUTH: "Sharding authentication failed; check host credential configuration.",
	CAPACITY: "Capacity exhausted; check pending work and configured limits.",
	TIMEOUT: "Operation timed out; check shard readiness and service health.",
	STARTUP_TIMEOUT:
		"Shard did not boot before its deadline; check the entrypoint and startup logs.",
	CONNECT_TIMEOUT:
		"Coordinator handshake timed out; check host availability and connectivity.",
	IDENTIFY_TIMEOUT:
		"Identify permit timed out; check session allowance and coordinator readiness.",
	SHUTDOWN_TIMEOUT:
		"Shard exit is unconfirmed; this supervisor cannot restart it until exit is confirmed.",
	CHILD_EXIT:
		"Shard process exited; inspect its logs and configured restart policy.",
	DISCONNECTED:
		"Sharding disconnected; check coordinator and host availability.",
	CONNECT:
		"Coordinator connection failed; check authentication, active host connections, TLS and availability.",
	OWNERSHIP:
		"Shard connection or generation is stale or conflicts with its assignment; inspect active hosts.",
	SESSION_LIMIT:
		"Identify session allowance is unavailable; inspect coordinator metadata.",
	BACKPRESSURE:
		"Transport buffer is full or closed; inspect service load and connectivity.",
	UNAVAILABLE:
		"Destination shard unavailable; inspect its process and readiness.",
	GATEWAY: "Gateway metadata unavailable; inspect Discord service health.",
	CONFIG:
		"Invalid configuration; inspect the relevant client or shard options.",
	STATE:
		"Sharding operation is unavailable; inspect the coordinator lifecycle and reported operation.",
	PAYLOAD:
		"Invalid or oversized sharding payload; inspect the request contract.",
	REQUEST:
		"Shard request failed; correlate the request with the destination logs.",
	ABORTED: "Operation cancelled; inspect its deadline and shutdown state.",
	TARGET: "Invalid target shard; inspect the configured shard range.",
	DISABLED:
		"Sharding is disabled for this client; inspect its host configuration.",
	DUPLICATE_HANDLER: "Duplicate shard handler; check registered request names.",
};
const errorTypes = new Set([
	"Error",
	"TypeError",
	"RangeError",
	"ReferenceError",
	"SyntaxError",
	"AggregateError",
	"AbortError",
	"TimeoutError",
	"SystemError",
	"DiscordAPIError",
	"HTTPError",
	"RestError",
	"ShardError",
	"ModuleLoadError",
	"ModuleCleanupError",
	"MissingModuleError",
]);

/** Provider messages and bodies are intentionally omitted; safe codes and locations explain failures. */
export function errorDiagnostic(
	error: unknown,
	stacks: NonNullable<ConsoleLogOptions["stacks"]> = "short",
	secrets: readonly string[] = [],
): Record<string, unknown> {
	const seen = new Set<object>();
	let remaining = 12;
	const summarize = (
		value: unknown,
		depth: number,
	): Record<string, unknown> => {
		if (!value || typeof value !== "object")
			return {
				type: "NonError",
				hint: "A non-error value was thrown; inspect the operation.",
			};
		if (seen.has(value)) return { type: "CircularCause" };
		if (--remaining < 0) return { type: "Truncated" };
		seen.add(value);
		const name = dataProperty(value, "name");
		const body = name === "RestError" ? dataProperty(value, "body") : undefined;
		const rawCode =
			dataProperty(value, "code") ??
			dataProperty(value, "errno") ??
			(body && typeof body === "object"
				? dataProperty(body, "code")
				: undefined);
		const status = dataProperty(value, "status");
		const message = dataProperty(value, "message");
		const code =
			(typeof rawCode === "string" || typeof rawCode === "number") &&
			(Object.hasOwn(hints, String(rawCode)) ||
				/^\d{1,10}$/.test(String(rawCode)))
				? String(rawCode)
				: undefined;
		const validStatus =
			typeof status === "number" &&
			Number.isInteger(status) &&
			status >= 100 &&
			status <= 599
				? status
				: undefined;
		const recognized =
			typeof message === "string"
				? message
						.slice(0, 4096)
						.match(
							/\b(?:ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ENOENT|EACCES)\b/,
						)?.[0]
				: undefined;
		const hint =
			hints[code ?? recognized ?? ""] ??
			(validStatus === 429
				? "Discord rate limited the request; inspect rate-limit diagnostics."
				: validStatus === 401 || validStatus === 403
					? "Discord rejected access; check credentials and permissions."
					: validStatus && validStatus >= 500
						? "Upstream service failed; check service health."
						: name === "SyntaxError"
							? "Invalid data syntax; check the parser and its source."
							: "Inspect the failing operation and source locations.");
		const result: Record<string, unknown> = {
			type: typeof name === "string" && errorTypes.has(name) ? name : "Error",
			...(code !== undefined ? { code: safeText(code, secrets, 40) } : {}),
			...(validStatus !== undefined ? { status: validStatus } : {}),
			hint,
		};
		const cause = dataProperty(value, "cause");
		if (cause !== undefined)
			result.cause =
				depth < 2 ? summarize(cause, depth + 1) : { type: "Truncated" };
		const errors = dataProperty(value, "errors");
		if (Array.isArray(errors)) {
			const length = dataProperty(errors, "length") as number;
			result.errorCount = length;
			if (depth < 2) {
				const nested = [];
				for (let index = 0; index < Math.min(length, 3); index++)
					nested.push(
						summarize(dataProperty(errors, String(index)), depth + 1),
					);
				result.errors = nested;
			}
		}
		const stack = dataProperty(value, "stack");
		if (depth === 0 && stacks !== "off" && typeof stack === "string") {
			const frames = stack
				.slice(0, 16_384)
				.split("\n")
				.slice(0, 80)
				.flatMap((line) => {
					if (!/^\s*at\s/.test(line)) return [];
					const location = line.match(
						/((?:file:\/\/\/|[A-Za-z]:[\\/]|\/|(?:[\w.@-]+[\\/])+)[^()\r\n]+\.(?:[cm]?[jt]sx?):\d+:\d+)\)?\s*$/,
					)?.[1];
					if (!location) return [];
					const path = location
						.replaceAll("\\", "/")
						.replace(/^file:\/\/\/([A-Za-z]:)/, "$1")
						.replace(/^file:\/\//, "");
					const dependency = /(?:^|\/)node_modules\//i.test(path);
					const cwd = `${process.cwd().replaceAll("\\", "/").replace(/\/$/, "")}/`;
					const inProject = /^[A-Za-z]:/.test(path)
						? path.toLowerCase().startsWith(cwd.toLowerCase())
						: path.startsWith(cwd);
					const relative = inProject
						? path.slice(cwd.length)
						: path.match(
								/(?:^|\/)((?:src|tests|scripts|examples|commands|listeners|tasks)\/.*)/,
							)?.[1];
					if (stacks === "short" && dependency) return [];
					return [
						safeText(
							!dependency && relative
								? relative
								: path.split("/").slice(-3).join("/"),
							secrets,
						),
					];
				})
				.slice(0, stacks === "short" ? 3 : 10);
			if (frames.length) result.stack = frames;
		}
		return result;
	};
	try {
		return summarize(error, 0);
	} catch {
		return {
			type: "Error",
			hint: "Error details unavailable; inspect the failing operation.",
		};
	}
}

export function makeRecord(
	name: string,
	level: LogLevel,
	value: unknown,
	date: Date,
	stacks: NonNullable<ConsoleLogOptions["stacks"]>,
	secrets: readonly string[] = [],
): ConsoleRecord {
	let entry: Partial<LogEntry> = {};
	try {
		if (
			value &&
			typeof value === "object" &&
			!(value instanceof Error) &&
			typeof dataProperty(value, "event") === "string"
		) {
			entry = {
				component: dataProperty(value, "component") as string,
				event: dataProperty(value, "event") as string,
				message: dataProperty(value, "message") as string,
				context: dataProperty(value, "context") as Record<string, unknown>,
				error: dataProperty(value, "error"),
			};
		} else if (typeof value === "string") entry.message = value;
		else if (level === "ERROR" || level === "ALERT" || value instanceof Error)
			entry = { message: "Operation failed", error: value };
		else entry = { message: "Diagnostic metadata", context: { value } };
	} catch {
		entry = { message: "Diagnostic details unavailable" };
	}
	const context = safeContext(entry.context, secrets);
	return {
		timestamp: date.toISOString(),
		level: severity[level],
		component: safeText(
			`${name}${typeof entry.component === "string" ? `.${entry.component}` : ""}`,
			secrets,
			96,
		),
		event: safeText(
			typeof entry.event === "string"
				? entry.event
				: level === "ERROR"
					? "operation_failed"
					: "notice",
			secrets,
			64,
		),
		message: safeText(
			typeof entry.message === "string" ? entry.message : "Operation failed",
			secrets,
		),
		...(Object.keys(context).length ? { context } : {}),
		...(entry.error !== undefined
			? { error: errorDiagnostic(entry.error, stacks, secrets) }
			: {}),
	};
}

export function contextText(context: Record<string, unknown> = {}): string {
	return Object.entries(context)
		.map(
			([key, value]) =>
				`${key}=${typeof value === "string" && /^[\w./:-]+$/.test(value) ? value : JSON.stringify(value)}`,
		)
		.join(" ");
}

function correlationFields(
	context: ConsoleRecord["context"],
	keys: readonly string[],
	maximum = Infinity,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of keys) {
		const value = context?.[key];
		if (typeof value === "string")
			result[key] =
				value.length > maximum ? `${value.slice(0, maximum - 3)}...` : value;
		else if (typeof value === "number" || typeof value === "boolean")
			result[key] = value;
	}
	return result;
}

/** One bounded, parseable record per line; human displays use the dependency's native layouts. */
export function serializeRecord(input: ConsoleRecord): string {
	if (Buffer.byteLength(JSON.stringify(input)) <= 7000)
		return JSON.stringify(input);
	return JSON.stringify({
		...input,
		context: {
			...correlationFields(
				input.context,
				[
					"requestId",
					"traceId",
					"connectionId",
					"routeId",
					"destinationConnectionId",
					"generation",
					"shard",
					"host",
					"command",
					"module",
					"task",
				],
				64,
			),
			truncated: true,
		},
		error: input.error
			? {
					type: input.error.type,
					code: input.error.code,
					status: input.error.status,
					hint: input.error.hint,
					truncated: true,
				}
			: undefined,
	});
}
