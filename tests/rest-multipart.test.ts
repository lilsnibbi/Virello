import { expect, test } from "bun:test";
import { REST, DiscordAPIError } from "virello";

function captureRest(captures: FormData[], retry = false) {
	return new REST({
		hashSweepInterval: 0,
		handlerSweepInterval: 0,
		makeRequest: async (url, init) => {
			const wire = new Request(url, init as RequestInit);
			expect(wire.headers.get("Content-Type")).toStartWith(
				"multipart/form-data; boundary=",
			);
			captures.push(await wire.formData());
			return retry && captures.length === 1
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
}
async function filePart(form: FormData, key: string) {
	const part = form.get(key);
	expect(part).toBeInstanceOf(File);
	if (!part || typeof part === "string")
		throw new Error("Missing binary test part.");
	return { name: part.name, type: part.type, text: await part.text() };
}

test("message uploads retain indexed attribution, JSON metadata, filenames and MIME types", async () => {
	const captures: FormData[] = [];
	const body = {
		content: "Evidence",
		attachments: [
			{ id: 0, filename: "first.png" },
			{ id: 42, filename: "second.gif" },
		],
	};
	await captureRest(captures).post("/channels/1/messages", {
		body,
		files: [
			{
				name: "first.png",
				data: Buffer.from("first bytes"),
				contentType: "image/png",
			},
			{
				key: "files[42]",
				name: "second.gif",
				data: Buffer.from("second bytes"),
				contentType: "image/gif",
			},
		],
	});
	expect(JSON.parse(String(captures[0].get("payload_json")))).toEqual(body);
	expect(await filePart(captures[0], "files[0]")).toEqual({
		name: "first.png",
		type: "image/png",
		text: "first bytes",
	});
	expect(await filePart(captures[0], "files[42]")).toEqual({
		name: "second.gif",
		type: "image/gif",
		text: "second bytes",
	});
	expect(captures[0].has("files[1]")).toBe(false);
});

test("sticker form metadata and file survive a rate-limit retry without payload_json", async () => {
	const captures: FormData[] = [];
	await captureRest(captures, true).post("/guilds/1/stickers", {
		reason: "Add welcome sticker",
		appendToFormData: true,
		body: { name: "Wave", description: "", tags: "wave" },
		files: [
			{
				key: "file",
				name: "wave.png",
				data: Buffer.from("sticker bytes"),
				contentType: "image/png",
			},
		],
	});
	expect(captures).toHaveLength(2);
	for (const parts of captures) {
		expect([...parts.keys()].sort()).toEqual([
			"description",
			"file",
			"name",
			"tags",
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
});

test("target-user CSV uploads support JSON and file-only multipart forms", async () => {
	const captures: FormData[] = [];
	const rest = captureRest(captures);
	const file = {
		key: "target_users_file",
		name: "users.csv",
		data: Buffer.from("user_id\n123456789012345678\n"),
		contentType: "text/csv",
	};
	await rest.post("/channels/1/invites", {
		body: { unique: true, max_age: 3600 },
		files: [file],
	});
	await rest.put("/invites/test/target-users", { files: [file] });
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
});

test("Discord's invalid multipart response propagates without a successful upload or retry", async () => {
	let dispatched = 0;
	const rest = new REST({
		hashSweepInterval: 0,
		handlerSweepInterval: 0,
		makeRequest: async () => {
			dispatched++;
			return Response.json(
				{
					message: "Invalid Form Body",
					code: 50035,
					errors: {
						tags: {
							_errors: [
								{
									code: "BASE_TYPE_REQUIRED",
									message: "This field is required",
								},
							],
						},
					},
				},
				{ status: 400 },
			);
		},
	}).setToken("test-token");
	await expect(
		rest.post("/guilds/1/stickers", {
			appendToFormData: true,
			body: { name: "Wave" },
			files: [{ key: "file", name: "wave.png", data: Buffer.from("bytes") }],
		}),
	).rejects.toBeInstanceOf(DiscordAPIError);
	expect(dispatched).toBe(1);
});

test("separate REST clients preserve both multipart layouts and file attribution", async () => {
	const captures: FormData[] = [];
	const sticker = captureRest(captures);
	const invite = captureRest(captures);
	await Promise.all([
		sticker.post("/guilds/1/stickers", {
			appendToFormData: true,
			body: { name: "Wave", tags: "wave" },
			files: [{ key: "file", name: "wave.png", data: Buffer.from("sticker") }],
		}),
		invite.post("/channels/1/invites", {
			body: { unique: true },
			files: [
				{
					key: "target_users_file",
					name: "users.csv",
					data: Buffer.from("user_id\n1\n"),
				},
			],
		}),
	]);
	const form = captures.find((parts) => parts.has("file"))!;
	const json = captures.find((parts) => parts.has("target_users_file"))!;
	expect(form.has("payload_json")).toBe(false);
	expect(form.get("name")).toBe("Wave");
	expect((await filePart(form, "file")).text).toBe("sticker");
	expect(JSON.parse(String(json.get("payload_json")))).toEqual({
		unique: true,
	});
	expect((await filePart(json, "target_users_file")).text).toBe("user_id\n1\n");
});
