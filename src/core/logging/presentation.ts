import {
	formatError,
	type LogCallOptions,
	type LogContext,
	Logger,
	type LogLayout,
} from "@lilsnibbi/logger";
import type { ConsoleRecord } from "./format";
import { wrapText } from "./text";

interface Summary {
	message: string;
	fields: readonly string[];
}
const summaries: Record<string, Summary> = {
	"sharding.coordinator:listening": {
		message: "Listening",
		fields: ["hosts", "shards", "tls"],
	},
	"sharding.coordinator:host_connected": {
		message: "Host connected",
		fields: ["host", "shards"],
	},
	"sharding.coordinator:shard_registered": {
		message: "Shard registered",
		fields: ["host", "shard", "readyShards"],
	},
	"sharding.coordinator:identify_limits_updated": {
		message: "Login allowance updated",
		fields: ["remaining", "total", "maxConcurrency", "expired"],
	},
	"sharding.coordinator:identify_queued": {
		message: "Login queued",
		fields: ["host", "shard", "pendingIdentifies"],
	},
	"sharding.coordinator:identify_granted": {
		message: "Login permitted",
		fields: ["host", "shard", "durationMs", "remaining"],
	},
	"sharding.coordinator:identify_completed": {
		message: "Login confirmed",
		fields: ["host", "shard"],
	},
	"sharding.coordinator:request_dispatched": {
		message: "Request dispatched",
		fields: ["host", "sourceShard", "destinationHost", "shard", "operation"],
	},
	"sharding.coordinator:request_completed": {
		message: "Request completed",
		fields: ["host", "shard", "operation", "durationMs"],
	},
	"sharding.coordinator:host_drained": {
		message: "Host stopped its shards",
		fields: ["host"],
	},
	"sharding.coordinator:identify_startup_wait": {
		message: "Waiting for login cooldown",
		fields: ["delayMs"],
	},
	"sharding.coordinator:stopping": {
		message: "Stopping coordinator",
		fields: ["hosts", "pending"],
	},
	"sharding.coordinator:stopped": {
		message: "Coordinator stopped",
		fields: [],
	},
	"sharding.manager:assigned": {
		message: "Shards assigned",
		fields: ["host", "shards"],
	},
	"sharding.manager:connection_waiting": {
		message: "Waiting for coordinator admission",
		fields: ["host", "reason", "attempt"],
	},
	"sharding.manager:connection_lost": {
		message: "Coordinator lost; shards in maintenance",
		fields: ["host", "reason", "attempt"],
	},
	"sharding.client:maintenance_started": {
		message: "Maintenance; Discord stays connected",
		fields: ["shard", "maxDisconnectedLifetimeMs"],
	},
	"sharding.client:assignment_reconciled": {
		message: "Assignment reconciled; maintenance cleared",
		fields: ["shard", "count"],
	},
	"sharding.client:shard_dormant": {
		message: "Dormant; Discord closed, waiting for capacity",
		fields: ["previousShard", "reason", "pollIntervalMs"],
	},
	"rest.registration:completed": {
		message: "Registration checked",
		fields: ["registries", "durationMs"],
	},
	"client:ready": {
		message: "Discord ready",
		fields: ["shard", "commands", "guilds"],
	},
	"modules:loaded": {
		message: "Modules loaded",
		fields: ["stores", "modules"],
	},
};
const sources: Record<string, string> = {
	"sharding.coordinator": "coordinator",
	"sharding.manager": "host",
	"sharding.client": "shard",
	"rest.registration": "commands",
	"engine.gateway": "gateway",
	"engine.rest": "REST",
	"tasks.storage": "jobs/storage",
	tasks: "jobs",
};
const labels: Record<string, string> = {
	durationMs: "elapsed",
	pendingIdentifies: "queued",
	readyShards: "ready",
	maxConcurrency: "concurrency",
	sourceShard: "from",
	destinationHost: "to",
};
const references = [
	"requestId",
	"traceId",
	"routeId",
	"connectionId",
	"destinationConnectionId",
	"generation",
];
const ordinaryFields = [
	"host",
	"shard",
	"command",
	"module",
	"task",
	"extension",
	"code",
	"status",
	"reason",
	"durationMs",
];
// The library owns prefix measurement as well as output. This logger never emits or opens a file.
const measure = new Logger({ name: "", colors: false });

export function displaySource(source: string): string {
	return sources[source] ?? source;
}

export function sourceOf(record: ConsoleRecord, root: string): string {
	if (record.component === root) return "";
	return record.component.startsWith(`${root}.`)
		? record.component.slice(root.length + 1)
		: record.component;
}
export function successful(event: string): boolean {
	return /(?:^|_)(?:ready|completed|loaded|registered|connected|released|passed|updated|stopped)$/.test(
		event,
	);
}
export function recovering(event: string): boolean {
	return /(?:^|_)(?:recovered|available|assigned)$/.test(event);
}
function field(key: string, value: unknown): string {
	if (key === "durationMs" && typeof value === "number")
		return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(2)}s`;
	return `${labels[key] ?? key}=${typeof value === "string" ? value : JSON.stringify(value)}`;
}
function diagnosticError(
	value: Record<string, unknown>,
	stacks: boolean,
): Error {
	const children = Array.isArray(value.errors)
		? value.errors.map((child) => diagnosticError(child, false))
		: [];
	const extra =
		typeof value.errorCount === "number" && value.errorCount > children.length
			? ` (${value.errorCount - children.length} more omitted)`
			: "";
	const error = children.length
		? new AggregateError(children, `${value.hint ?? ""}${extra}`)
		: new Error(String(value.hint ?? ""));
	error.name = `${value.type ?? "Error"}${value.code === undefined ? "" : ` (${value.code})`}${value.status === undefined ? "" : ` / HTTP ${value.status}`}`;
	error.stack = `${error.name}: ${error.message}${stacks && Array.isArray(value.stack) ? value.stack.map((line) => `\n    at ${line}`).join("") : ""}`;
	if (value.cause && typeof value.cause === "object")
		error.cause = diagnosticError(
			value.cause as Record<string, unknown>,
			false,
		);
	return error;
}

/** Prepare safe message content; the dependency draws every timestamp, marker and frame. */
export function humanMessage(
	record: ConsoleRecord,
	context: LogContext,
	options: LogCallOptions,
	root: string,
	width: number,
	full: boolean,
	sourceInName = false,
): string {
	const source = sourceOf(record, root);
	const summary = summaries[`${source}:${record.event}`];
	const prefix = source && !sourceInName ? `${displaySource(source)} · ` : "";
	const lines = [
		prefix + (full ? record.message : (summary?.message ?? record.message)),
	];
	const values = record.context ?? {};
	if (
		!full &&
		source === "sharding.coordinator" &&
		record.event === "listening" &&
		typeof values.address === "string" &&
		typeof values.port === "number"
	) {
		const host = values.address.includes(":")
			? `[${values.address}]`
			: values.address;
		lines[0] = `${prefix}Listening on ${host}:${values.port}`;
	}
	if (full) {
		lines.push(`event=${record.event} component=${record.component}`);
		for (const [key, value] of Object.entries(values))
			lines.push(field(key, value));
	} else {
		const scalarFields = Object.keys(values).filter((key) => {
			const value = values[key];
			return (
				!references.includes(key) &&
				key !== "nextStep" &&
				(value === null ||
					typeof value !== "object" ||
					(Array.isArray(value) &&
						value.every((item) => item === null || typeof item !== "object")))
			);
		});
		const selected = [
			...new Set(summary?.fields ?? [...ordinaryFields, ...scalarFields]),
		].filter(
			(key) =>
				values[key] !== undefined &&
				values[key] !== null &&
				values[key] !== "[REDACTED]" &&
				(!summary || values[key] !== false) &&
				(key !== "destinationHost" || values[key] !== values.host),
		);
		const fields = selected
			.slice(0, 5)
			.map((key) =>
				key === "readyShards" && typeof values.assignedCount === "number"
					? `ready=${values[key]}/${values.assignedCount}`
					: field(key, values[key]),
			);
		if (
			Array.isArray(values.shards) &&
			values.shards.includes("[Truncated]") &&
			typeof values.assignedCount === "number"
		)
			fields.push(`assigned=${values.assignedCount}`);
		if (
			record.event.startsWith("request_") ||
			record.level === "warn" ||
			record.level === "error"
		) {
			const reference = references
				.map((key) => values[key])
				.find((value) => typeof value === "string");
			if (typeof reference === "string")
				fields.push(`ref=${reference.slice(0, 8)}`);
		}
		if (fields.length) lines[0] += ` · ${fields.join(" ")}`;
		if (typeof values.nextStep === "string")
			lines.push(`Next: ${values.nextStep}`);
	}
	if (record.error) {
		const error = diagnosticError(
			record.error,
			full || record.level === "error",
		);
		lines.push(
			formatError(error, { paint: context.paint, relativePaths: true }),
		);
	}
	const layout = options.layout ?? "badge";
	const nativePrefix =
		layout === "box"
			? ""
			: measure.log(context.level, "", {
					name: context.name,
					includeTimestamps: options.includeTimestamps,
					timeformat: options.timeformat,
					layout,
					symbols: options.symbols,
					colors: false,
					raw: true,
				})!;
	const lead = layout === "box" ? 2 : Bun.stringWidth(nativePrefix);
	const available = Math.max(1, width - lead);
	const wrapped = lines.flatMap((line) =>
		line.split("\n").flatMap((part) => wrapText(part, available)),
	);
	const boxCost =
		layout === "box"
			? Buffer.byteLength(context.paint("separator", "│ ")) +
				Buffer.byteLength(context.paint("message", "x")) -
				1
			: 0;
	let remaining = 8192 - 6 * width - 1024;
	const result: string[] = [];
	const omitted = wrapText("… additional details omitted", available)[0];
	for (const [index, line] of wrapped.entries()) {
		const next = index && layout !== "box" ? " ".repeat(lead) + line : line;
		const cost = Buffer.byteLength(next) + boxCost + 1;
		if (
			result.length >= 95 ||
			cost + Buffer.byteLength(omitted) + lead + boxCost + 1 > remaining
		) {
			result.push(layout === "box" ? omitted : " ".repeat(lead) + omitted);
			break;
		}
		remaining -= cost;
		result.push(next);
	}
	return result.join("\n");
}

export function nativeLayout(
	layout: LogLayout | undefined,
	tty: boolean,
	level: string,
	width: number,
	name: string,
): LogLayout {
	if (layout) return layout;
	if (
		width < 48 ||
		Bun.stringWidth(name) > width / 3 ||
		(tty && level === "ERROR")
	)
		return "box";
	return tty && level !== "ALERT" ? "bar" : "badge";
}
