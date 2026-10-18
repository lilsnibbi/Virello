import { afterEach, beforeEach, expect, test } from "bun:test";
import type { APIApplicationCommand as ApplicationCommand } from "discord-api-types/v10";
import type { ApplicationCommands } from "../../src/discord/ApplicationCommands";
import {
	ApplicationCommandRegistries,
	ApplicationCommandRegistry,
	createConsoleLogger,
	VirelloClient,
	type LoggerLike,
	logEvent,
	RegisterBehavior,
} from "virello";
import { createBot } from "../../examples/client";
import { onShutdown } from "../../examples/shutdown";
import { formatStats, summarizeStats } from "../../examples/stats";

let client: VirelloClient | undefined;
let detach: (() => void) | undefined;
const exitCode = process.exitCode ?? 0;
let defaultGuildIds = ApplicationCommandRegistries.getDefaultGuildIds();
beforeEach(() => {
	defaultGuildIds = ApplicationCommandRegistries.getDefaultGuildIds();
});
afterEach(async () => {
	detach?.();
	detach = undefined;
	await client?.destroy();
	client = undefined;
	process.exitCode = exitCode;
	ApplicationCommandRegistries.setDefaultGuildIds(defaultGuildIds);
});
function capture() {
	const values = {
		debug: [] as unknown[],
		notif: [] as unknown[],
		alert: [] as unknown[],
		error: [] as unknown[],
	};
	const logger: LoggerLike = {
		debug(value) {
			values.debug.push(value);
		},
		notif(value) {
			values.notif.push(value);
		},
		alert(value) {
			values.alert.push(value);
		},
		error(value) {
			values.error.push(value);
		},
	};
	return { logger, values };
}

test("routing advice identifies the remedy while preserving accepted aliases and numeric IDs", () => {
	const { logger, values } = capture();
	client = new VirelloClient({ intents: [], logger });
	const registry = new ApplicationCommandRegistry("fixture");
	registry.addChatInputCommandIds("fixture", "123456789012345678");
	expect(registry.chatInputCommands.has("fixture")).toBe(true);
	expect(registry.chatInputCommands.has("123456789012345678")).toBe(true);
	expect(values.alert).toHaveLength(1);
	expect(String(values.alert[0])).toContain("numeric Discord command ID");
	expect(String(values.alert[0])).toContain("addChatInputCommandIds");
	expect(String(values.alert[0])).not.toContain("bypass");
	expect(values.debug).toHaveLength(1);
});

for (const behavior of [
	RegisterBehavior.Overwrite,
	RegisterBehavior.LogToConsole,
] as const) {
	test(`command change diagnostics preserve overwrite policy ${behavior}`, async () => {
		const { logger, values } = capture();
		client = new VirelloClient({ intents: [], logger });
		const registry = new ApplicationCommandRegistry("fixture");
		registry.registerChatInputCommand(
			{ name: "fixture", description: "New local description" },
			{ behaviorWhenNotIdentical: behavior },
		);
		let edits = 0;
		const command = {
			id: "123456789012345678",
			name: "fixture",
			description: "Old remote description",
			type: 1,
			options: [],
			dm_permission: true,
			default_member_permissions: null,
			nsfw: false,
			name_localizations: null,
			description_localizations: null,
		} as unknown as ApplicationCommand;
		const commands = {
			edit: async () => {
				edits++;
				return command;
			},
		} as unknown as ApplicationCommands;
		client.application = { id: "application", commands };
		await registry["runAPICalls"](
			commands,
			new Map([[command.id, command]]),
			new Map(),
		);
		expect(edits).toBe(behavior === RegisterBehavior.LogToConsole ? 0 : 1);
		expect(values.error).toHaveLength(0);
		const visible = [...values.notif, ...values.alert].map(String).join("\n");
		expect(visible).toContain(
			behavior === RegisterBehavior.LogToConsole
				? "without updating Discord"
				: "Updated a Discord command",
		);
		expect(visible).toContain("commandId=123456789012345678");
		expect(visible).not.toContain("Old remote description");
		expect(values.debug.map(String).join()).not.toContain("Took ");
	});
}

test("example bot loads current modules, preserves a custom logger, and avoids a duplicate info readiness message", async () => {
	const { logger, values } = capture();
	client = createBot(logger);
	expect(client.logger).toBe(logger);
	await client.load();
	expect([...client.modules.require("commands").keys()].sort()).toEqual([
		"ping",
		"shard",
		"stats",
	]);
	const ready = client.modules.require("listeners").get("ready")!;
	ready.run();
	expect(values.debug.map(String).join()).toContain("cache_ready");
	expect(values.notif).toHaveLength(0);
	expect(values.debug.map(String).join()).not.toContain("ready as");
});

test("example shutdown invokes cleanup once and reports its completion through a custom logger", async () => {
	const { logger, values } = capture();
	const cleanup = Promise.withResolvers<void>();
	let calls = 0;
	detach = onShutdown(
		() => {
			calls++;
			return cleanup.promise;
		},
		{ logger, component: "fixture" },
	);
	const interrupt = process.listeners("SIGINT").at(-1)!;
	const terminate = process.listeners("SIGTERM").at(-1)!;
	interrupt("SIGINT");
	terminate("SIGTERM");
	expect(calls).toBe(1);
	expect(values.notif.map(String).join()).toContain("shutdown_started");
	cleanup.resolve();
	await Bun.sleep(0);
	expect(values.notif.map(String).join()).toContain("Shutdown complete");
});

test("example shutdown retains cleanup failures and returns a failing process status", async () => {
	const { logger, values } = capture();
	const error = new Error("synthetic cleanup cause");
	detach = onShutdown(
		async () => {
			throw error;
		},
		{ logger, component: "fixture" },
	);
	process.listeners("SIGINT").at(-1)!("SIGINT");
	await Bun.sleep(0);
	expect(process.exitCode).toBe(1);
	expect((values.error[0] as Error).cause).toBe(error);
	expect(String(values.error[0])).toContain("before restarting");
});

test("public event logging retains operation wording, original causes and safe default records", () => {
	const logger = createConsoleLogger(
		"fixture",
		{ colors: false },
		{ format: "json", stacks: "off" },
	);
	const entry = {
		component: "commands",
		event: "fixture_failed",
		message: "Could not complete fixture work; inspect its command handler.",
		context: { command: "fixture", token: "private" },
		error: new Error("private payload"),
	};
	const record = JSON.parse(logger.error(entry, true)!);
	expect(record.message).toBe(entry.message);
	expect(record.context.token).toBe("[REDACTED]");
	const custom = capture();
	logEvent(custom.logger, "error", entry);
	expect((custom.values.error[0] as Error).cause).toBe(entry.error);
});

test("console stats describe partial results without changing Discord reply formatting", () => {
	const results = [
		{
			shard: 0,
			ok: true as const,
			value: {
				shard: 0,
				pid: 1,
				guilds: 4,
				uptimeSeconds: 2,
				memoryMb: 20,
				ready: true,
				commands: ["stats"],
			},
		},
		{
			shard: 1,
			ok: false as const,
			error: Object.assign(new Error("fixture"), { code: "TIMEOUT" }) as never,
		},
	];
	expect(summarizeStats(results)).toMatchObject({
		shards: 2,
		responding: 1,
		unavailable: 1,
		ready: 1,
		guilds: 4,
		commands: ["stats"],
	});
	expect(formatStats(results)).toBe(
		"1/2 shards responded; 4 servers on responding shards.\n\nShard 0: ready, 4 servers, 20 MB, up 2s\nShard 1: unavailable (TIMEOUT)",
	);
});

test("live engine example remains explicitly disabled and emits useful console instructions", () => {
	const result = Bun.spawnSync([process.execPath, "examples/engine/live.ts"], {
		cwd: `${import.meta.dir}/../..`,
		env: {
			...process.env,
			VIRELLO_LOG_FORMAT: "json",
			VIRELLO_LOG_LEVEL: "info",
			DISCORD_TOKEN: undefined,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(result.exitCode).toBe(0);
	expect(result.stderr.toString()).toBe("");
	const record = JSON.parse(result.stdout.toString());
	expect(record.event).toBe("live_disabled");
	expect(record.message).toContain("--live");
});

test("example host configuration errors identify the missing setting without network or raw provider output", () => {
	const result = Bun.spawnSync([process.execPath, "examples/host.ts"], {
		cwd: `${import.meta.dir}/../..`,
		env: {
			...process.env,
			VIRELLO_LOG_FORMAT: "json",
			VIRELLO_LOG_LEVEL: "info",
			SHARD_HOST_TOKEN: undefined,
			DISCORD_TOKEN: undefined,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(result.exitCode).toBe(1);
	expect(result.stdout.toString()).toBe("");
	const record = JSON.parse(result.stderr.toString());
	expect(record.context.setting).toBe("SHARD_HOST_TOKEN");
	expect(record.message).toContain("examples/.env");
});
