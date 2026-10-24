import { describe, expect, test } from "bun:test";
import {
	ApplicationCommandOptionType,
	ApplicationCommandType,
	ChatInputCommandBuilder,
	ContextMenuCommandBuilder,
	PermissionFlagsBits,
	SlashCommandBuilder,
	type SlashCommandOptionsOnlyBuilder,
	type SlashCommandSubcommandsOnlyBuilder,
} from "virello/builders";
import {
	normalizeChatInputCommand,
	normalizeContextMenuCommand,
} from "../../packages/core/src/commands/registration/normalizeInputs";

describe("first-party command compatibility", () => {
	test.each([
		ApplicationCommandType.User,
		ApplicationCommandType.Message,
	] as const)(
		"constructs context menu type %s through registration callbacks",
		(type) => {
			const command = normalizeContextMenuCommand((builder) =>
				builder
					.setName("Open ticket")
					.setType(type)
					.setDefaultMemberPermissions(null),
			);
			expect(command).toMatchObject({
				name: "Open ticket",
				type,
				dm_permission: true,
				default_member_permissions: null,
			});
			expect(new ContextMenuCommandBuilder(command).toJSON()).toEqual(command);
		},
	);

	test("requires an explicit context menu type", () => {
		expect(() =>
			normalizeContextMenuCommand((builder) => builder.setName("Incomplete")),
		).toThrow();
	});

	test("retains slash aliases and option-only registration types", () => {
		expect(SlashCommandBuilder).toBe(ChatInputCommandBuilder);
		const builder: SlashCommandOptionsOnlyBuilder = new SlashCommandBuilder()
			.setName("ticket")
			.setDescription("Open a ticket")
			.setDMPermission(false)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
			.addAttachmentOption((option) =>
				option.setName("evidence").setDescription("Optional evidence"),
			);
		expect(normalizeChatInputCommand(builder)).toMatchObject({
			type: ApplicationCommandType.ChatInput,
			dm_permission: false,
			default_member_permissions: String(PermissionFlagsBits.ManageChannels),
			options: [
				{ type: ApplicationCommandOptionType.Attachment, name: "evidence" },
			],
		});
	});

	test("supports singular nested subcommand callbacks and native registration data", () => {
		const builder: SlashCommandSubcommandsOnlyBuilder =
			new SlashCommandBuilder()
				.setName("ticket")
				.setDescription("Ticket actions")
				.addSubcommandGroup((group) =>
					group
						.setName("staff")
						.setDescription("Staff actions")
						.addSubcommand((command) =>
							command.setName("close").setDescription("Close a ticket"),
						),
				);
		const data = normalizeChatInputCommand(builder);
		expect(data.options?.[0]).toMatchObject({
			type: ApplicationCommandOptionType.SubcommandGroup,
			options: [
				{ type: ApplicationCommandOptionType.Subcommand, name: "close" },
			],
		});
		const native = normalizeChatInputCommand(data);
		expect(native).toEqual(data);
		expect(native.options).not.toBe(data.options);
	});

	test("rejects required options after optional ones and duplicate nested names", () => {
		const command = new SlashCommandBuilder()
			.setName("ticket")
			.setDescription("Ticket")
			.addStringOption((option) =>
				option.setName("optional").setDescription("Optional"),
			)
			.addStringOption((option) =>
				option.setName("required").setDescription("Required").setRequired(),
			);
		expect(() => command.toJSON()).toThrow(
			"Required command options must precede",
		);
		const duplicate = new SlashCommandBuilder()
			.setName("ticket")
			.setDescription("Ticket")
			.addSubcommand((sub) =>
				sub
					.setName("open")
					.setDescription("Open")
					.addStringOption((option) =>
						option.setName("subject").setDescription("Subject"),
					)
					.addStringOption((option) =>
						option.setName("subject").setDescription("Duplicate"),
					),
			);
		expect(() => duplicate.toJSON()).toThrow("Duplicate command option");
	});

	test("rejects mixed subcommands and options and fractional integer choices", () => {
		const mixed = new SlashCommandBuilder()
			.setName("ticket")
			.setDescription("Ticket")
			.addSubcommand((sub) => sub.setName("open").setDescription("Open"))
			.addStringOption((option) =>
				option.setName("subject").setDescription("Subject"),
			);
		expect(() => mixed.toJSON()).toThrow();
		const fractional = new SlashCommandBuilder()
			.setName("ticket")
			.setDescription("Ticket")
			.addIntegerOption((option) =>
				option
					.setName("priority")
					.setDescription("Priority")
					.addChoices({ name: "fraction", value: 1.5 }),
			);
		expect(() => fractional.toJSON()).toThrow("safe integers");
	});
});
