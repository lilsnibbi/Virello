import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Logger as DependencyLogger } from "@lilsnibbi/logger";
import {
	createConsoleLogger,
	VirelloClient,
	Logger,
	type LoggerLike,
} from "virello";
import { Extension } from "../../src/core/lifecycle/Extension";
import { consoleEventOptions } from "../../src/core/logging/console";
import { writeEvent, writeLog } from "../../src/core/logging/diagnostics";
import {
	errorDiagnostic,
	type LogEntry,
	makeRecord,
	serializeRecord,
	supportsColor,
} from "../../src/core/logging/format";
import { safeContext, safeText } from "../../src/core/logging/redact";
import { RestError } from "../../src/engine/rest/RestError";

const date = new Date("2026-10-14T12:30:45.123Z");
const entry: LogEntry = {
	component: "tasks",
	event: "task_failed",
	message: "Scheduled task failed.",
	context: { task: "fixture", requestId: "fixture-request", shard: 2 },
};
const keys = [
	"VIRELLO_LOG_LEVEL",
	"VIRELLO_LOG_FORMAT",
	"VIRELLO_LOG_STACKS",
	"VIRELLO_LOG_DETAIL",
	"VIRELLO_LOG_LAYOUT",
	"NO_COLOR",
	"FORCE_COLOR",
	"TERM",
] as const;
const environment = Object.fromEntries(
	keys.map((key) => [key, process.env[key]]),
);
let client: VirelloClient | undefined;
function nativeText(value: unknown, colors = false): string {
	const logger = createConsoleLogger(
		"Virello",
		{ colors, level: "ERROR" },
		{ detail: "full" },
	);
	return logger.log("ERROR", value, {
		...consoleEventOptions(logger, "ERROR", value),
		raw: true,
	})!;
}
afterEach(async () => {
	await client?.destroy();
	client = undefined;
	for (const key of keys) {
		if (environment[key] === undefined) delete process.env[key];
		else process.env[key] = environment[key];
	}
});

describe("console records", () => {
	test("stable UTC severity, component, event and context in text and JSON", () => {
		const record = makeRecord("Virello", "ERROR", entry, date, "off");
		expect(nativeText(entry)).toContain("jobs › Scheduled task failed.");
		expect(nativeText(entry)).toContain("requestId=fixture-request");
		expect(JSON.parse(serializeRecord(record))).toEqual({
			timestamp: date.toISOString(),
			level: "error",
			component: "Virello.tasks",
			event: "task_failed",
			message: "Scheduled task failed.",
			context: entry.context,
		});
	});
	test("all four legacy severities map consistently", () => {
		for (const [level, expected] of Object.entries({
			DEBUG: "debug",
			NOTIF: "info",
			ALERT: "warn",
			ERROR: "error",
		} as const))
			expect(
				makeRecord(
					"Virello",
					level as "DEBUG" | "NOTIF" | "ALERT" | "ERROR",
					"Fixture",
					date,
					"off",
				).level,
			).toBe(expected);
	});
	test("embedded newlines, control sequences and bidi characters cannot forge records", () => {
		const record = makeRecord(
			"Virello\nforged",
			"NOTIF",
			{
				...entry,
				message:
					"Fixture\nFORGED\r\t\x1b[31mred\x1b[0m\x1b]0;title\x07\u202eforged",
				context: { detail: "second\nline" },
			},
			date,
			"off",
		);
		const text = serializeRecord(record);
		expect(text.split("\n")).toHaveLength(1);
		expect(JSON.parse(text).message).toContain(
			"Fixture\\nFORGED\\r\\tredforged",
		);
		expect(text).not.toContain("\x1b");
		expect(text).not.toContain("\u202e");
		expect(JSON.parse(text).message).toContain("\\n");
	});
	test("shared metadata, depth, array, field and UTF-8 record bounds retain correlation", () => {
		const failure = new AggregateError(
			Array.from({ length: 500 }, () => new Error("omitted")),
			"omitted",
		);
		failure.stack = Array.from(
			{ length: 100 },
			(_, index) => `    at /app/src/${"界".repeat(200)}.ts:${index + 1}:3`,
		).join("\n");
		const record = makeRecord(
			"界".repeat(500),
			"ERROR",
			{
				...entry,
				component: "界".repeat(500),
				event: "界".repeat(500),
				message: "界".repeat(50_000),
				error: failure,
				context: {
					requestId: "fixture-request",
					shard: 2,
					...Object.fromEntries(
						Array.from({ length: 100 }, (_, index) => [
							`field${index}`,
							"界".repeat(50_000),
						]),
					),
				},
			},
			date,
			"full",
		);
		const text = serializeRecord(record);
		expect(Buffer.byteLength(text)).toBeLessThanOrEqual(8192);
		expect(text).toContain("fixture-request");
		expect(JSON.parse(text).context.shard).toBe(2);
		const deep = safeContext({
			nested: { deeper: { end: { unreachable: true } } },
			items: Array.from({ length: 100 }, (_, i) => i),
		});
		expect((deep.items as unknown[]).length).toBe(9);
		expect(JSON.stringify(deep)).not.toContain("unreachable");
	});
	test("large metadata cannot hide late correlation or make object-shaped correlation grow stack rows", () => {
		const fields = Object.fromEntries(
			Array.from({ length: 80 }, (_, index) => [
				`field${index}`,
				"\u754c".repeat(320),
			]),
		);
		const record = makeRecord(
			"fixture",
			"ERROR",
			{ ...entry, context: { ...fields, requestId: "late-request" } },
			date,
			"full",
		);
		expect(record.context?.requestId).toBe("late-request");
		const error = new Error("omitted");
		error.stack = Array.from(
			{ length: 20 },
			() => `    at /app/src/${"\u754c".repeat(150)}.ts:1:2`,
		).join("\n");
		const unusual = makeRecord(
			"\u754c".repeat(96),
			"ERROR",
			{
				...entry,
				component: "\u754c".repeat(96),
				event: "\u754c".repeat(64),
				message: "\u754c".repeat(320),
				error,
				context: { requestId: fields },
			},
			date,
			"full",
		);
		expect(Buffer.byteLength(serializeRecord(unusual))).toBeLessThanOrEqual(
			8192,
		);
	});
	test("getters, toJSON, circular context and hostile proxies do not execute arbitrary serialization", () => {
		const getter = spyOn(
			{
				read() {
					throw new Error("getter invoked");
				},
			},
			"read",
		);
		const value: Record<string, unknown> = { safe: 1, toJSON: getter };
		Object.defineProperty(value, "unsafe", { get: getter, enumerable: true });
		value.self = value;
		expect(safeContext(value)).toEqual({ safe: 1, self: "[Circular]" });
		expect(getter).not.toHaveBeenCalled();
		const hostile = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error("hostile");
				},
			},
		);
		expect(() => safeContext({ hostile })).not.toThrow();
		const revoked = Proxy.revocable({}, {});
		revoked.revoke();
		expect(() =>
			makeRecord("fixture", "ERROR", revoked.proxy, date, "full"),
		).not.toThrow();
	});
});

describe("redaction and diagnostics", () => {
	test("private keys are recursively redacted while counts remain useful", () => {
		const context = safeContext({
			token: "private",
			apiKey: "private",
			inputTokens: 12,
			outputTokens: 4,
			nested: {
				headers: { authorization: "private" },
				body: "private",
				username: "private",
				argument: "private",
			},
			list: [{ sessionId: "private", durationMs: 8 }],
		});
		expect(JSON.stringify(context)).not.toContain("private");
		expect(context.inputTokens).toBe(12);
		expect(context.outputTokens).toBe(4);
		expect(context.apiKey).toBe("[REDACTED]");
	});
	test("credentials, URLs, route secrets, queries and email addresses are removed from text", () => {
		const text = safeText(
			"https://user:password@example.test/api/webhooks/id/secret?token=private redis://:password@redis.test/0 Bot private-auth api_key=private-key person@example.test /api/webhooks/id/private-route /interactions/id/private-interaction/callback /path?secret=private-query fixture:secret",
			["fixture:secret"],
		);
		for (const privateValue of [
			"password",
			"private",
			"fixture:secret",
			"person@example.test",
			"redis.test",
		])
			expect(text).not.toContain(privateValue);
		expect(text).toContain("https://example.test");
		expect(safeText("fixture%3Asecret", ["fixture:secret"])).toBe("[REDACTED]");
		expect(safeText("fixture\x1b[31m-secret", ["fixture-secret"])).toBe(
			"[REDACTED]",
		);
		expect(safeText("fixture\ud800", ["fixture\ud800"])).toBe("[REDACTED]");
	});
	test("error messages, bodies and arbitrary properties stay private while safe codes and hints survive", () => {
		const error = Object.assign(new Error("private-message"), {
			code: "ECONNREFUSED",
			token: "private-token",
			payload: "private-body",
		});
		const diagnostic = errorDiagnostic(error, "off");
		expect(diagnostic.code).toBe("ECONNREFUSED");
		expect(diagnostic.hint).toContain("Connection refused");
		expect(JSON.stringify(diagnostic)).not.toContain("private");
		const rest = errorDiagnostic(
			new RestError(403, {
				code: 50013,
				message: "private-provider-body",
				token: "private",
			}),
			"off",
		);
		expect(rest).toMatchObject({
			type: "RestError",
			status: 403,
			code: "50013",
		});
		expect(JSON.stringify(rest)).not.toContain("private");
	});
	test("cause cycles, aggregates, primitive throws and inaccessible error properties remain bounded", () => {
		const error = new Error("private");
		error.cause = error;
		expect(errorDiagnostic(error, "off").cause).toEqual({
			type: "CircularCause",
		});
		const aggregate = errorDiagnostic(
			new AggregateError(
				Array.from({ length: 100 }, () => error),
				"private",
			),
			"off",
		);
		expect(aggregate.errorCount).toBe(100);
		expect(aggregate.errors as unknown[]).toHaveLength(3);
		expect(errorDiagnostic("private")).toMatchObject({ type: "NonError" });
		const getter = spyOn(
			{
				read() {
					throw new Error("private");
				},
			},
			"read",
		);
		Object.defineProperty(error, "code", { get: getter });
		expect(() => errorDiagnostic(error)).not.toThrow();
		expect(getter).not.toHaveBeenCalled();
	});
	test("short/full/off stacks bound source locations without message lines or function labels", () => {
		const error = new Error("private");
		error.stack =
			"Error: private\n    at privateLabel (C:\\bot\\src\\commands\\fixture.ts:42:3)\n    at privateLabel (/app/node_modules/vendor/src/fixture.ts:9:2)\n" +
			Array.from(
				{ length: 20 },
				(_, index) =>
					`    at privateLabel (/app/src/events/fixture.ts:${index + 1}:4)`,
			).join("\n");
		expect(errorDiagnostic(error, "off").stack).toBeUndefined();
		const short = errorDiagnostic(error, "short").stack as string[];
		expect(short).toHaveLength(3);
		expect(short[0]).toBe("src/commands/fixture.ts:42:3");
		expect(short.join()).not.toContain("vendor");
		expect(errorDiagnostic(error, "full").stack as string[]).toHaveLength(10);
		const text = nativeText({ ...entry, error });
		expect(text.match(/\bERROR\b/gm)).toHaveLength(1);
		expect(text.match(/fixture-request/g)).toHaveLength(1);
		expect(
			text.split("\n").filter((line) => line.includes(".ts (L")),
		).toHaveLength(3);
		expect(text).not.toContain("private");
	});
	test("consumer modules outside src and relative stacks keep useful source locations", () => {
		const error = new Error("omitted");
		error.stack =
			"Error: omitted\n    at run (/bot/commands/fixture.ts:9:2)\n    at run (commands/relative.ts:10:3)\n    at dependency (C:\\bot\\NODE_MODULES\\vendor\\src\\fixture.ts:1:2)";
		expect(errorDiagnostic(error, "short").stack).toEqual([
			"commands/fixture.ts:9:2",
			"commands/relative.ts:10:3",
		]);
	});
});

describe("default and customized loggers", () => {
	test("NO_COLOR, TERM=dumb and explicit color disable take precedence; JSON has no ANSI", () => {
		expect(supportsColor({}, false)).toBe(false);
		expect(supportsColor({}, true)).toBe(true);
		expect(supportsColor({ FORCE_COLOR: "1" }, false)).toBe(true);
		expect(supportsColor({ NO_COLOR: "", FORCE_COLOR: "1" }, true)).toBe(false);
		expect(supportsColor({ TERM: "dumb", FORCE_COLOR: "1" }, true)).toBe(false);
		expect(supportsColor({ FORCE_COLOR: "0" }, true)).toBe(false);
		expect(supportsColor({ FORCE_COLOR: "1" }, true, false)).toBe(false);
		const record = makeRecord("fixture", "NOTIF", "Fixture", date, "off");
		delete process.env.NO_COLOR;
		delete process.env.FORCE_COLOR;
		process.env.TERM = "xterm";
		expect(nativeText(entry, true)).toContain("\x1b[");
		expect(serializeRecord(record)).not.toContain("\x1b");
	});
	test("environment defaults and invalid settings are safe; explicit options and mutable level/name work", () => {
		process.env.VIRELLO_LOG_LEVEL = "constructor";
		process.env.VIRELLO_LOG_FORMAT = "invalid";
		process.env.VIRELLO_LOG_STACKS = "invalid";
		expect(createConsoleLogger().level).toBe("NOTIF");
		expect(
			createConsoleLogger("fixture", {
				format: undefined,
				colors: false,
			}).notif("Fixture", true),
		).toContain("NOTIF");
		process.env.VIRELLO_LOG_LEVEL = "WaRn";
		expect(createConsoleLogger().level).toBe("ALERT");
		const logger = createConsoleLogger(
			"fixture",
			{ level: "DEBUG", colors: false },
			{ format: "json", stacks: "off", redact: ["fixture-secret"] },
		);
		expect(logger).toBeInstanceOf(DependencyLogger);
		logger.setLevel("ERROR");
		expect(logger.notif("hidden", true)).toBeUndefined();
		logger.name = "renamed";
		expect(JSON.parse(logger.error("fixture-secret", true)!)).toMatchObject({
			component: "renamed",
			message: "[REDACTED]",
		});
	});
	test("exported Logger and explicit formatter/serializer/layout customizations retain their contract", () => {
		expect(Logger).toBe(DependencyLogger);
		const format = spyOn(
			{
				hook(_parts: unknown, _context: unknown) {
					return "custom-format";
				},
			},
			"hook",
		);
		const serialize = spyOn(
			{
				hook(_value: unknown, _context: unknown) {
					return "custom-serialization";
				},
			},
			"hook",
		);
		const logger = createConsoleLogger("custom", {
			format,
			serialize,
			silent: false,
			colors: false,
		});
		expect(logger.notif("fixture", true)).toBe("custom-format");
		expect(serialize.mock.calls[0]?.length).toBe(2);
		const box = createConsoleLogger("custom", { layout: "box", colors: false });
		expect(box.notif("fixture", true)).toContain("fixture");
		expect(box.notif("fixture", true)?.split("\n").length).toBeGreaterThan(1);
	});
	test("a supplied four-method logger keeps identity, this binding, settings and original causes", async () => {
		const values: unknown[] = [];
		const custom: LoggerLike = Object.freeze({
			debug() {},
			notif() {},
			alert() {},
			error(value: unknown) {
				expect(this as LoggerLike).toBe(custom);
				values.push(value);
			},
		});
		const cause = new Error("original");
		class Broken extends Extension {
			static override setup() {
				throw cause;
			}
		}
		client = new VirelloClient({
			intents: [],
			logger: custom,
			loggerOptions: { name: "ignored", silent: true },
			logging: { format: "json" },
			extensions: { custom: [Broken] },
		});
		expect(client.logger).toBe(custom);
		expect(values).toHaveLength(1);
		expect(values[0]).toBeInstanceOf(Error);
		expect((values[0] as Error).cause).toBe(cause);
		writeLog(custom, "error", "Legacy diagnostic", cause);
		expect((values[1] as Error).cause).toBe(cause);
	});
	test("framework failure logs use the same safe formatter and do not disclose extension errors", async () => {
		const sink = spyOn(process.stderr, "write").mockImplementation(() => true);
		class Broken extends Extension {
			static override setup() {
				throw Object.assign(new Error("private-extension-content"), {
					code: "ECONNREFUSED",
				});
			}
		}
		client = new VirelloClient({
			intents: [],
			logging: { format: "json", stacks: "off" },
			loggerOptions: { colors: false },
			extensions: { custom: [Broken] },
		});
		const text = sink.mock.calls.map((args) => String(args[0])).join("");
		expect(text).not.toContain("private-extension-content");
		expect(JSON.parse(text)).toMatchObject({
			component: "Virello.extensions",
			event: "setup_failed",
			context: { extension: "Broken" },
			error: { code: "ECONNREFUSED" },
		});
	});
	test("writeEvent keeps a single operation/error record at the correct stream", () => {
		const sink = spyOn(process.stderr, "write").mockImplementation(() => true);
		writeEvent(
			createConsoleLogger(
				"fixture",
				{ colors: false },
				{ format: "json", stacks: "off" },
			),
			"error",
			{
				...entry,
				error: new Error("omitted"),
			},
		);
		expect(sink).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(sink.mock.calls[0]?.[0])).event).toBe(
			"task_failed",
		);
	});
	test("a failed custom sink cannot replace an application operation with a logging failure", async () => {
		const sink = spyOn(process.stderr, "write").mockImplementation(() => true);
		const broken: LoggerLike = {
			debug() {
				throw new Error("private-logger-failure");
			},
			notif() {},
			alert() {},
			error() {},
		};
		client = new VirelloClient({ intents: [], logger: broken });
		await expect(client.load()).resolves.toBeUndefined();
		const output = sink.mock.calls.map((args) => String(args[0])).join("");
		expect(output.replaceAll(/\s+/g, " ")).toContain(
			"Logger failed while reporting an operation.",
		);
		expect(output).not.toContain("private-logger-failure");
	});
	test.each(["text", "json"] as const)(
		"piped/Docker-style %s output separates stdout/stderr, filters debug and scrubs environment credentials",
		(format) => {
			const result = Bun.spawnSync(
				[process.execPath, `${import.meta.dir}/../fixtures/logging.ts`],
				{
					env: {
						...process.env,
						VIRELLO_LOG_LEVEL: "info",
						VIRELLO_LOG_FORMAT: format,
						VIRELLO_LOG_STACKS: "off",
						VIRELLO_FIXTURE_TOKEN: "fixture-env-credential",
						NO_COLOR: undefined,
						FORCE_COLOR: undefined,
						TERM: "xterm",
					},
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			expect(result.exitCode).toBe(0);
			const stdout = result.stdout.toString();
			const stderr = result.stderr.toString();
			for (const text of [stdout, stderr]) {
				expect(text).not.toContain("\x1b");
				expect(text).not.toContain("fixture-private");
				expect(text).not.toContain("fixture-env-credential");
				expect(text).not.toContain("fixture-query");
				expect(text).not.toContain("hidden routine detail");
			}
			if (format === "json") {
				expect(stdout.trim().split("\n")).toHaveLength(1);
				expect(stderr.trim().split("\n")).toHaveLength(2);
				expect(JSON.parse(stdout).level).toBe("info");
				expect(
					stderr
						.trim()
						.split("\n")
						.map((line) => JSON.parse(line).level),
				).toEqual(["warn", "error"]);
			} else {
				expect(stdout.match(/^\[[^\n]+\]\s+NOTIF\b/gm)).toHaveLength(1);
				expect(stderr.match(/^\[[^\n]+\]\s+(?:ALERT|ERROR)\b/gm)).toHaveLength(
					2,
				);
				expect(stdout).toContain("NOTIF");
				expect(stderr).toContain("ALERT");
				expect(stderr).toContain("ERROR");
			}
		},
	);
});
