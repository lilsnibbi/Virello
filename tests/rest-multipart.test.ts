import { expect, spyOn, test } from "bun:test";
import {
	RestClient,
	type $RestFile,
	type $RestRequest,
} from "../packages/rest/src/index";
import { ControlStore } from "../packages/sharding/src/coordinator/ControlStore";
import { FleetRestScheduler } from "../packages/sharding/src/rest/FleetRestScheduler";
import { RemoteRestScheduler } from "../packages/sharding/src/rest/RemoteRestScheduler";
import type { ShardAssignment } from "../packages/sharding/src/authority";

async function filePart(form: FormData, key: string) {
	const part = form.get(key);
	expect(part).toBeInstanceOf(File);
	if (!part || typeof part === "string")
		throw new Error("Missing binary test part.");
	return { name: part.name, type: part.type, text: await part.text() };
}

test("message uploads retain indexed attribution, JSON metadata, filenames and MIME types", async () => {
	let parts!: FormData;
	const rest = new RestClient("test-token", {
		fetch: async (url, init) => {
			expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
			const wire = new Request(url, init);
			expect(wire.headers.get("Content-Type")).toStartWith(
				"multipart/form-data; boundary=",
			);
			parts = await wire.formData();
			return new Response(null, { status: 204 });
		},
	});
	const body = {
		content: "Evidence",
		attachments: [
			{ id: 0, filename: "first.png" },
			{ id: 42, filename: "second.gif" },
		],
	};
	try {
		await rest.request({
			method: "POST",
			path: "/channels/1/messages",
			body,
			files: [
				{
					name: "first.png",
					data: new Blob(["first bytes"], { type: "image/png" }),
				},
				{
					key: "files[42]",
					name: "second.gif",
					data: new Blob(["second bytes"], { type: "image/gif" }),
				},
			],
		});
		expect(JSON.parse(String(parts.get("payload_json")))).toEqual(body);
		expect(await filePart(parts, "files[0]")).toEqual({
			name: "first.png",
			type: "image/png",
			text: "first bytes",
		});
		expect(await filePart(parts, "files[42]")).toEqual({
			name: "second.gif",
			type: "image/gif",
			text: "second bytes",
		});
		expect(parts.has("files[1]")).toBe(false);
	} finally {
		rest.close();
	}
});

test("sticker form metadata and its file survive a rate-limit retry without payload_json", async () => {
	const captures: FormData[] = [];
	const rest = new RestClient("test-token", {
		fetch: async (url, init) => {
			expect(new Headers(init?.headers).get("X-Audit-Log-Reason")).toBe(
				encodeURIComponent("Add welcome sticker"),
			);
			captures.push(await new Request(url, init).formData());
			return captures.length === 1
				? Response.json({ retry_after: 0.001 }, { status: 429 })
				: new Response(null, { status: 204 });
		},
	});
	try {
		await rest.request({
			method: "POST",
			path: "/guilds/1/stickers",
			reason: "Add welcome sticker",
			form: { name: "Wave", description: "", tags: "wave" },
			files: [
				{
					key: "file",
					name: "wave.png",
					data: new Blob(["sticker bytes"], { type: "image/png" }),
				},
			],
		});
		expect(captures).toHaveLength(2);
		for (const parts of captures) {
			expect([...parts.keys()]).toEqual([
				"name",
				"description",
				"tags",
				"file",
			]);
			expect([
				parts.get("name"),
				parts.get("description"),
				parts.get("tags"),
			]).toEqual(["Wave", "", "wave"]);
			expect(await filePart(parts, "file")).toEqual({
				name: "wave.png",
				type: "image/png",
				text: "sticker bytes",
			});
		}
	} finally {
		rest.close();
	}
});

test("target-user CSV uploads support payload_json and file-only multipart forms", async () => {
	const captures: FormData[] = [];
	const rest = new RestClient("test-token", {
		fetch: async (url, init) => {
			captures.push(await new Request(url, init).formData());
			return new Response(null, { status: 204 });
		},
	});
	const file: $RestFile = {
		key: "target_users_file",
		name: "users.csv",
		data: new Blob(["user_id\n123456789012345678\n"], { type: "text/csv" }),
	};
	try {
		await rest.request({
			method: "POST",
			path: "/channels/1/invites",
			body: { unique: true, max_age: 3600 },
			files: [file],
		});
		await rest.request({
			method: "PUT",
			path: "/invites/test/target-users",
			form: {},
			files: [file],
		});
		expect(JSON.parse(String(captures[0].get("payload_json")))).toEqual({
			unique: true,
			max_age: 3600,
		});
		expect([...captures[1].keys()]).toEqual(["target_users_file"]);
		for (const parts of captures)
			expect(await filePart(parts, "target_users_file")).toEqual({
				name: "users.csv",
				type: "text/csv",
				text: "user_id\n123456789012345678\n",
			});
	} finally {
		rest.close();
	}
});

test("ambiguous, reserved or malformed multipart fields never reach local or fleet scheduling", async () => {
	const file = { name: "file.txt", data: new Blob(["bytes"]) };
	const malformed: unknown[] = [
		{
			files: [
				{ ...file, key: "file" },
				{ ...file, key: "file" },
			],
		},
		{ files: [{ ...file, key: "files[1]" }, file] },
		{ form: { file: "text" }, files: [{ ...file, key: "file" }] },
		{ form: {}, body: {} },
		{ form: { name: 42 } },
		{ form: new Date() },
		{ form: null },
		{ form: { "files[0]": "text" } },
		{ form: { payload_json: "{}" } },
		{ form: JSON.parse('{"__proto__":"text"}') },
		{ files: [{ ...file, key: "payload_json" }] },
		{ files: [{ ...file, key: "constructor" }] },
		{ files: [{ ...file, key: "file\r\nx-header" }] },
		{ files: [{ ...file, key: 'file"; name="other' }] },
		{ files: [{ ...file, key: "x".repeat(65) }] },
		{ files: [{ ...file, key: null }] },
		{ files: [{ ...file, name: "" }] },
		{ files: [{ ...file, name: "file\n.txt" }] },
		{ files: [{ ...file, data: "bytes" }] },
	];
	let dispatched = 0;
	for (const managed of [false, true]) {
		const rest = new RestClient(
			"test-token",
			managed
				? {
						scheduler: {
							request: async () => {
								dispatched++;
							},
						},
					}
				: {
						fetch: async () => {
							dispatched++;
							return new Response(null, { status: 204 });
						},
					},
		);
		try {
			for (const invalid of malformed)
				await expect(
					rest.request({
						method: "POST",
						path: "/guilds/1/stickers",
						...(invalid as Partial<$RestRequest>),
					}),
				).rejects.toBeInstanceOf(TypeError);
			expect(rest.pendingRequests).toBe(0);
		} finally {
			rest.close();
		}
	}
	expect(dispatched).toBe(0);
});

test("managed multipart keeps snapshots, bytes, types and operation identity across both layouts", async () => {
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
	const captures: FormData[] = [];
	const fleet = new FleetRestScheduler(store, "test-token", {
		fetch: async (url, init) => {
			captures.push(await new Request(url, init).formData());
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
	const file: $RestFile = {
		key: "file",
		name: "wave.png",
		data: new Blob(["original bytes"], { type: "image/png" }),
	};
	const original: $RestRequest = {
		operationId: "sticker:1",
		method: "POST",
		path: "/guilds/1/stickers",
		form: { name: "Wave", description: "", tags: "wave" },
		files: [file],
	};
	try {
		const mutable = {
			...original,
			form: { ...original.form },
			files: [{ ...file }],
		};
		const submitted = rest.request(mutable);
		mutable.form.name = "Wrong sticker";
		mutable.files[0].key = "target_users_file";
		mutable.files[0].name = "wrong.csv";
		mutable.files[0].data = new Blob(["wrong bytes"], { type: "text/csv" });
		await submitted;
		expect([
			captures[0].get("name"),
			captures[0].get("description"),
			captures[0].get("tags"),
		]).toEqual(["Wave", "", "wave"]);
		expect(captures[0].has("payload_json")).toBe(false);
		expect(await filePart(captures[0], "file")).toEqual({
			name: "wave.png",
			type: "image/png",
			text: "original bytes",
		});
		await rest.request(original);
		for (const change of [
			{ form: { ...original.form, name: "Other sticker" } },
			{ files: [{ ...file, key: "target_users_file" }] },
			{ files: [{ ...file, name: "other.png" }] },
			{
				files: [
					{ ...file, data: new Blob(["other bytes"], { type: "image/png" }) },
				],
			},
			{
				files: [
					{
						...file,
						data: new Blob(["original bytes"], { type: "image/gif" }),
					},
				],
			},
			{ form: undefined, body: original.form },
		])
			await expect(rest.request({ ...original, ...change })).rejects.toThrow(
				"different payload",
			);
		expect(captures).toHaveLength(1);
		const body = { unique: true, role_ids: ["123"] };
		const jsonRequest = rest.request({
			method: "POST",
			path: "/channels/1/invites",
			body,
			files: [{ ...file, key: "target_users_file" }],
		});
		body.role_ids[0] = "999";
		await jsonRequest;
		expect(JSON.parse(String(captures[1].get("payload_json")))).toEqual({
			unique: true,
			role_ids: ["123"],
		});
		expect(await filePart(captures[1], "target_users_file")).toEqual({
			name: "wave.png",
			type: "image/png",
			text: "original bytes",
		});
		await rest.request({
			method: "PUT",
			path: "/invites/test/target-users",
			form: {},
			files: [{ ...file, key: "target_users_file" }],
		});
		expect([...captures[2].keys()]).toEqual(["target_users_file"]);
		const rejected = await fleet.handle(
			new Request("https://fleet.invalid/rest", {
				method: "POST",
				headers: {
					authorization: `Bearer ${capability}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					assignment,
					operationId: "malformed:1",
					deadlineMs: 15000,
					method: "POST",
					path: "/guilds/1/stickers",
					auth: true,
					form: {},
					files: [
						{ name: "one.png", key: "file", data: "YQ==" },
						{ name: "two.png", key: "file", data: "Yg==" },
					],
				}),
			}),
		);
		expect(await rejected.json()).toMatchObject({
			ok: false,
			code: "HTTP_FAILED",
		});
		expect(captures).toHaveLength(3);
	} finally {
		transport.mockRestore();
		rest.close();
		await fleet.close();
		await store.close();
	}
});
