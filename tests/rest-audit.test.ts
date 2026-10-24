import { expect, spyOn, test } from "bun:test";
import { RestClient, type $RestRequest } from "../packages/rest/src/index";
import { ControlStore } from "../packages/sharding/src/coordinator/ControlStore";
import { FleetRestScheduler } from "../packages/sharding/src/rest/FleetRestScheduler";
import { RemoteRestScheduler } from "../packages/sharding/src/rest/RemoteRestScheduler";
import type { ShardAssignment } from "../packages/sharding/src/authority";

test("retries and multipart uploads retain the correct unencoded audit reason", async () => {
	const headers: string[] = [];
	const bodies: unknown[] = [];
	const reason = "Case 42 / café 🔒: 50%";
	const rest = new RestClient("test-token", {
		maxConcurrentRequests: 1,
		fetch: async (_url, init) => {
			headers.push(new Headers(init?.headers).get("X-Audit-Log-Reason")!);
			bodies.push(init?.body);
			return headers.length === 1
				? Response.json({ retry_after: 0.001 }, { status: 429 })
				: new Response(null, { status: 204 });
		},
	});
	try {
		const request: $RestRequest = {
			method: "PUT",
			path: "/guilds/1/bans/2",
			reason,
			body: { delete_message_seconds: 0 },
			files: [{ name: "evidence.txt", data: new Blob(["evidence"]) }],
		};
		const first = rest.request(request);
		request.reason = "changed after queueing";
		const second = rest.request({
			method: "PUT",
			path: "/guilds/1/bans/3",
			reason: "Case 43",
		});
		await Promise.all([first, second]);
		expect(
			headers.filter((header) => header === encodeURIComponent(reason)),
		).toHaveLength(2);
		expect(
			headers.filter((header) => header === encodeURIComponent("Case 43")),
		).toHaveLength(1);
		expect(bodies[0]).toBeInstanceOf(FormData);
		expect(headers).not.toContain(encodeURIComponent(request.reason));
	} finally {
		rest.close();
	}
});

test("invalid reasons never reach the scheduler and Unicode reasons are encoded once", async () => {
	const received: $RestRequest[] = [];
	const rest = new RestClient("test-token", {
		scheduler: {
			request: async (request) => {
				received.push(request);
			},
		},
	});
	try {
		for (const reason of [
			"",
			"a".repeat(513),
			"🔒".repeat(513),
			"\ud800",
			42,
		]) {
			await expect(
				rest.request({
					method: "DELETE",
					path: "/channels/1",
					reason: reason as string,
				}),
			).rejects.toThrow();
		}
		expect(received).toHaveLength(0);
		await rest.request({
			method: "DELETE",
			path: "/channels/1",
			reason: "🔒".repeat(512),
		});
		expect(received[0].reason).toBe("🔒".repeat(512));
	} finally {
		rest.close();
	}
});

test("managed REST preserves audit attribution and rejects operation reuse with a different reason", async () => {
	const store = new ControlStore(
		"app",
		1,
		new Map([[0, "host"]]),
		"config",
		true,
	);
	await store.ready;
	const assignment: ShardAssignment = {
		applicationId: "app",
		layoutVersion: store.state.layoutVersion,
		shardId: 0,
		totalShards: 1,
		assignmentEpoch: "1",
		hostId: "host",
		hostBootId: "host-boot",
		workerBootId: "worker-boot",
		deploymentId: "test",
	};
	const capability = "test-capability".padEnd(32, "0");
	store.change((state) => {
		state.leases["0"] = { assignment, capability, phase: "owned" };
	});
	const reasons: string[] = [];
	const fleet = new FleetRestScheduler(store, "test-token", {
		fetch: async (_url, init) => {
			reasons.push(new Headers(init?.headers).get("X-Audit-Log-Reason")!);
			return new Response(null, { status: 204 });
		},
	});
	const remote = new RemoteRestScheduler();
	remote.configure(assignment, {
		url: "https://fleet.invalid/rest",
		capability,
	});
	const rest = new RestClient("test-token", { scheduler: remote });
	const transport = spyOn(globalThis, "fetch").mockImplementation(
		Object.assign(
			async (
				url: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) => fleet.handle(new Request(url, init)),
			{ preconnect: fetch.preconnect },
		),
	);
	try {
		const request: $RestRequest = {
			operationId: "case:42",
			method: "PUT",
			path: "/guilds/1/bans/2",
			reason: "Case 42 🔒",
		};
		await rest.request(request);
		await rest.request(request);
		await expect(
			rest.request({ ...request, reason: "Case 99" }),
		).rejects.toThrow("different payload");
		expect(reasons).toEqual([encodeURIComponent(request.reason!)]);
	} finally {
		transport.mockRestore();
		rest.close();
		await fleet.close();
		await store.close();
	}
});
