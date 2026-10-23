import { expect, test } from "bun:test";
import { FleetRestScheduler } from "../../packages/sharding/src/rest/FleetRestScheduler";
import { assignment, authority } from "./fixtures/authority";
import { until } from "./helpers";
import { FakeClock } from "../engine/support";

function request(
	operationId: string,
	key: string | null = "channel-one",
	shard = 0,
	overrides: {
		path?: string;
		auth?: boolean;
		deadlineMs?: number;
	} = {},
) {
	return new Request("http://127.0.0.1/rest", {
		method: "POST",
		headers: {
			authorization: `Bearer test-capability-${shard}-000000000000000000000000`,
		},
		body: JSON.stringify({
			assignment: assignment(shard),
			operationId,
			...(key === null ? {} : { executionKey: key }),
			method: "POST",
			path: "/channels/123/messages",
			body: { content: operationId },
			auth: true,
			deadlineMs: 5000,
			...overrides,
		}),
	});
}

test("fleet mutation IDs deduplicate, unknown effects quarantine ordering keys, and evidence permits later work", async () => {
	const store = await authority();
	let calls = 0;
	const scheduler = new FleetRestScheduler(store, "offline-token", {
		fetch: Object.assign(
			async () => {
				calls++;
				if (calls === 1)
					throw new Error(
						"response lost after the remote side may have committed",
					);
				return Response.json({ id: String(calls) });
			},
			{ preconnect: fetch.preconnect },
		),
	});
	try {
		expect(
			await (await scheduler.handle(request("unknown"))).json(),
		).toMatchObject({ code: "OUTCOME_UNKNOWN" });
		expect(
			await (await scheduler.handle(request("unknown"))).json(),
		).toMatchObject({ code: "OUTCOME_UNKNOWN" });
		expect(
			await (await scheduler.handle(request("later"))).json(),
		).toMatchObject({ code: "EFFECT_QUARANTINED" });
		expect(calls).toBe(1);
		expect(
			await (
				await scheduler.handle(request("independent", "channel-two", 1))
			).json(),
		).toMatchObject({ ok: true });
		await scheduler.reconcile(
			"unknown",
			{ id: "externally-observed" },
			"operator verified message ID and ordering at the endpoint",
		);
		expect(
			await (await scheduler.handle(request("unknown"))).json(),
		).toMatchObject({ ok: true, value: { id: "externally-observed" } });
		expect(
			await (await scheduler.handle(request("later"))).json(),
		).toMatchObject({ ok: true });
		expect(
			await (await scheduler.handle(request("later"))).json(),
		).toMatchObject({ ok: true });
		expect(calls).toBe(3);
	} finally {
		await scheduler.close();
		await store.close();
	}
});

test("workers share one global allowance while initial callbacks bypass held ordinary and unrelated callback work", async () => {
	const store = await authority();
	const clock = new FakeClock();
	const held = Promise.withResolvers<Response>();
	let botSends = 0;
	let callbacks = 0;
	const scheduler = new FleetRestScheduler(store, "offline-token", {
		clock,
		fetch: Object.assign(
			async (input: string | URL) => {
				if (String(input).includes("/interactions/")) {
					callbacks++;
					return callbacks === 1
						? held.promise
						: Response.json({ acknowledged: true });
				}
				botSends++;
				return Response.json({ id: botSends });
			},
			{ preconnect: fetch.preconnect },
		),
	});
	try {
		const burst = Promise.all(
			Array.from({ length: 51 }, (_, i) =>
				scheduler.handle(request(`burst-${i}`, `channel-${i}`, i % 2)),
			),
		);
		await until(() => botSends === 50);
		const first = scheduler.handle(
			request("callback-100", null, 0, {
				auth: false,
				path: "/interactions/100/fixture-one/callback",
				deadlineMs: 1000,
			}),
		);
		await until(() => callbacks === 1);
		const second = await scheduler.handle(
			request("callback-101", null, 1, {
				auth: false,
				path: "/interactions/101/fixture-two/callback",
				deadlineMs: 1000,
			}),
		);
		expect(await second.json()).toMatchObject({ ok: true });
		expect(botSends).toBe(50);
		held.resolve(Response.json({}, { status: 502 }));
		expect(await (await first).json()).toMatchObject({
			code: "OUTCOME_UNKNOWN",
		});
		await clock.advance(1000);
		const results = await burst;
		expect(botSends).toBe(51);
		for (const result of results)
			expect(await result.json()).toMatchObject({ ok: true });
	} finally {
		held.resolve(Response.json({}));
		await scheduler.close();
		await store.close();
	}
});

test("release closes new dispatch, waits for accepted work, and cannot silently cancel an in-flight effect", async () => {
	const store = await authority();
	const response = Promise.withResolvers<Response>();
	let sent = 0;
	const scheduler = new FleetRestScheduler(store, "offline-token", {
		fetch: Object.assign(
			async () => {
				sent++;
				return response.promise;
			},
			{ preconnect: fetch.preconnect },
		),
	});
	try {
		const first = scheduler.handle(request("first"));
		await until(() => sent === 1);
		const queued = scheduler.handle(request("queued"));
		await until(() => scheduler.status.inFlight === 2);
		store.change((state) => {
			state.leases["0"].phase = "draining";
		});
		await expect(scheduler.drain(assignment(), 20)).rejects.toMatchObject({
			code: "RELEASE_UNKNOWN",
		});
		response.resolve(Response.json({ id: "confirmed" }));
		expect(await (await first).json()).toMatchObject({ ok: true });
		expect(await (await queued).json()).toMatchObject({ code: "RELEASED" });
		await scheduler.drain(assignment(), 100);
		expect(sent).toBe(1);
		expect(
			await (await scheduler.handle(request("stale"))).json(),
		).toMatchObject({ code: "RELEASED" });
	} finally {
		response.resolve(Response.json({}));
		await scheduler.close();
		await store.close();
	}
});

test("authenticated 401 opens the fleet credential circuit and memory histories vanish on close", async () => {
	const store = await authority();
	let calls = 0;
	const scheduler = new FleetRestScheduler(store, "offline-token", {
		fetch: Object.assign(
			async () => {
				calls++;
				return Response.json({}, { status: 401 });
			},
			{ preconnect: fetch.preconnect },
		),
	});
	try {
		expect(
			await (await scheduler.handle(request("denied"))).json(),
		).toMatchObject({ status: 401 });
		expect(store.state.credentialBlocked).toBe(true);
		expect(
			await (await scheduler.handle(request("next", "channel-two", 1))).json(),
		).toMatchObject({ code: "CREDENTIAL_BLOCKED" });
		expect(calls).toBe(1);
	} finally {
		await scheduler.close();
		await store.close();
	}
	const fresh = await authority(false);
	try {
		expect(await fresh.operations`SELECT * FROM rest_operations`).toHaveLength(
			0,
		);
		expect(fresh.state.recoveryConfirmed).toBe(false);
	} finally {
		await fresh.close();
	}
});
