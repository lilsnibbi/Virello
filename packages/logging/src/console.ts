import {
	type LogCallOptions,
	type LogContext,
	Logger,
	type LoggerOptions,
	type LogLayout,
	type LogLevel,
} from "@lilsnibbi/logger";
import {
	type ConsoleLogOptions,
	type ConsoleRecord,
	makeRecord,
	serializeRecord,
	supportsColor,
} from "./format";
import {
	displaySource,
	humanMessage,
	nativeLayout,
	recovering,
	successful,
} from "./presentation";
import { dataProperty, safeText } from "./redact";
import { textWidth, wrapText } from "./text";

interface Settings {
	options: Partial<LoggerOptions>;
	output: ConsoleLogOptions;
	format: "text" | "json";
	stacks: "off" | "short" | "full";
	layout?: LogLayout;
	detail?: "compact" | "full";
	secrets: readonly string[];
}
const managed = new WeakMap<object, Settings>();
const levels: Record<string, LogLevel> = {
	debug: "DEBUG",
	info: "NOTIF",
	warn: "ALERT",
	error: "ERROR",
	notif: "NOTIF",
	alert: "ALERT",
};
const methods = {
	debug: "DEBUG",
	notif: "NOTIF",
	alert: "ALERT",
	error: "ERROR",
} as const;

function widthFor(settings: Settings, level: LogLevel): number {
	const columns =
		process[level === "ALERT" || level === "ERROR" ? "stderr" : "stdout"]
			.columns ?? Number(process.env.COLUMNS);
	const detected =
		Number.isInteger(columns) && columns > 0
			? Math.max(32, Math.min(120, columns))
			: 100;
	return textWidth(
		settings.output.width ??
			settings.options.box?.width ??
			Number(process.env.VIRELLO_LOG_WIDTH),
		detected,
	);
}
function nativeOptions(
	settings: Settings,
	name: string,
	level: LogLevel,
	event = "",
): LogCallOptions {
	const stream =
		process[level === "ALERT" || level === "ERROR" ? "stderr" : "stdout"];
	const width = widthFor(settings, level);
	const cleanName = safeText(name, settings.secrets, 96);
	const cleanEvent = safeText(event, settings.secrets, 64);
	const layout =
		settings.format === "json"
			? "badge"
			: nativeLayout(settings.layout, !!stream.isTTY, level, width, cleanName);
	const fittingName =
		settings.format === "json" || layout === "box"
			? cleanName
			: wrapText(cleanName, Math.max(1, width - 36))[0];
	return {
		name: fittingName,
		layout,
		includeTimestamps: settings.options.includeTimestamps ?? true,
		timeformat: settings.options.timeformat,
		colors:
			settings.format === "text" &&
			supportsColor(process.env, !!stream.isTTY, settings.options.colors),
		symbols: {
			DEBUG: "·",
			NOTIF: recovering(cleanEvent) ? "↻" : successful(cleanEvent) ? "✓" : "→",
			ALERT: "!",
			ERROR: "×",
			...settings.options.symbols,
		},
		box: {
			spacing: false,
			topRight: /^[\x20-\x7e]*$/.test(cleanName) ? cleanName : "",
			bottomLeft:
				level === "ERROR" && /^[\x20-\x7e]*$/.test(cleanEvent)
					? cleanEvent
					: "",
			...settings.options.box,
			width,
		},
	};
}
function serialize(
	settings: Settings,
	record: ConsoleRecord,
	context: LogContext,
	options: LogCallOptions,
	root: string,
	level: LogLevel,
	sourceInName = false,
): string {
	if (
		settings.format === "json" ||
		(context.destination === "file" && settings.options.file?.json)
	)
		return serializeRecord(record);
	const full =
		context.destination === "file" ||
		(settings.detail ?? (level === "DEBUG" ? "full" : "compact")) === "full";
	return humanMessage(
		record,
		context,
		options,
		root,
		widthFor(settings, context.level),
		full,
		sourceInName,
	);
}

/**
 * Create a logger with Virello console formatting and the native logger’s streams, filters, and file lifecycle.
 * @param name - Logger name; defaults to Virello.
 * @param options - Native logger settings.
 * @param output - Console formatting and redaction settings.
 * @returns A new logger. Await close() when its resources are no longer needed.
 */
export function createConsoleLogger(
	name = "Virello",
	options: Partial<LoggerOptions> = {},
	output: ConsoleLogOptions = {},
): Logger {
	const requestedLevel = process.env.VIRELLO_LOG_LEVEL?.toLowerCase() ?? "info";
	const level =
		options.level ??
		(Object.hasOwn(levels, requestedLevel) ? levels[requestedLevel] : "NOTIF");
	// Explicit native serialization controls own their original contract.
	if (
		options.format ||
		options.serialize ||
		options.inspectDepth !== undefined ||
		options.relativePaths !== undefined
	)
		return new Logger({ name, level, ...options });
	const layout = options.layout ?? process.env.VIRELLO_LOG_LAYOUT;
	const detail = output.detail ?? process.env.VIRELLO_LOG_DETAIL;
	const stackSetting = output.stacks ?? process.env.VIRELLO_LOG_STACKS;
	const settings: Settings = {
		options,
		output,
		format:
			output.format ??
			(process.env.VIRELLO_LOG_FORMAT === "json" ? "json" : "text"),
		stacks:
			stackSetting === "off" || stackSetting === "full"
				? stackSetting
				: "short",
		layout:
			layout === "badge" || layout === "bar" || layout === "box"
				? layout
				: undefined,
		detail: detail === "compact" || detail === "full" ? detail : undefined,
		secrets: [
			...(output.redact ?? []),
			...Object.entries(process.env).flatMap(([key, value]) =>
				/TOKEN|SECRET|PASSWORD|CREDENTIAL|API[_-]?KEY|CONNECTION_STRING|DATABASE_URL|REDIS_URL|WEBHOOK.*URL/i.test(
					key,
				) && value
					? [value]
					: [],
			),
		]
			.filter((value) => value.length >= 6)
			.sort((a, b) => b.length - a.length)
			.slice(0, 64),
	};
	const root = safeText(options.name ?? name, settings.secrets, 96);
	const defaults = nativeOptions(settings, root, level);
	const prepare = (context: LogContext) =>
		makeRecord(
			context.name,
			context.level,
			context.value,
			context.date,
			settings.stacks,
			settings.secrets,
		);
	const logger: Logger = new Logger({
		...options,
		...defaults,
		name: root,
		level,
		serialize: (_value, context) =>
			serialize(
				settings,
				prepare(context),
				context,
				defaults,
				context.name,
				logger.level,
			),
		format:
			settings.format === "json"
				? (_parts, context) => serializeRecord(prepare(context))
				: undefined,
		transport: options.transport
			? (line, record) =>
					options.transport!(line, {
						...record,
						value: makeRecord(
							record.name,
							record.level,
							record.value,
							record.date,
							settings.stacks,
							settings.secrets,
						),
					})
			: undefined,
	});
	managed.set(logger, settings);
	return logger;
}

/** @internal Also usable with the dependency's raw call option for previews without emitting. */
export function consoleEventOptions(
	logger: Logger,
	level: LogLevel,
	value: unknown,
): LogCallOptions {
	const settings = managed.get(logger)!;
	const root = logger.name;
	const event =
		value && typeof value === "object"
			? dataProperty(value, "event")
			: undefined;
	const component =
		value && typeof value === "object"
			? dataProperty(value, "component")
			: undefined;
	const sourceInName =
		settings.format === "text" && typeof component === "string";
	const displayName = sourceInName ? displaySource(component as string) : root;
	const options = nativeOptions(
		settings,
		displayName,
		level,
		typeof event === "string" ? event : "",
	);
	let record: ConsoleRecord | undefined;
	const prepare = (context: {
		name: string;
		level: LogLevel;
		value: unknown;
		date: Date;
	}) =>
		(record ??= makeRecord(
			root,
			context.level,
			context.value,
			context.date,
			settings.stacks,
			settings.secrets,
		));
	return {
		...options,
		serialize: (_value, context) =>
			serialize(
				settings,
				prepare(context),
				context,
				options,
				root,
				logger.level,
				sourceInName,
			),
		format:
			settings.format === "json"
				? (_parts, context) => serializeRecord(prepare(context))
				: undefined,
		transport: settings.options.transport
			? (line, native) =>
					settings.options.transport!(line, {
						...native,
						value: prepare(native),
					})
			: undefined,
	};
}
/** @internal Supplied logger instances retain the original one-argument, four-method contract. */
export function emitConsoleEvent(
	logger: Logger,
	level: keyof typeof methods,
	value: unknown,
): void {
	logger[level](value, consoleEventOptions(logger, methods[level], value));
}
export function isConsoleLogger(logger: object): logger is Logger {
	return managed.has(logger);
}

let fallback: Logger | undefined;
/** @internal No file, timers, global console interception or network. */
export function fallbackLogger(): Logger {
	return (fallback ??= createConsoleLogger());
}
