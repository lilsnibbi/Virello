import { describe, expect, test } from "bun:test";
import {
	ActionRowBuilder,
	AttachmentBuilder,
	BuilderValidationError,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	ContainerBuilder,
	EmbedBuilder,
	MessageBuilder,
	MessageFlags,
	TextDisplayBuilder,
} from "virello/builders";
import { RestClient } from "../../src/engine/rest/RestClient";
import { ticketPanel } from "../../examples/tickets/flow";

describe("message builder validation", () => {
	test.each(["toJSON", "toFileBody", "toMessage"] as const)(
		"%s rejects invalid children inside builders and native containers",
		(serialize) => {
			const child = new ButtonBuilder()
				.setStyle(ButtonStyle.Primary)
				.setLabel("Open")
				.setCustomId("");
			const builder = new MessageBuilder()
				.setFlags(MessageFlags.IsComponentsV2)
				.setComponents(
					new ContainerBuilder().addActionRowComponents(
						new ActionRowBuilder<ButtonBuilder>().addComponents(child),
					),
				);
			const native = new MessageBuilder({
				flags: MessageFlags.IsComponentsV2,
				components: [
					{
						type: ComponentType.Container,
						components: [
							{
								type: ComponentType.ActionRow,
								components: [
									{
										type: ComponentType.Button,
										style: ButtonStyle.Primary,
										label: "Open",
										custom_id: "",
									},
								],
							},
						],
					},
				],
			});
			expect(() => builder[serialize]()).toThrow(BuilderValidationError);
			expect(() => native[serialize]()).toThrow(BuilderValidationError);
			child.setCustomId("open");
			expect(() => builder[serialize]()).not.toThrow();
		},
	);

	test("requires explicit V2 flags and preserves interaction flags", () => {
		const message = new MessageBuilder().setComponents(
			new TextDisplayBuilder().setContent("Support"),
		);
		expect(() => message.toJSON()).toThrow(BuilderValidationError);
		message.setFlags(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
		expect(message.toJSON().flags).toBe(
			MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		);
		expect(() => message.setContent("legacy").toJSON()).toThrow(
			BuilderValidationError,
		);
		message.clearContent();
		expect(() => message.toJSON()).not.toThrow();
		expect(ticketPanel().toFileBody().body.components?.[0].type).toBe(
			ComponentType.Container,
		);
	});

	test("counts nested components and rejects duplicate custom ids", () => {
		const children = Array.from({ length: 39 }, () =>
			new TextDisplayBuilder().setContent("Entry"),
		);
		const container = new ContainerBuilder().addTextDisplayComponents(
			...children,
		);
		const message = new MessageBuilder()
			.setFlags(MessageFlags.IsComponentsV2)
			.setComponents(container);
		expect(() => message.toJSON()).not.toThrow();
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent("Too many"),
		);
		expect(() => message.toJSON()).toThrow("40 total components");
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			...Array.from({ length: 2 }, () =>
				new ButtonBuilder()
					.setCustomId("same")
					.setStyle(ButtonStyle.Primary)
					.setLabel("Open"),
			),
		);
		expect(() => new MessageBuilder().setComponents(row).toJSON()).toThrow(
			"custom ids must be unique",
		);
	});

	test("checks the combined embed limit as well as individual embeds", () => {
		const first = new EmbedBuilder().setDescription("a".repeat(3000));
		const second = new EmbedBuilder().setDescription("b".repeat(3000));
		const message = new MessageBuilder().setEmbeds(first, second);
		expect(() => message.toJSON()).not.toThrow();
		second.setTitle("overflow");
		expect(() => second.toJSON()).not.toThrow();
		expect(() => message.toFileBody()).toThrow(BuilderValidationError);
	});

	test("keeps unfinished embed snapshots separate from validated payloads", () => {
		const template = new EmbedBuilder().setColor(0);
		const snapshot = template.toData();
		expect(snapshot.color).toBe(0);
		expect(() => template.toJSON()).toThrow(BuilderValidationError);
		expect(() => new MessageBuilder().setEmbeds(snapshot).toFileBody()).toThrow(
			BuilderValidationError,
		);
		snapshot.title = "First page";
		expect(template.toData().title).toBeUndefined();
		const message = new MessageBuilder().setEmbeds(new EmbedBuilder(snapshot));
		expect(message.toJSON().embeds?.[0]).toMatchObject({
			color: 0,
			title: "First page",
		});
		message.toJSON().embeds![0].title = "changed externally";
		expect(message.toJSON().embeds?.[0].title).toBe("First page");
	});
});

describe("native attachment uploads", () => {
	test("matches multipart positions with retained attachments and empty uploads", async () => {
		const first = new AttachmentBuilder()
			.setId(8)
			.setFilename("evidence.txt")
			.setFileData("evidence")
			.setFileContentType("text/plain");
		const empty = new AttachmentBuilder()
			.setFilename("empty.txt")
			.setFileData("");
		const message = new MessageBuilder().setAttachments(
			{ id: "123456789012345678", filename: "retained.txt" },
			first,
			empty,
		);
		const { body, files } = message.toFileBody();
		expect(body.attachments?.map(({ id }) => id)).toEqual([
			"123456789012345678",
			0,
			1,
		]);
		expect(files.map(({ name }) => name)).toEqual([
			"evidence.txt",
			"empty.txt",
		]);
		expect(files[0].data.type.split(";", 1)[0]).toBe("text/plain");
		expect(await files[0].data.text()).toBe("evidence");
		expect(files[1].data.size).toBe(0);
		expect(message.toJSON()).not.toHaveProperty("files");
		expect(message.toMessage().files).toHaveLength(2);
	});

	test("passes named Blobs to the unchanged REST multipart transport", async () => {
		let form: FormData | undefined;
		const rest = new RestClient("offline-test", {
			fetch: async (_input, init) => {
				expect(init?.body).toBeInstanceOf(FormData);
				form = init!.body as FormData;
				return Response.json({ id: "123" });
			},
		});
		try {
			const message = new MessageBuilder().setAttachments(
				{ id: "123456789012345678" },
				new AttachmentBuilder()
					.setFilename("transcript.txt")
					.setFileData("ticket transcript"),
			);
			await rest.request({
				method: "PATCH",
				path: "/channels/20/messages/30",
				...message.toFileBody(),
			});
			const payload = JSON.parse(form!.get("payload_json") as string);
			expect(payload.attachments).toEqual([
				{ id: "123456789012345678" },
				{ id: 0, filename: "transcript.txt" },
			]);
			const file = form!.get("files[0]") as File;
			expect(file.name).toBe("transcript.txt");
			expect(await file.text()).toBe("ticket transcript");
			expect(form!.has("files[1]")).toBe(false);
		} finally {
			rest.close();
		}
	});

	test("rejects unresolved or duplicate attachment ids and nameless uploads", () => {
		expect(() =>
			new MessageBuilder().setAttachments({ id: 0 }).toFileBody(),
		).toThrow("must refer to a new upload");
		expect(() =>
			new MessageBuilder()
				.setAttachments({ id: "123" }, { id: "123" })
				.toFileBody(),
		).toThrow("must be unique");
		expect(() =>
			new MessageBuilder()
				.setAttachments(new AttachmentBuilder().setFileData(""))
				.toFileBody(),
		).toThrow("require a filename");
	});

	test("copies byte arrays and treats strings as literal content", async () => {
		const bytes = new Uint8Array([65]);
		const upload = new AttachmentBuilder()
			.setFilename("bytes.txt")
			.setFileData(bytes);
		bytes[0] = 66;
		expect(await upload.getFile()!.data.text()).toBe("A");
		upload.setFileData("/not/a/file/path");
		expect(await upload.getFile()!.data.text()).toBe("/not/a/file/path");
	});
});
