import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { Socket } from "../../../src/sharding/transport/socket";
import { tokenA, until } from "../helpers";

async function example(
	script: string,
	env: Record<string, string | undefined>,
	preload = false,
) {
	const child = Bun.spawn(
		[
			process.execPath,
			...(preload
				? ["--preload", "./tests/sharding/fixtures/coordinatorMetadata.ts"]
				: []),
			script,
		],
		{
			cwd: `${import.meta.dir}/../../..`,
			env: { ...process.env, ...env },
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			windowsHide: true,
			ipc: preload ? () => {} : undefined,
			serialization: "json",
		},
	);
	let stdout = "";
	let stderr = "";
	let ended = false;
	void child.exited.then(() => {
		ended = true;
	});
	const read = async (
		stream: ReadableStream<Uint8Array>,
		append: (value: string) => void,
	) => {
		const decoder = new TextDecoder();
		for await (const value of stream)
			append(decoder.decode(value, { stream: true }));
		append(decoder.decode());
	};
	const reading = Promise.all([
		read(child.stdout, (value) => {
			stdout += value;
		}),
		read(child.stderr, (value) => {
			stderr += value;
		}),
	]);
	return {
		child,
		get stdout() {
			return stdout;
		},
		get stderr() {
			return stderr;
		},
		async finish() {
			const code = await child.exited;
			await reading;
			return code;
		},
		async stop() {
			if (!ended) {
				if (preload) {
					try {
						child.send({ fixture: "shutdown" });
					} catch {
						child.kill("SIGTERM");
					}
				} else child.kill("SIGTERM");
			}
			await until(() => ended, 10000).catch(() => child.kill(9));
			await child.exited;
			await reading;
		},
	};
}

/** Exercise same-instance duplicate rejection and fresh admission using the actual example entrypoints. */
export async function captureConsoleSession(width: number) {
	const folder = mkdtempSync(join(tmpdir(), "virello-console-session-"));
	if (!resolve(folder).startsWith(resolve(tmpdir()) + sep))
		throw new Error("Unexpected fixture folder.");
	const env = {
		DISCORD_TOKEN: "fixture-discord-secret-never-use",
		SHARD_HOST_TOKEN: tokenA,
		SHARD_HOST_ID: "local",
		SHARD_COUNT: "1",
		SHARD_WORKERS: "",
		SHARD_COORDINATOR_HOST: "127.0.0.1",
		SHARD_COORDINATOR_PORT: "0",
		SHARD_TLS_CERT: "",
		SHARD_TLS_KEY: "",
		VIRELLO_LOG_FORMAT: "text",
		VIRELLO_LOG_LEVEL: "info",
		VIRELLO_LOG_DETAIL: "full",
		VIRELLO_LOG_STACKS: "short",
		VIRELLO_LOG_WIDTH: String(width),
		VIRELLO_TEST_CONTROL_SHUTDOWN: "1",
		NO_COLOR: "1",
		FORCE_COLOR: "0",
	};
	const coordinator = await example("examples/coordinator.ts", env, true);
	const attempts: Awaited<ReturnType<typeof example>>[] = [];
	let peer: InstanceType<typeof Socket> | undefined;
	try {
		await until(() => /\bport[=\s]+\d+/.test(coordinator.stdout), 10000);
		const port = coordinator.stdout.match(/\bport[=\s]+(\d+)/)![1];
		const url = `ws://127.0.0.1:${port}/sharding`;
		const instance = "console-supervisor";
		peer = new Socket(url, {
			headers: {
				authorization: `Bearer ${tokenA}`,
				"x-virello-worker": "local",
				"x-virello-instance": instance,
			},
		});
		let welcomed = false;
		let closed = false;
		peer.addEventListener("message", (event) => {
			welcomed = JSON.parse(event.data).op === "welcome";
		});
		peer.addEventListener("close", () => {
			closed = true;
		});
		await until(() => welcomed);
		const hostEnv = {
			...env,
			SHARD_COORDINATOR_URL: url,
			VIRELLO_TEST_SUPERVISOR_INSTANCE: instance,
		};
		const active = await example("examples/host.ts", hostEnv, true);
		attempts.push(active);
		await until(() => active.stderr.includes("connection_waiting"), 10000);
		await active.stop();
		const activeExit = await active.finish();
		// This socket never leased a child. Closing it frees connection admission without releasing any shard lease.
		peer.close(1000);
		await until(
			() =>
				closed &&
				coordinator.stdout
					.replaceAll(/\s+/g, " ")
					.includes("Host disconnected"),
		);
		peer = new Socket(url, {
			headers: {
				authorization: `Bearer ${tokenA}`,
				"x-virello-worker": "local",
				"x-virello-instance": instance,
			},
		});
		let recovered = false;
		peer.addEventListener("message", (event) => {
			recovered = JSON.parse(event.data).op === "welcome";
		});
		await until(() => recovered);
		await coordinator.stop();
		return {
			width,
			coordinator: coordinator.stdout + coordinator.stderr,
			host: active.stdout + active.stderr,
			activeExit,
			recovered,
			coordinatorExit: await coordinator.finish(),
		};
	} finally {
		peer?.terminate();
		await Promise.all(attempts.map((attempt) => attempt.stop()));
		await coordinator.stop();
		rmSync(folder, { recursive: true, force: true });
	}
}

if (import.meta.main)
	console.log(
		JSON.stringify(await captureConsoleSession(Number(Bun.argv[2] ?? 100))),
	);
