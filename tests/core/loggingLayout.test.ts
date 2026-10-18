import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { Logger, type LogLayout, type LogLevel } from "@lilsnibbi/logger";
import {
	consoleEventOptions,
	createConsoleLogger,
} from "../../src/core/logging/console";
import { writeEvent } from "../../src/core/logging/diagnostics";
import { errorDiagnostic, type LogEntry } from "../../src/core/logging/format";

const requestId = "8efd2288-ed6e-4c61-abdc-a69c283449c6";
const connectionId = "68f0d1d7-8bc9-489a-b381-031a9c6e9ae6";
const generation = "7f3c361e-56c7-4452-a529-363b18e9c6aa";
const entry: LogEntry = {
	component: "sharding.coordinator",
	event: "upgrade_rejected",
	message:
		"Host ID is reserved by an earlier supervisor; the new instance cannot take ownership.",
	context: {
		host: "local",
		status: 409,
		reason: "ownership_reserved",
		requestId,
		connectionId,
		generation,
	},
};
const keys = [
	"VIRELLO_LOG_WIDTH",
	"VIRELLO_LOG_DETAIL",
	"VIRELLO_LOG_LAYOUT",
	"VIRELLO_LOG_FORMAT",
	"COLUMNS",
	"NO_COLOR",
	"FORCE_COLOR",
	"TERM",
];
const env = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const descriptors = [process.stdout, process.stderr].map((stream) =>
	Object.getOwnPropertyDescriptor(stream, "isTTY"),
);
afterEach(() => {
	for (const [key, value] of Object.entries(env)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	for (const [index, stream] of [process.stdout, process.stderr].entries()) {
		if (descriptors[index])
			Object.defineProperty(stream, "isTTY", descriptors[index]!);
		else Reflect.deleteProperty(stream, "isTTY");
	}
});
function render(
	value: LogEntry,
	options: {
		width?: number;
		format?: "text" | "json";
		detail?: "compact" | "full";
		layout?: LogLayout;
		colors?: boolean;
		level?: LogLevel;
		name?: string;
	} = {},
) {
	const logger = createConsoleLogger(
		options.name ?? "Example",
		{ level: "DEBUG", colors: options.colors ?? false, layout: options.layout },
		{
			width: options.width ?? 100,
			format: options.format ?? "text",
			detail: options.detail ?? "full",
			stacks: "full",
		},
	);
	const level = options.level ?? "ALERT";
	return logger.log(level, value, {
		...consoleEventOptions(logger, level, value),
		raw: true,
	})!;
}
function fits(text: string, width: number) {
	expect(
		Bun.stripANSI(text)
			.split("\n")
			.every((line) => Bun.stringWidth(line) <= width),
	).toBe(true);
	expect(Buffer.byteLength(text)).toBeLessThanOrEqual(8192);
}
const content = (text: string) =>
	Bun.stripANSI(text).replaceAll(/^│ /gm, "").replaceAll(/\s/g, "");
for (const width of [32, 64, 100]) {
	test(`native human displays fit ${width} columns and detailed output retains full correlations`, () => {
		const text = render(entry, { width });
		fits(text, width);
		for (const ref of [requestId, connectionId, generation])
			expect(content(text)).toContain(ref);
		expect(text).toContain("ALERT");
		expect(content(text)).toContain("event=upgrade_rejected");
		expect(content(text)).toContain("component=Example.sharding.coordinator");
		expect(text).not.toContain("UTC /");
		expect(
			JSON.parse(render(entry, { width, format: "json", colors: true })),
		).toMatchObject({
			level: "warn",
			component: "Example.sharding.coordinator",
			event: "upgrade_rejected",
			context: entry.context,
		});
	});
}
test("compact login stages stay distinct and fit on one line each at normal width", () => {
	const context = {
		host: "local",
		shard: 0,
		connectionId,
		generation,
		requestId,
		pendingIdentifies: 1,
		durationMs: 2570,
		remaining: 991,
	};
	const events = ["identify_queued", "identify_granted", "identify_completed"];
	const messages = ["Login queued", "Login permitted", "Login confirmed"];
	for (const [index, event] of events.entries()) {
		const value = {
			...entry,
			event,
			context,
			message: "Original full gateway lifecycle detail.",
		};
		const text = render(value, {
			level: "NOTIF",
			detail: "compact",
			width: 100,
		});
		expect(text.split("\n")).toHaveLength(1);
		expect(text).toContain(messages[index]);
		expect(text).toContain("host=local");
		expect(text).toContain("shard=0");
		expect(text).not.toContain(connectionId);
		expect(text).not.toContain("trace");
		expect(text).not.toContain(event);
		expect(
			JSON.parse(
				render(value, { level: "NOTIF", format: "json", detail: "compact" }),
			).context,
		).toEqual(context);
	}
});
for (const layout of ["badge", "bar", "box"] as const) {
	test(`native ${layout} layout uses per-event display options without replacing its formatter`, () => {
		const logger = createConsoleLogger(
			"Example",
			{ layout, colors: false },
			{ width: 64, detail: "compact" },
		);
		expect(logger).toBeInstanceOf(Logger);
		const options = consoleEventOptions(logger, "ALERT", entry);
		expect(options.format).toBeUndefined();
		expect(options.layout).toBe(layout);
		const text = logger.log("ALERT", entry, { ...options, raw: true })!;
		fits(text, 64);
		if (layout === "box") expect(text).toStartWith("┌ ");
		else expect(text).toStartWith("[");
	});
}
test("automatic native displays distinguish routine terminal activity, warnings, errors and recovery", () => {
	for (const stream of [process.stdout, process.stderr])
		Object.defineProperty(stream, "isTTY", { value: true, configurable: true });
	const logger = createConsoleLogger("Example", { colors: false });
	expect(
		consoleEventOptions(logger, "NOTIF", { ...entry, event: "ready" }),
	).toMatchObject({ layout: "bar", symbols: { NOTIF: "✓" } });
	expect(
		consoleEventOptions(logger, "NOTIF", {
			...entry,
			event: "ownership_recovered",
		}),
	).toMatchObject({
		layout: "bar",
		symbols: { NOTIF: "↻" },
	});
	expect(consoleEventOptions(logger, "ALERT", entry).layout).toBe("badge");
	expect(consoleEventOptions(logger, "ERROR", entry).layout).toBe("box");
});
test("native themes, symbols and mutable theme settings work without shared per-call mutation", () => {
	delete process.env.NO_COLOR;
	delete process.env.FORCE_COLOR;
	process.env.TERM = "xterm";
	const symbols = { NOTIF: "OK" };
	const box = { bottomRight: "caller corner", spacing: false };
	const logger = createConsoleLogger("Example", {
		layout: "bar",
		colors: true,
		symbols,
		box,
	});
	logger.setTheme({ NOTIF: { color: "green", bold: true } });
	const value = { ...entry, event: "ready", context: { shard: 0 } };
	const text = logger.log("NOTIF", value, {
		...consoleEventOptions(logger, "NOTIF", value),
		raw: true,
	})!;
	expect(text).toContain("\x1b[");
	expect(Bun.stripANSI(text)).toContain("▌ OK");
	expect(symbols).toEqual({ NOTIF: "OK" });
	expect(box).toEqual({ bottomRight: "caller corner", spacing: false });
	process.env.NO_COLOR = "";
	expect(
		logger.log("NOTIF", value, {
			...consoleEventOptions(logger, "NOTIF", value),
			raw: true,
		}),
	).not.toContain("\x1b");
});
test("native error trees preserve safe codes, causes, aggregates and bounded source locations", () => {
	const cause = Object.assign(new Error("private-cause"), {
		code: "ECONNREFUSED",
	});
	const error = new AggregateError(
		[cause, new TypeError("private-child")],
		"private-message",
		{ cause },
	);
	error.stack =
		"AggregateError: private-message\n    at run (/app/src/example.ts:42:3)";
	const text = render(
		{ ...entry, component: "host", event: "startup_failed", error },
		{ width: 64, level: "ERROR", layout: "box" },
	);
	fits(text, 64);
	expect(text).toContain("AggregateError");
	expect(text).toContain("caused by");
	expect(text).toContain("aggregated");
	expect(content(text)).toContain("src/example.ts(L42C3)");
	expect(text).not.toContain("private-");
});

test("native error and stack theme tokens stay effective across wrapped error output", () => {
	delete process.env.NO_COLOR;
	delete process.env.FORCE_COLOR;
	process.env.TERM = "xterm";
	const logger = createConsoleLogger(
		"Example",
		{
			layout: "box",
			colors: true,
			theme: { errorName: { color: "magenta" }, stackFile: { color: "cyan" } },
		},
		{ width: 64 },
	);
	const error = new Error("private-provider");
	error.stack = `Error: private-provider\n    at /app/src/${"long".repeat(30)}.ts:1:2`;
	const value = { ...entry, error };
	const text = logger.log("ERROR", value, {
		...consoleEventOptions(logger, "ERROR", value),
		raw: true,
	})!;
	fits(text, 64);
	expect(text).toContain("\x1b[35m");
	expect(text).toContain("\x1b[36m");
	expect(text).not.toContain("private-provider");
});

test("large late metadata cannot evict request, connection, route or generation correlations", () => {
	const fields = Object.fromEntries(
		Array.from({ length: 80 }, (_, index) => [
			`field${index}`,
			"界".repeat(320),
		]),
	);
	const value = {
		...entry,
		context: {
			...fields,
			requestId,
			connectionId,
			generation,
			routeId: "fixture-route",
		},
	};
	for (const format of ["text", "json"] as const) {
		const text = render(value, { width: 64, format });
		expect(Buffer.byteLength(text)).toBeLessThanOrEqual(8192);
		for (const ref of [requestId, connectionId, generation, "fixture-route"])
			expect(content(text)).toContain(ref);
	}
});
test("Unicode, injected controls and large errors stay bounded under native framing", () => {
	const error = new Error("private-message");
	error.stack = Array.from(
		{ length: 20 },
		() => `    at /app/src/${"界".repeat(150)}.ts:1:2`,
	).join("\n");
	const value = {
		...entry,
		component: "界".repeat(80),
		event: "界".repeat(64),
		message: `${"Readable 👋 e\u0301 界 ".repeat(50)}\nFORGED\x1b[31m`,
		context: {
			requestId,
			connectionId,
			generation,
			nested: { list: [{ name: "界".repeat(320) }] },
		},
		error,
	};
	for (const width of [32, 64, 100]) {
		const text = render(value, {
			width,
			level: "ERROR",
			colors: false,
			name: "界".repeat(96),
		});
		fits(text, width);
		expect(content(text)).toContain(requestId);
		expect(text).not.toContain("private-");
		expect(text).not.toContain("\x1b");
		expect(text).not.toContain("\nFORGED");
	}
});
test("JSON stays one undecorated record when native box and theme settings are enabled", () => {
	const logger = createConsoleLogger(
		"Example",
		{ layout: "box", box: { spacing: true }, colors: true },
		{ format: "json" },
	);
	const text = logger.log("ERROR", entry, {
		...consoleEventOptions(logger, "ERROR", entry),
		raw: true,
	})!;
	expect(text.split("\n")).toHaveLength(1);
	expect(text).not.toContain("\x1b");
	expect(JSON.parse(text)).toMatchObject({
		component: "Example.sharding.coordinator",
		context: entry.context,
	});
});

test("source labels are not duplicated when the root logger shares their name", () => {
	const text = render(
		{
			...entry,
			event: "identify_completed",
			context: { host: "local", shard: 0 },
		},
		{
			name: "coordinator",
			level: "NOTIF",
			detail: "compact",
		},
	);
	expect(text.match(/coordinator/g)).toHaveLength(1);
});

test("factory-created loggers retain caller overrides of their native level methods", () => {
	const logger = createConsoleLogger("Example");
	const sink = spyOn(logger, "notif").mockImplementation(() => undefined);
	writeEvent(logger, "notif", entry);
	expect(sink).toHaveBeenCalledTimes(1);
	expect(sink.mock.calls[0][0]).toBe(entry);
});

for (const options of [{ inspectDepth: 0 }, { relativePaths: false }]) {
	test(`explicit native serialization control ${Object.keys(options)[0]} retains the dependency contract`, () => {
		const settings = {
			name: "Example",
			colors: false,
			includeTimestamps: false,
			...options,
		};
		const native = new Logger(settings);
		const factory = createConsoleLogger("Example", settings);
		const error = new Error("caller-owned-provider-message");
		error.stack =
			"Error: caller-owned-provider-message\n    at /app/src/fixture.ts:1:2";
		expect(factory.error(error, true)).toBe(native.error(error, true));
		expect(factory.notif({ nested: { value: 1 } }, true)).toBe(
			native.notif({ nested: { value: 1 } }, true),
		);
	});
}

test("native framing uses sanitized event and source names without leaking redacted credentials", () => {
	const logger = createConsoleLogger(
		"private-credential",
		{ layout: "box", colors: false },
		{ redact: ["private-credential"], width: 64 },
	);
	const value = {
		component: "private-credential",
		event: "private-credential",
		message: "Failure details.",
		error: new Error("private-credential"),
	};
	const text = logger.log("ERROR", value, {
		...consoleEventOptions(logger, "ERROR", value),
		raw: true,
	})!;
	fits(text, 64);
	expect(text).not.toContain("private-credential");
	expect(text).toContain("[REDACTED]");
});
test("native filters, transport and JSON files keep full safe records when console level filters them", async () => {
	const folder = mkdtempSync(join(tmpdir(), "virello-native-logging-"));
	if (!resolve(folder).startsWith(resolve(tmpdir()) + sep))
		throw new Error("Unexpected fixture path.");
	const filter = mock(() => true);
	const transport = mock((_line: string, _record: unknown) => {});
	const logger = createConsoleLogger(
		"Example",
		{
			level: "ERROR",
			filter,
			transport,
			file: {
				directory: folder,
				filename: "fixture",
				rotate: "never",
				json: true,
				level: "DEBUG",
			},
		},
		{ detail: "compact" },
	);
	try {
		writeEvent(logger, "debug", {
			...entry,
			context: { ...entry.context, token: "private-credential" },
			error: new Error("private-provider"),
		});
		await logger.flush();
		const file = readFileSync(logger.filePath!, "utf8").trim();
		expect(file).not.toContain("private-");
		const native = JSON.parse(file);
		expect(native.level).toBe("DEBUG");
		expect(JSON.parse(native.message)).toMatchObject({
			event: entry.event,
			context: { connectionId, generation, requestId, token: "[REDACTED]" },
		});
		expect(filter).toHaveBeenCalledTimes(1);
		expect(transport).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(transport.mock.calls)).not.toContain("private-");
		expect(transport.mock.calls[0][1]).toMatchObject({
			value: { event: entry.event, context: { requestId } },
		});
	} finally {
		await logger.close();
		rmSync(folder, { recursive: true, force: true });
	}
});
test("DEBUG defaults to full metadata and an explicit compact choice remains respected", () => {
	const value = { ...entry, event: "host_connected" };
	const verbose = createConsoleLogger("Example", {
		level: "DEBUG",
		colors: false,
	});
	expect(
		verbose.log("NOTIF", value, {
			...consoleEventOptions(verbose, "NOTIF", value),
			raw: true,
		}),
	).toContain(connectionId);
	const compact = createConsoleLogger(
		"Example",
		{ level: "DEBUG", colors: false },
		{ detail: "compact" },
	);
	expect(
		compact.log("NOTIF", value, {
			...consoleEventOptions(compact, "NOTIF", value),
			raw: true,
		}),
	).not.toContain(connectionId);
});
test("text width options override environment and default terminal width stays capped", () => {
	process.env.VIRELLO_LOG_WIDTH = "64";
	process.env.COLUMNS = "400";
	const message =
		"A readable line of operational detail with predictable wrapping. ".repeat(
			5,
		);
	const text = (width?: number) =>
		createConsoleLogger("fixture", { colors: false }, { width }).notif(
			message,
			true,
		)!;
	fits(text(), 64);
	expect(
		text(100)
			.split("\n")
			.some((line) => Bun.stringWidth(line) > 64),
	).toBe(true);
	process.env.VIRELLO_LOG_WIDTH = "3";
	fits(text(), 120);
	expect(
		text()
			.split("\n")
			.some((line) => Bun.stringWidth(line) > 100),
	).toBe(true);
	process.env.COLUMNS = "invalid";
	fits(text(), 100);
});
test("SQLite diagnostics distinguish transient locks, invalid structure and storage failures", () => {
	for (const [code, hint] of [
		["SQLITE_BUSY", "locked"],
		["SQLITE_CORRUPT", "damaged database structure"],
		["SQLITE_NOTADB", "not a valid SQLite"],
		["SQLITE_IOERR", "I/O failed"],
		["SQLITE_FULL", "storage is full"],
		["SQLITE_READONLY", "read-only"],
	]) {
		const diagnostic = errorDiagnostic(
			Object.assign(new Error("private-provider-text"), { code }),
			"off",
		);
		expect(diagnostic.code).toBe(code);
		expect(diagnostic.hint).toContain(hint);
		expect(JSON.stringify(diagnostic)).not.toContain("private-provider-text");
	}
});
