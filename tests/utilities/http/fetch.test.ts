import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { HttpError, request } from "../../../src/utilities/http/index";

let server: ReturnType<typeof Bun.serve>;
let url: string;
beforeAll(() => {
	server = Bun.serve({
		port: 0,
		fetch: async (req) => {
			const path = new URL(req.url).pathname;
			if (path === "/missing")
				return Response.json({ success: false }, { status: 404 });
			if (path === "/empty") return new Response(null, { status: 204 });
			if (path === "/echo")
				return Response.json({
					body: await req.text(),
					type: req.headers.get("content-type"),
				});
			return Response.json({ test: true });
		},
	});
	url = server.url.href;
});
afterAll(() => server.stop(true));
describe("native HTTP request helper", () => {
	test("JSON is the default response", async () =>
		expect(await request<{ test: boolean }>(url)).toEqual({ test: true }));
	test("explicit JSON and headers work", async () =>
		expect(
			await request<{ test: boolean }>(url, {
				headers: { accept: "application/json" },
				response: "json",
			}),
		).toEqual({ test: true }));
	test("URL instances work", async () =>
		expect(await request(new URL(url), { response: "text" })).toBe(
			'{"test":true}',
		));
	test("text response", async () =>
		expect(await request(url, { response: "text" })).toBe('{"test":true}'));
	test("bytes response avoids blob copies", async () =>
		expect(await request(url, { response: "bytes" })).toEqual(
			new TextEncoder().encode('{"test":true}'),
		));
	test("blob response", async () =>
		expect(await (await request(url, { response: "blob" })).text()).toBe(
			'{"test":true}',
		));
	test("raw response remains unread", async () => {
		const response = await request(url, { response: "response" });
		expect(response.bodyUsed).toBe(false);
		expect(response.ok).toBe(true);
		await response.body?.cancel();
	});
	for (const json of [
		{ hello: "world" },
		[1, true, null, "x"],
		null,
		3,
		false,
		"text",
	])
		test(`explicit JSON body: ${JSON.stringify(json)}`, async () => {
			const result = await request<{ body: string; type: string }>(
				`${url}echo`,
				{ method: "POST", json },
			);
			expect(JSON.parse(result.body)).toEqual(json);
			expect(result.type).toBe("application/json");
		});
	for (const body of [
		new Blob(["raw"]),
		Buffer.from("raw"),
		"raw",
		new URLSearchParams({ value: "raw" }),
	])
		test(`native body passes through: ${body.constructor.name}`, async () => {
			const result = await request<{ body: string }>(`${url}echo`, {
				method: "POST",
				body,
			});
			expect(result.body).toBe(
				body instanceof URLSearchParams ? "value=raw" : "raw",
			);
		});
	test("caller Content-Type is preserved", async () =>
		expect(
			(
				await request<{ type: string }>(`${url}echo`, {
					method: "POST",
					json: {},
					headers: { "content-type": "application/vnd.test+json" },
				})
			).type,
		).toBe("application/vnd.test+json"));
	test("empty success is undefined", async () =>
		expect(await request(`${url}empty`)).toBeUndefined());
	test("HTTP errors keep status, URL, response and a saved JSON body", async () => {
		for (const target of [`${url}missing`, new URL(`${url}missing`)]) {
			try {
				await request(target);
				throw new Error("Expected HTTP failure");
			} catch (error) {
				expect(error).toBeInstanceOf(HttpError);
				const http = error as HttpError;
				expect(http.status).toBe(404);
				expect(http.url).toBe(String(target));
				expect(http.body).toBe('{"success":false}');
				expect(http.response.bodyUsed).toBe(true);
				expect(http.json()).toEqual({ success: false });
				expect(http.json()).toEqual({ success: false });
			}
		}
	});
	test("invalid formats fail before fetch", async () => {
		await expect(request(url, { response: "bad" } as never)).rejects.toThrow(
			"Unknown response format",
		);
	});
	test("ambiguous and unserializable JSON bodies fail", async () => {
		await expect(
			request(url, { method: "POST", json: {}, body: "raw" }),
		).rejects.toThrow("either json or body");
		await expect(
			request(url, { method: "POST", json: undefined }),
		).rejects.toThrow("not serializable");
	});
	test("aborted requests reject", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(request(url, { signal: controller.signal })).rejects.toThrow();
	});
});
