import { expect, test } from "bun:test";
import "./fixtures/contracts";
import { ShardLink } from "../../src/sharding/client/Link";
import {
	encode,
	type Frame,
	frame,
	limits,
} from "../../src/sharding/transport/protocol";

function linkFixture() {
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
	);
	const sent: Frame[] = [];
	const stopped: unknown[] = [];
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
			link["onMessage"](encode(message, 65536));
		},
	};
}

test("boot alone does not clear maintenance; an applied lease and healthy registration allow immediate invocation", async () => {
	const f = linkFixture();
	f.link.handle("loginState", () => true);
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
		const timer = f.link["outage"];
		f.receive(frame("healthy", "first-lease"));
		expect(f.link.isConnected).toBe(false);
		f.receive(frame("unavailable"));
		expect(f.link["outage"]).toBe(timer);
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
		expect(f.link["outage"]).toBeUndefined();
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
		expect(f.stopped[0]).toMatchObject({ code: "PROTOCOL" });
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
