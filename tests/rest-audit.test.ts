import { expect, test } from "bun:test";
import { REST } from "virello";

const restOptions = { hashSweepInterval: 0, handlerSweepInterval: 0 };

test("retries and multipart uploads retain each request's encoded audit reason", async () => {
	const reasons: (string | null)[] = [];
	const bodies: unknown[] = [];
	const reason = "Case 42 / caf\u00e9 \u{1f44b}: 50%";
	const rest = new REST({
		...restOptions,
		makeRequest: async (_url, init) => {
			reasons.push(new Headers(init.headers).get("X-Audit-Log-Reason"));
			bodies.push(init.body);
			return reasons.length === 1
				? Response.json(
						{ retry_after: 0.001 },
						{
							status: 429,
							headers: {
								"X-RateLimit-Remaining": "0",
								"X-RateLimit-Reset-After": "0.001",
							},
						},
					)
				: new Response(null, { status: 204 });
		},
	}).setToken("test-token");
	await rest.put("/guilds/1/bans/2", {
		reason,
		body: { delete_message_seconds: 0 },
		files: [{ name: "evidence.txt", data: Buffer.from("evidence") }],
	});
	await rest.put("/guilds/1/bans/3", { reason: "Case 43" });
	expect(reasons).toEqual([
		encodeURIComponent(reason),
		encodeURIComponent(reason),
		"Case%2043",
	]);
	expect(bodies[0]).toBeInstanceOf(FormData);
});

test("Unicode reasons encode once and invalid Unicode fails before transport", async () => {
	const reasons: (string | null)[] = [];
	const rest = new REST({
		...restOptions,
		makeRequest: async (_url, init) => {
			reasons.push(new Headers(init.headers).get("X-Audit-Log-Reason"));
			return new Response(null, { status: 204 });
		},
	}).setToken("test-token");
	await expect(
		rest.delete("/channels/1", { reason: "\ud800" }),
	).rejects.toThrow();
	expect(reasons).toEqual([]);
	const reason = "\u{1f44b} 100%";
	await rest.delete("/channels/1", { reason });
	expect(reasons).toEqual([encodeURIComponent(reason)]);
});

test("independent discord.js REST clients do not share audit attribution", async () => {
	const reasons: (string | null)[] = [];
	const makeRequest: NonNullable<
		ConstructorParameters<typeof REST>[0]
	>["makeRequest"] = async (_url, init) => {
		reasons.push(new Headers(init.headers).get("X-Audit-Log-Reason"));
		return new Response(null, { status: 204 });
	};
	const first = new REST({ ...restOptions, makeRequest }).setToken("test-one");
	const second = new REST({ ...restOptions, makeRequest }).setToken("test-two");
	await Promise.all([
		first.put("/guilds/1/bans/2", { reason: "Case 42" }),
		second.put("/guilds/1/bans/3", { reason: "Case 99" }),
	]);
	expect(reasons.sort()).toEqual(["Case%2042", "Case%2099"]);
});
