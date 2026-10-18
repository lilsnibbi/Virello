import { describe, expect, test } from "bun:test";
import { RateLimits, routeKey } from "../../src/engine/rest/RateLimits";
import { RestClient } from "../../src/engine/rest/RestClient";
import { RestError } from "../../src/engine/rest/RestError";
import { FakeClock, flush } from "./support";

function json(
	body: unknown = { ok: true },
	status = 200,
	headers?: HeadersInit,
): Response {
	return new Response(JSON.stringify(body), { status, headers });
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function hanging(_input: string | URL, init?: RequestInit): Promise<Response> {
	return new Promise((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
			once: true,
		});
	});
}

describe("engine REST", () => {
	test("rejects encoded dot-segment traversal before submitting a request", async () => {
		let calls = 0;
		const client = new RestClient("offline", {
			fetch: async () => {
				calls++;
				return json();
			},
		});
		try {
			for (const path of [
				"/..",
				"/%2e%2e/users/@me",
				"/.%2E/users/@me",
				"/%2e./users/@me",
				"/channels/.\t./users/@me",
				"/.. ",
				"/.%2e\u0000",
			]) {
				await expect(client.request({ method: "GET", path })).rejects.toThrow(
					"without traversal",
				);
			}
			expect(calls).toBe(0);
		} finally {
			client.close();
		}
	});

	test("overlapping learned-bucket 429 responses preserve the longest active cooldown", async () => {
		const clock = new FakeClock();
		const responses = [deferred<Response>(), deferred<Response>()];
		let calls = 0;
		const client = new RestClient("offline", {
			clock,
			fetch: async () => responses[calls++]?.promise ?? json(),
		});
		const requests = [
			client.request({ method: "GET", path: "/channels/20/messages" }),
			client.request({ method: "GET", path: "/channels/20/pins" }),
		];
		try {
			responses[0].resolve(
				json({ retry_after: 0.25 }, 429, { "x-ratelimit-bucket": "shared" }),
			);
			await flush();
			responses[1].resolve(
				json({ retry_after: 0.01 }, 429, { "x-ratelimit-bucket": "shared" }),
			);
			await flush();
			await clock.advance(249);
			expect(calls).toBe(2);
			await clock.advance(1);
			await Promise.all(requests);
			expect(calls).toBe(4);
		} finally {
			client.close();
			await Promise.allSettled(requests);
		}
	});

	test("normalizes query and minor IDs while preserving major partitions and hiding interaction tokens", () => {
		expect(routeKey("GET", "/channels/20/messages/100?limit=1")).toEqual(
			routeKey("GET", "/channels/20/messages/200?limit=2"),
		);
		expect(routeKey("GET", "/channels/20/messages").major).toBe("channels:20");
		expect(routeKey("GET", "/channels/21/messages")).not.toEqual(
			routeKey("GET", "/channels/20/messages"),
		);
		expect(routeKey("POST", "/interactions/100/secret-a/callback")).toEqual(
			routeKey("POST", "/interactions/200/secret-b/callback"),
		);
		expect(
			routeKey("POST", "/interactions/100/secret-a/callback").route,
		).not.toContain("secret-a");
		expect(routeKey("GET", "/webhooks/1/token-a").major).not.toBe(
			routeKey("GET", "/webhooks/1/token-b").major,
		);
	});

	test("fractional reset-after and learned buckets delay matching majors only", async () => {
		const clock = new FakeClock();
		const rates = new RateLimits(clock);
		const first = routeKey("GET", "/channels/20/messages");
		const second = routeKey("GET", "/channels/20/pins");
		const other = routeKey("GET", "/channels/21/pins");
		rates.observe(
			first,
			new Headers({
				"x-ratelimit-bucket": "shared",
				"x-ratelimit-remaining": "1",
			}),
		);
		rates.observe(
			second,
			new Headers({
				"x-ratelimit-bucket": "shared",
				"x-ratelimit-remaining": "0",
				"x-ratelimit-reset-after": "0.125",
			}),
		);
		expect(rates.key(first)).toBe(rates.key(second));
		expect(rates.readyAt(first)).toBe(125);
		expect(rates.readyAt(other)).toBe(0);
		await clock.advance(125);
		expect(rates.readyAt(first)).toBeLessThanOrEqual(clock.now());
	});

	test("independent majors progress concurrently while the same normalized route serializes", async () => {
		const hold = deferred<Response>();
		const seen: string[] = [];
		const client = new RestClient("offline", {
			fetch: async (input) => {
				seen.push(String(input));
				return seen.length === 1 ? hold.promise : json();
			},
		});
		const first = client.getMessage("20", "100");
		const same = client.getMessage("20", "101");
		const other = client.getMessage("21", "102");
		await flush();
		expect(seen).toHaveLength(2);
		expect(seen[1]).toContain("/channels/21/");
		hold.resolve(json());
		await Promise.all([first, same, other]);
		expect(seen).toHaveLength(3);
		expect(client.pendingRequests).toBe(0);
		client.close();
	});

	test("429 body retry_after overrides header and global cooldown gates new routes", async () => {
		const clock = new FakeClock();
		const calls: string[] = [];
		const client = new RestClient("offline", {
			clock,
			fetch: async (input) => {
				calls.push(String(input));
				return calls.length === 1
					? json({ retry_after: 0.25, global: true }, 429, {
							"retry-after": "5",
						})
					: json();
			},
		});
		const first = client.getChannel("20");
		await flush();
		const second = client.getChannel("21");
		await clock.advance(249);
		expect(calls).toHaveLength(1);
		await clock.advance(1);
		await Promise.all([first, second]);
		expect(calls).toHaveLength(3);
		expect(clock.pending).toBe(0);
		client.close();
	});

	test("429 header fallback retries and rate retry cap returns structured error", async () => {
		const clock = new FakeClock();
		let calls = 0;
		const client = new RestClient("offline", {
			clock,
			maxRateLimitRetries: 1,
			fetch: async () => {
				calls++;
				return json({ message: "limited" }, 429, {
					"retry-after": "0.01",
					"x-ratelimit-global": "true",
				});
			},
		});
		const result = client.getChannel("20").catch((error: unknown) => error);
		await flush();
		await clock.advance(10);
		const error = await result;
		expect(error).toBeInstanceOf(RestError);
		expect((error as RestError).status).toBe(429);
		expect(calls).toBe(2);
		client.close();
	});

	for (const method of ["GET", "PUT", "DELETE"] as const) {
		for (const failure of ["transport", "server"] as const) {
			test(`${method} retries ${failure} failures with bounded backoff`, async () => {
				const clock = new FakeClock();
				let calls = 0;
				const client = new RestClient("offline", {
					clock,
					maxRetries: 1,
					fetch: async () => {
						if (++calls === 1) {
							if (failure === "transport") throw new Error("offline transport");
							return json({ message: "server" }, 503);
						}
						return json({ recovered: true });
					},
				});
				const result = client.request({ method, path: "/channels/20" });
				await flush();
				await clock.advance(499);
				expect(calls).toBe(1);
				await clock.advance(1);
				expect(await result).toEqual({ recovered: true });
				expect(calls).toBe(2);
				client.close();
			});
		}
	}

	for (const method of ["POST", "PATCH"] as const) {
		test(`${method} never retries ambiguous transport or server errors`, async () => {
			for (const transport of [true, false]) {
				let calls = 0;
				const client = new RestClient("offline", {
					fetch: async () => {
						calls++;
						if (transport) throw new Error("ambiguous");
						return json({ message: "server" }, 500);
					},
				});
				await expect(
					client.request({ method, path: "/channels/20" }),
				).rejects.toThrow();
				expect(calls).toBe(1);
				client.close();
			}
		});
	}

	test("4xx errors preserve status and body without retrying", async () => {
		let calls = 0;
		const client = new RestClient("offline", {
			fetch: async () => {
				calls++;
				return json({ code: 50013 }, 403);
			},
		});
		const error = await client
			.getChannel("20")
			.catch((cause: unknown) => cause);
		expect(error).toBeInstanceOf(RestError);
		expect((error as RestError).body).toEqual({ code: 50013 });
		expect(calls).toBe(1);
		client.close();
	});

	test("queued abort and close release capacity and cancel inflight fetch", async () => {
		const client = new RestClient("offline", {
			fetch: hanging,
			maxPendingRequests: 2,
		});
		const active = client.getChannel("20").catch((cause: unknown) => cause);
		await flush();
		const controller = new AbortController();
		const queued = client
			.getChannel("20", controller.signal)
			.catch((cause: unknown) => cause);
		expect(client.pendingRequests).toBe(2);
		await expect(client.getChannel("21")).rejects.toThrow("capacity");
		controller.abort(new Error("cancel queued"));
		expect(await queued).toEqual(new Error("cancel queued"));
		expect(client.pendingRequests).toBe(1);
		client.close();
		expect(await active).toEqual(new Error("REST client closed."));
		await flush();
		expect(client.pendingRequests).toBe(0);
		await expect(client.getChannel("20")).rejects.toThrow("closed");
	});

	test("timeout aborts an attempt and clears timers", async () => {
		const clock = new FakeClock();
		const client = new RestClient("offline", {
			clock,
			fetch: hanging,
			timeoutMs: 25,
			maxRetries: 0,
		});
		const result = client.getChannel("20").catch((cause: unknown) => cause);
		await flush();
		await clock.advance(25);
		expect(await result).toEqual(new Error("REST request timed out."));
		expect(clock.pending).toBe(0);
		client.close();
	});

	test("rejects invalid JSON and oversized bodies, accepts 204 and plain error bodies", async () => {
		const responses = [
			new Response("invalid"),
			new Response("123456"),
			new Response(null, { status: 204 }),
			new Response("no", { status: 400 }),
		];
		const client = new RestClient("offline", {
			maxRetries: 0,
			maxResponseBytes: 5,
			fetch: async () => responses.shift()!,
		});
		await expect(client.getChannel("20")).rejects.toThrow("maxResponseBytes");
		await expect(client.getChannel("20")).rejects.toThrow("maxResponseBytes");
		expect(await client.getChannel("20")).toBeUndefined();
		const error = await client
			.getChannel("20")
			.catch((cause: unknown) => cause);
		expect((error as RestError).body).toBe("no");
		client.close();
		const invalid = new RestClient("offline", {
			maxRetries: 0,
			fetch: async () => new Response("bad"),
		});
		await expect(invalid.getChannel("20")).rejects.toThrow("invalid JSON");
		invalid.close();
	});

	test("queued request body is snapshotted before caller mutation", async () => {
		const hold = deferred<Response>();
		const bodies: (BodyInit | null | undefined)[] = [];
		const client = new RestClient("offline", {
			fetch: async (_input, init) => {
				bodies.push(init?.body);
				return bodies.length === 1 ? hold.promise : json();
			},
		});
		const body = { content: "original" };
		const first = client.createMessage("20", { content: "first" });
		const second = client.createMessage("20", body);
		body.content = "changed";
		await flush();
		hold.resolve(json());
		await Promise.all([first, second]);
		expect(bodies[1]).toBe('{"content":"original"}');
		client.close();
	});

	test("learned shared buckets serialize distinct routes with the same major", async () => {
		const hold = deferred<Response>();
		let calls = 0;
		const client = new RestClient("offline", {
			fetch: async () => {
				calls++;
				return calls === 3
					? hold.promise
					: json({}, 200, { "x-ratelimit-bucket": "shared" });
			},
		});
		await client.request({ method: "GET", path: "/channels/20/messages" });
		await client.request({ method: "GET", path: "/channels/20/pins" });
		const first = client.request({
			method: "GET",
			path: "/channels/20/messages",
		});
		const second = client.request({ method: "GET", path: "/channels/20/pins" });
		await flush();
		expect(calls).toBe(3);
		hold.resolve(json({}, 200, { "x-ratelimit-bucket": "shared" }));
		await Promise.all([first, second]);
		expect(calls).toBe(4);
		client.close();
	});

	test("pending bound includes retry delays while other lanes remain available", async () => {
		const clock = new FakeClock();
		let calls = 0;
		const client = new RestClient("offline", {
			clock,
			maxPendingRequests: 1,
			fetch: async () => {
				return ++calls === 1 ? json({}, 503) : json();
			},
		});
		const pending = client.getChannel("20");
		await flush();
		expect(client.pendingRequests).toBe(1);
		await expect(client.getChannel("21")).rejects.toThrow("capacity");
		await clock.advance(500);
		await pending;
		expect(client.pendingRequests).toBe(0);
		expect(clock.pending).toBe(0);
		client.close();
	});

	test("configured concurrency bounds independent routes", async () => {
		const hold = deferred<Response>();
		let calls = 0;
		const client = new RestClient("offline", {
			maxConcurrentRequests: 2,
			fetch: async () => {
				calls++;
				return calls <= 2
					? hold.promise.then((response) => response.clone())
					: json();
			},
		});
		const requests = ["20", "21", "22"].map((id) => client.getChannel(id));
		await flush();
		expect(calls).toBe(2);
		hold.resolve(json());
		await Promise.all(requests);
		expect(calls).toBe(3);
		client.close();
	});

	test("invalid retry_after fails explicitly and zero delay cannot spin", () => {
		const clock = new FakeClock();
		const rates = new RateLimits(clock);
		const route = routeKey("GET", "/channels/20");
		for (const retry_after of [-1, Number.NaN, 86401]) {
			expect(() =>
				rates.limited(route, new Headers(), { retry_after }),
			).toThrow("usable retry_after");
		}
		expect(() => rates.limited(route, new Headers(), {})).toThrow(
			"usable retry_after",
		);
		rates.limited(route, new Headers(), { retry_after: 0 });
		expect(rates.readyAt(route)).toBe(1);
	});
	test("native loopback fetch sends helper paths, JSON and authentication correctly", async () => {
		const requests: { path: string; auth: string | null; body: unknown }[] = [];
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: async (request) => {
				requests.push({
					path: new URL(request.url).pathname,
					auth: request.headers.get("authorization"),
					body: await request.json(),
				});
				return new Response(null, { status: 204 });
			},
		});
		const client = new RestClient("offline-test-token", {
			baseURL: `${server.url.href}api/v10`,
		});
		try {
			await client.createMessage("20", { content: "hello" });
			await client.interactionCallback("100", "offline-interaction", {
				type: 4,
				data: { content: "callback" },
			});
			expect(requests).toEqual([
				{
					path: "/api/v10/channels/20/messages",
					auth: "Bot offline-test-token",
					body: { content: "hello" },
				},
				{
					path: "/api/v10/interactions/100/offline-interaction/callback",
					auth: null,
					body: { type: 4, data: { content: "callback" } },
				},
			]);
		} finally {
			client.close();
			await server.stop(true);
		}
	});
});
