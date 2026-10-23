import { expect, test } from "bun:test";
import {
	Admission,
	admissionCooldownMs,
} from "../../src/sharding/coordinator/Admission";
import { assignment, authority } from "./fixtures/authority";
const limit = {
	total: 10,
	remaining: 10,
	reset_after: 100000,
	max_concurrency: 2,
};

test("startup and memory loss never invent admission authority", async () => {
	const store = await authority(false);
	const other = await authority(false);
	let now = 0;
	const admission = new Admission(store, 1, () => now);
	try {
		admission.update(limit);
		now += admissionCooldownMs;
		expect(
			admission.grant(assignment(), "blocked", performance.now()),
		).toBeUndefined();
		store.change((state) => {
			state.recoveryConfirmed = true;
		});
		expect(
			admission.grant(assignment(), "first", performance.now()),
		).toBeDefined();
		expect(other.state.term).not.toBe(store.state.term);
		expect(other.state.permits).toEqual({});
		expect(other.state.recoveryConfirmed).toBe(false);
		expect(admission.remaining).toBe(9);
	} finally {
		await store.close();
		await other.close();
	}
});

test("unknown sends hold their bucket through delays and duplicates; outcomes anchor cooldown without refunds", async () => {
	const store = await authority();
	let now = 0;
	const a = new Admission(store, 0, () => now);
	try {
		a.update(limit);
		expect(a.grant(assignment(), "one", performance.now())).toBeUndefined();
		now += admissionCooldownMs;
		const permit = a.grant(assignment(), "one", performance.now())!;
		expect(a.grant(assignment(), "one", performance.now())).toEqual(permit);
		expect(
			a.grant(assignment(1), "other-bucket", performance.now()),
		).toBeDefined();
		a.outcome({ assignment: assignment(), attemptId: "one", kind: "unknown" });
		now += 30000;
		expect(a.grant(assignment(2), "two", performance.now())).toBeUndefined();
		expect(() =>
			a.outcome({ assignment: assignment(2), attemptId: "one", kind: "sent" }),
		).toThrow("original reservation");
		a.outcome({ assignment: assignment(), attemptId: "one", kind: "sent" });
		now += admissionCooldownMs - 1;
		expect(a.grant(assignment(2), "two", performance.now())).toBeUndefined();
		a.outcome({ assignment: assignment(), attemptId: "one", kind: "sent" });
		now++;
		expect(a.grant(assignment(2), "two", performance.now())).toBeDefined();
		a.outcome({ assignment: assignment(), attemptId: "one", kind: "sent" });
		now += 30000;
		expect(a.grant(assignment(), "three", performance.now())).toBeUndefined();
		a.fenced(assignment(2));
		now += admissionCooldownMs;
		expect(a.grant(assignment(), "three", performance.now())).toBeDefined();
		expect(a.remaining).toBe(6);
	} finally {
		await store.close();
	}
});

test("revocation never refunds allowance, expiry needs a fresh snapshot, and stale epochs cannot identify", async () => {
	const store = await authority();
	let now = 0;
	const a = new Admission(store, 1, () => now);
	try {
		a.update({ ...limit, remaining: 2 });
		now += admissionCooldownMs;
		expect(a.grant(assignment(), "one", performance.now())).toBeDefined();
		a.outcome({
			assignment: assignment(),
			attemptId: "one",
			kind: "revokedBeforeSend",
		});
		a.update(limit);
		now += admissionCooldownMs;
		expect(a.remaining).toBe(1);
		expect(
			a.grant(assignment(1), "reserved", performance.now()),
		).toBeUndefined();
		now += 200000;
		expect(a.remaining).toBe(0);
		a.update(limit);
		expect(a.remaining).toBe(10);
		store.change((state) => {
			state.leases["0"].phase = "draining";
		});
		expect(() => a.grant(assignment(), "stale", performance.now())).toThrow(
			"current owned",
		);
		expect(
			a.grant(assignment(1), "expired-request", performance.now() - 16000),
		).toBeUndefined();
	} finally {
		await store.close();
	}
});

test("contradictory outcomes stop fleet admission; old concurrency cannot change with unresolved senders", async () => {
	const store = await authority();
	let now = 0;
	const a = new Admission(store, 0, () => now);
	try {
		a.update(limit);
		now += admissionCooldownMs;
		a.grant(assignment(), "one", performance.now());
		expect(() => a.update({ ...limit, max_concurrency: 1 })).toThrow(
			"old admission buckets",
		);
		a.outcome({
			assignment: assignment(),
			attemptId: "one",
			kind: "revokedBeforeSend",
		});
		a.outcome({ assignment: assignment(), attemptId: "one", kind: "sent" });
		expect(store.state.admissionFault).toBeDefined();
		now += admissionCooldownMs;
		expect(a.grant(assignment(1), "two", performance.now())).toBeUndefined();
	} finally {
		await store.close();
	}
});
