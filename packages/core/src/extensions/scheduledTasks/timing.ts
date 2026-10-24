import { CronExpressionParser } from "cron-parser";
import type {
	TaskJobOptions,
	TaskRepeat,
	TaskSchedulerOptions,
} from "./types/TaskTypes";

export function positiveInteger(name: string, value: number): void {
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new RangeError(`${name} must be a positive safe integer.`);
}
export function nonnegative(name: string, value: number): void {
	if (!Number.isSafeInteger(value) || value < 0)
		throw new RangeError(`${name} must be a non-negative safe integer.`);
}
export function validateSchedulerOptions(options: TaskSchedulerOptions): void {
	for (const key of Object.keys(options))
		if (
			![
				"redis_url",
				"queue",
				"pollInterval",
				"concurrency",
				"leaseDuration",
				"connectionTimeout",
				"commandTimeout",
				"logErrors",
			].includes(key)
		)
			throw new TypeError(
				`Unsupported scheduling option "${key}". See BREAKING_CHANGES.md.`,
			);
	if (
		options.redis_url !== undefined &&
		(typeof options.redis_url !== "string" ||
			!/^redis(?:s|\+tls|\+unix|\+tls\+unix)?:\/\//.test(options.redis_url))
	)
		throw new TypeError(
			"extensions.scheduledtasks.redis_url must be an explicit Redis URL.",
		);
	if (
		options.queue !== undefined &&
		(typeof options.queue !== "string" || !options.queue.trim())
	)
		throw new TypeError("queue must be a non-empty string.");
	for (const key of [
		"pollInterval",
		"concurrency",
		"leaseDuration",
		"connectionTimeout",
		"commandTimeout",
	] as const)
		if (options[key] !== undefined) positiveInteger(key, options[key]);
	if ((options.leaseDuration ?? 30000) < 30)
		throw new RangeError("leaseDuration must be at least 30 milliseconds.");
	for (const key of [
		"pollInterval",
		"leaseDuration",
		"connectionTimeout",
		"commandTimeout",
	] as const)
		if ((options[key] ?? 0) > 2147483647)
			throw new RangeError(
				"Scheduling timer durations must fit a native timer.",
			);
	if (options.logErrors !== undefined && typeof options.logErrors !== "boolean")
		throw new TypeError("logErrors must be boolean.");
}

export function validateJobOptions(options: TaskJobOptions): void {
	positiveInteger("attempts", options.attempts ?? 1);
	nonnegative("retryDelay", options.retryDelay ?? 0);
	if (
		options.jobId !== undefined &&
		(typeof options.jobId !== "string" || !options.jobId.trim())
	)
		throw new TypeError("jobId must be a non-empty string.");
	for (const key of ["removeOnComplete", "removeOnFail"] as const)
		if (options[key] !== undefined && typeof options[key] !== "boolean")
			throw new TypeError(`${key} must be boolean.`);
}

export function validateRepeat(repeat: TaskRepeat): void {
	if (repeat.interval !== undefined) {
		positiveInteger("interval", repeat.interval);
		if (repeat.pattern !== undefined || repeat.timezone !== undefined)
			throw new TypeError("Choose an interval or a cron pattern.");
	} else {
		if (typeof repeat.pattern !== "string" || !repeat.pattern.trim())
			throw new TypeError("Repeated tasks need an interval or cron pattern.");
		new Intl.DateTimeFormat("en", { timeZone: repeat.timezone ?? "UTC" });
		nextOccurrence(repeat, Date.now(), Date.now());
	}
}

export function nextOccurrence(
	repeat: TaskRepeat,
	previous: number,
	now: number,
): number {
	if (repeat.interval)
		return (
			previous +
			Math.max(1, Math.floor((now - previous) / repeat.interval) + 1) *
				repeat.interval
		);
	return CronExpressionParser.parse(repeat.pattern!, {
		currentDate: new Date(now),
		tz: repeat.timezone ?? "UTC",
	})
		.next()
		.getTime();
}

/** Both backends accept the same JSON payloads, without lossy coercion. */
export function clonePayload<T>(value: T): T {
	const ancestors = new Set<object>();
	function visit(entry: unknown): void {
		if (
			entry === null ||
			typeof entry === "string" ||
			typeof entry === "boolean"
		)
			return;
		if (typeof entry === "number" && Number.isFinite(entry)) return;
		if (typeof entry !== "object" || ancestors.has(entry))
			throw new TypeError("Task payloads must be acyclic JSON values.");
		if (
			!Array.isArray(entry) &&
			Object.getPrototypeOf(entry) !== Object.prototype &&
			Object.getPrototypeOf(entry) !== null
		)
			throw new TypeError(
				"Task payloads must use plain JSON objects and arrays.",
			);
		ancestors.add(entry);
		if (Array.isArray(entry)) {
			if (
				Reflect.ownKeys(entry).some(
					(key) =>
						key !== "length" &&
						(typeof key !== "string" ||
							!/^(0|[1-9]\d*)$/.test(key) ||
							Number(key) >= entry.length),
				)
			)
				throw new TypeError(
					"Task array properties must survive JSON serialization.",
				);
			for (let index = 0; index < entry.length; index++) {
				const descriptor = Object.getOwnPropertyDescriptor(
					entry,
					String(index),
				);
				if (!descriptor || !("value" in descriptor))
					throw new TypeError(
						"Task payloads must use dense JSON arrays without accessors.",
					);
				visit(descriptor.value);
			}
		} else
			for (const key of Reflect.ownKeys(entry)) {
				const descriptor = Object.getOwnPropertyDescriptor(entry, key)!;
				if (
					typeof key !== "string" ||
					!descriptor.enumerable ||
					!("value" in descriptor)
				)
					throw new TypeError(
						"Task payloads must use enumerable JSON data properties.",
					);
				visit(descriptor.value);
			}
		ancestors.delete(entry);
	}
	if (value === undefined) return value;
	visit(value);
	return JSON.parse(JSON.stringify(value));
}
