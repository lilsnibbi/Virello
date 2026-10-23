import { expect, test } from "bun:test";
import "./fixtures/contracts";
import { ShardLink } from "../../src/sharding/client/Link";
import { logger } from "./helpers";
import { assignment as identity } from "./fixtures/authority";
import {
	encode,
	type Frame,
	frame,
	limits,
} from "../../src/sharding/transport/protocol";

function linkFixture(
	assignment: (
		shard: number | null,
		count: number,
	) => Promise<void> = async () => {},
) {
	const link = new ShardLink(
		{
			shard: 0,
			count: 1,
			generation: "test-generation",
			limits: limits(),
			identifyTimeoutMs: 1000,
			shutdownTimeoutMs: 1000,
		},
		async () => {},
		undefined,
		{ maintenance() {}, assignment, available() {}, logger },
	);
	const sent: Frame[] = [];
	const stopped: unknown[] = [];
	let sequence = 0;
	// Drive one IPC batch without sending to the test runner's parent or exiting the runner.
	link["send"] = (message) => {
		sent.push(message);
	};
	link["stop"] = async (_code, cause) => {
		stopped.push(cause);
	};
	return {
		link,
		sent,
		stopped,
		receive(message: Frame) {
			if (message.op === "assign" && message.data.shard !== null)
				message = {
					...message,
					data: {
						...message.data,
						assignment: {
							...identity(message.data.shard),
							totalShards: message.data.count,
							workerBootId: "test-generation",
						},
					},
				};
			if (message.op === "invoke" && !message.data.assignment)
				message = {
					...message,
					data: {
						...message.data,
						assignment: {
							...identity(message.data.target),
							totalShards: 1,
							workerBootId: "test-generation",
						},
					},
				};
			link["onMessage"](encode({ ...message, sequence: ++sequence }, 65536));
		},
	};
}

test("boot alone does not clear maintenance; an applied lease and healthy registration allow immediate invocation", async () => {
	const f = linkFixture();
	let invoked = 0;
	f.link.handle("loginState", () => {
		invoked++;
		return true;
	});
	const connecting = f.link.connect();
	void connecting.catch(() => {});
	try {
		const boot = f.sent.find((message) => message.op === "boot")!;
		f.receive(frame("reply", boot.id, { ok: true, value: null }));
		expect(f.link.isConnected).toBe(false);
		f.receive(
			frame("assign", "assignment", { shard: 0, count: 1, reason: "" }),
		);
		await Bun.sleep(0);
		expect(
			f.sent.some(
				(message) => message.op === "applied" && message.id === "assignment",
			),
		).toBe(true);
		f.receive(frame("healthy", "assignment"));
		f.receive(
			frame("invoke", "immediate-invocation", {
				source: -1,
				target: 0,
				generation: "test-generation",
				name: "loginState",
				payload: null,
				timeoutMs: 1000,
			}),
		);
		await connecting;
		await Bun.sleep(0);
		expect(f.stopped).toHaveLength(0);
		expect(f.link.isConnected).toBe(true);
		expect(
			f.sent.find((message) => message.op === "result")?.data.result,
		).toEqual({ ok: true, value: true });
		// A reused process must not execute a delayed invocation for another epoch.
		f.receive(
			frame("invoke", "stale-epoch", {
				source: -1,
				target: 0,
				generation: "test-generation",
				name: "loginState",
				payload: null,
				timeoutMs: 1000,
				assignment: {
					...identity(),
					workerBootId: "test-generation",
					totalShards: 1,
					assignmentEpoch: "999",
				},
			}),
		);
		await Bun.sleep(0);
		expect(invoked).toBe(1);
		expect(
			f.sent
				.filter((message) => message.op === "result")
				.find((message) => message.id === "stale-epoch")?.data.result,
		).toMatchObject({ ok: false, error: { code: "DISCONNECTED" } });
		expect(f.stopped).toHaveLength(0);
	} finally {
		await f.link.close();
	}
});

test("a stale healthy acknowledgement after disconnect cannot clear maintenance", async () => {
	const f = linkFixture();
	const connecting = f.link.connect();
	void connecting.catch(() => {});
	try {
		f.receive(
			frame("reply", f.sent.find((message) => message.op === "boot")!.id, {
				ok: true,
				value: null,
			}),
		);
		f.receive(
			frame("assign", "first-lease", { shard: 0, count: 1, reason: "" }),
		);
		await Bun.sleep(0);
		f.receive(frame("unavailable"));
		f.receive(frame("healthy", "first-lease"));
		expect(f.link.isConnected).toBe(false);
		f.receive(frame("unavailable"));
		f.receive(
			frame("assign", "taken", {
				shard: null,
				count: 1,
				reason: "LEASE_TAKEN",
			}),
		);
		await Bun.sleep(0);
		f.receive(frame("healthy", "taken"));
		expect(f.link.id).toBeNull();
		expect(f.stopped).toHaveLength(0);
	} finally {
		await f.link.close();
	}
});

test("unknown, rejected or late boot replies cannot activate a shard connection", async () => {
	const f = linkFixture();
	const connecting = f.link.connect();
	void connecting.catch(() => {});
	try {
		const boot = f.sent.find((message) => message.op === "boot")!;
		f.receive(frame("reply", "unknown-boot", { ok: true, value: null }));
		expect(f.link.isConnected).toBe(false);
		f.receive(
			frame("invoke", "premature-invocation", {
				source: -1,
				target: 0,
				generation: "test-generation",
				name: "loginState",
				payload: null,
				timeoutMs: 1000,
			}),
		);
		expect(f.stopped).toHaveLength(0);
		expect(
			f.sent.find((message) => message.op === "result")?.data.result,
		).toMatchObject({
			ok: false,
			error: { code: "DISCONNECTED" },
		});
		expect(f.link.isConnected).toBe(false);
		f.receive(
			frame("reply", boot.id, {
				ok: false,
				error: { code: "AUTH", message: "Fixture rejection." },
			}),
		);
		await expect(connecting).rejects.toMatchObject({ code: "AUTH" });
		expect(f.link.isConnected).toBe(false);
		f.receive(frame("reply", boot.id, { ok: true, value: null }));
		expect(f.link.isConnected).toBe(false);
		await f.link.close();
		f.receive(frame("reply", boot.id, { ok: true, value: null }));
		expect(f.link.isConnected).toBe(false);
	} finally {
		await f.link.close();
	}
});

test("disconnect discards queued assignments and delayed application acknowledgements", async () => {
	const gate = Promise.withResolvers<void>();
	const applied: (number | null)[] = [];
	const f = linkFixture(async (shard) => {
		applied.push(shard);
		if (shard === 1) await gate.promise;
	});
	const connecting = f.link.connect();
	void connecting.catch(() => {});
	try {
		f.receive(frame("reply", f.sent[0].id, { ok: true, value: null }));
		f.receive(frame("assign", "slow", { shard: 1, count: 2, reason: "" }));
		await Bun.sleep(0);
		f.receive(frame("assign", "queued", { shard: 0, count: 2, reason: "" }));
		f.receive(frame("unavailable"));
		gate.resolve();
		await Bun.sleep(0);
		f.receive(frame("healthy", "slow"));
		f.receive(frame("healthy", "queued"));
		expect(applied).toEqual([1]);
		expect(f.sent.filter((message) => message.op === "applied")).toEqual([]);
		expect(f.link.isConnected).toBe(false);
		expect(f.link.shardCount).toBe(1);
		f.receive(frame("assign", "fresh", { shard: 0, count: 2, reason: "" }));
		await Bun.sleep(0);
		f.receive(frame("healthy", "fresh"));
		await connecting;
		expect(f.link.isConnected).toBe(true);
		expect(f.link.shardCount).toBe(2);
		expect(f.stopped).toHaveLength(0);
	} finally {
		gate.resolve();
		await f.link.close();
	}
});

test("a delayed identify reply cannot grant authority after disconnect or abort", async () => {
	const f = linkFixture();
	const connecting = f.link.connect();
	void connecting.catch(() => {});
	const abort = new AbortController();
	try {
		f.receive(frame("reply", f.sent[0].id, { ok: true, value: null }));
		f.receive(frame("assign", "first", { shard: 0, count: 1, reason: "" }));
		await Bun.sleep(0);
		f.receive(frame("healthy", "first"));
		await connecting;
		let granted = false;
		const pending = f.link.waitForIdentify(0, abort.signal).then(() => {
			granted = true;
		});
		void pending.catch(() => {});
		await Bun.sleep(0);
		const identify = f.sent.find((message) => message.op === "identify")!;
		f.receive(frame("unavailable"));
		f.receive(frame("reply", identify.id, { ok: true, value: null }));
		abort.abort();
		await expect(pending).rejects.toThrow();
		expect(granted).toBe(false);
		expect(f.stopped).toHaveLength(0);
	} finally {
		abort.abort();
		await f.link.close();
	}
});
