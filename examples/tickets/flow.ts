import type { VirelloClient } from "virello/client";
import {
	DiscordAPI,
	type InteractionContext,
	type ModalSubmitInteraction,
} from "virello/discord";
import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	ContainerBuilder,
	EmbedBuilder,
	FileUploadBuilder,
	LabelBuilder,
	MessageBuilder,
	MessageFlags,
	ModalBuilder,
	PermissionFlagsBits,
	TextInputBuilder,
	TextInputStyle,
} from "virello/builders";

/** Application configuration shared by the command and interaction listener. */
export interface TicketConfig {
	guildId: string;
	categoryId: string;
	panelChannelId: string;
	supportRoleId: string;
	transcriptChannelId: string;
}

const openId = "tickets:open";
const transcriptId = "tickets:transcript";
const topicPrefix = "virello-example-ticket:";
const pending = new Set<string>();
const access =
	PermissionFlagsBits.ViewChannel |
	PermissionFlagsBits.SendMessages |
	PermissionFlagsBits.ReadMessageHistory |
	PermissionFlagsBits.AttachFiles;

/** Build a persistent Components V2 panel; there are no process-local collectors. */
export function ticketPanel(): MessageBuilder {
	return new MessageBuilder()
		.setFlags(MessageFlags.IsComponentsV2)
		.setAllowedMentions({ parse: [] })
		.setComponents(
			new ContainerBuilder()
				.setAccentColor(0x5865f2)
				.addTextDisplayComponents((text) =>
					text.setContent(
						"## Contact support\nOpen a private ticket and include screenshots or other evidence.",
					),
				)
				.addActionRowComponents(
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder()
							.setStyle(ButtonStyle.Primary)
							.setCustomId(openId)
							.setLabel("Open a ticket"),
					),
				),
		);
}

/** Show this modal immediately in response to the button, without deferring first. */
export function ticketModal(userId: string, nonce: string): ModalBuilder {
	return new ModalBuilder()
		.setCustomId(`tickets:create:${userId}:${nonce}`)
		.setTitle("Contact support")
		.addLabelComponents(
			new LabelBuilder()
				.setLabel("Subject")
				.setTextInputComponent(
					new TextInputBuilder()
						.setCustomId("subject")
						.setStyle(TextInputStyle.Short)
						.setMaxLength(80)
						.setRequired(),
				),
			new LabelBuilder()
				.setLabel("What happened?")
				.setTextInputComponent(
					new TextInputBuilder()
						.setCustomId("details")
						.setStyle(TextInputStyle.Paragraph)
						.setMaxLength(1000)
						.setRequired(),
				),
			new LabelBuilder()
				.setLabel("Evidence")
				.setDescription("Optional: up to 3 files, 2 MiB each.")
				.setFileUploadComponent(
					new FileUploadBuilder()
						.setCustomId("evidence")
						.setMinValues(0)
						.setMaxValues(3)
						.setRequired(false),
				),
		);
}

/** Post a panel from an authorised application command, never automatically at startup. */
export async function publishTicketPanel(
	client: VirelloClient,
	config: TicketConfig,
): Promise<void> {
	await client.rest.request({
		method: "POST",
		path: DiscordAPI.Routes.channelMessages(config.panelChannelId),
		...ticketPanel().toFileBody(),
	});
}

async function copyEvidence(
	interaction: ModalSubmitInteraction,
): Promise<AttachmentBuilder[]> {
	const uploads = interaction.fields.getAttachments("evidence");
	if (uploads.length > 3) throw new Error("Please attach at most three files.");
	const files: AttachmentBuilder[] = [];
	for (const [index, upload] of uploads.entries()) {
		if (!upload || upload.size > 2 * 1024 * 1024)
			throw new Error("Each evidence file must be at most 2 MiB.");
		const url = new URL(upload.url);
		if (
			url.protocol !== "https:" ||
			url.hostname !== "cdn.discordapp.com" ||
			!url.pathname.startsWith("/attachments/")
		)
			throw new Error("The attachment has an unsupported download URL.");
		// Resolved URLs expire. Copy bytes now; no bot token is sent to the CDN.
		const response = await fetch(url, {
			redirect: "error",
			signal: AbortSignal.timeout(15000),
		});
		if (!response.ok)
			throw new Error(
				"An evidence download failed; please submit the ticket again.",
			);
		const blob = await response.blob();
		if (blob.size > 2 * 1024 * 1024)
			throw new Error("An evidence file exceeds 2 MiB.");
		const filename = `${index + 1}-${upload.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120)}`;
		files.push(new AttachmentBuilder().setFilename(filename).setFileData(blob));
	}
	return files;
}

async function submit(
	interaction: ModalSubmitInteraction,
	config: TicketConfig,
): Promise<void> {
	// A modal submission is a separate interaction and needs its own acknowledgement.
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	const key = `${config.guildId}:${interaction.user.id}`;
	if (pending.has(key)) {
		await interaction.editReply("Your ticket is already being created.");
		return;
	}
	pending.add(key);
	let channelId: string | undefined;
	try {
		const client = interaction.client;
		const channels =
			await client.rest.request<DiscordAPI.RESTGetAPIGuildChannelsResult>({
				method: "GET",
				path: DiscordAPI.Routes.guildChannels(config.guildId),
			});
		const topic = `${topicPrefix}${interaction.user.id}`;
		const existing = channels.find(
			(channel) =>
				channel.parent_id === config.categoryId &&
				"topic" in channel &&
				channel.topic === topic,
		);
		if (existing) {
			await interaction.editReply({
				content: `Your ticket is <#${existing.id}>.`,
				allowed_mentions: { parse: [] },
			});
			return;
		}
		const files = await copyEvidence(interaction);
		const botId = client.user?.id;
		if (!botId) throw new Error("The client is not ready.");
		const body = {
			name: `ticket-${interaction.user.id}`,
			type: ChannelType.GuildText,
			parent_id: config.categoryId,
			topic,
			permission_overwrites: [
				{
					id: config.guildId,
					type: DiscordAPI.OverwriteType.Role,
					deny: String(PermissionFlagsBits.ViewChannel),
				},
				{
					id: interaction.user.id,
					type: DiscordAPI.OverwriteType.Member,
					allow: String(access),
				},
				{
					id: config.supportRoleId,
					type: DiscordAPI.OverwriteType.Role,
					allow: String(access),
				},
				{
					id: botId,
					type: DiscordAPI.OverwriteType.Member,
					allow: String(access | PermissionFlagsBits.ManageChannels),
				},
			],
		} satisfies DiscordAPI.RESTPostAPIGuildChannelJSONBody;
		const channel =
			await client.rest.request<DiscordAPI.RESTPostAPIGuildChannelResult>({
				method: "POST",
				path: DiscordAPI.Routes.guildChannels(config.guildId),
				body,
			});
		channelId = channel.id;
		const message = new MessageBuilder()
			.setAllowedMentions({ parse: [] })
			.setEmbeds(
				new EmbedBuilder()
					.setTitle(interaction.fields.getTextInput("subject"))
					.setDescription(interaction.fields.getTextInput("details"))
					.addFields({
						name: "Opened by",
						value: `${interaction.user.username} (${interaction.user.id})`,
					})
					.setTimestamp(),
			)
			.setAttachments(...files)
			.setComponents(
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId(transcriptId)
						.setStyle(ButtonStyle.Secondary)
						.setLabel("Save transcript"),
				),
			);
		await client.rest.request({
			method: "POST",
			path: DiscordAPI.Routes.channelMessages(channel.id),
			...message.toFileBody(),
		});
		await interaction.editReply({
			content: `Your ticket is ready: <#${channel.id}>.`,
			allowed_mentions: { parse: [] },
		});
	} catch (error) {
		// Keep a created channel so support can recover it; do not delete user evidence on failure.
		await interaction.editReply(
			channelId
				? `Your channel <#${channelId}> was created, but the opening message could not be completed. Please contact support there.`
				: "The ticket could not be completed. Please try again; if a channel appeared, contact support there.",
		);
		throw error;
	} finally {
		pending.delete(key);
	}
}

async function saveTranscript(
	interaction: InteractionContext,
	config: TicketConfig,
): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	const channelId = interaction.channelId;
	if (!channelId) throw new Error("A ticket channel is required.");
	const channel = await interaction.client.rest.request<DiscordAPI.APIChannel>({
		method: "GET",
		path: DiscordAPI.Routes.channel(channelId),
	});
	const owner =
		"topic" in channel && channel.topic?.startsWith(topicPrefix)
			? channel.topic.slice(topicPrefix.length)
			: undefined;
	if (
		!owner ||
		!("parent_id" in channel) ||
		channel.parent_id !== config.categoryId ||
		!(
			owner === interaction.user.id ||
			interaction.member?.roles.includes(config.supportRoleId) ||
			interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
		)
	) {
		await interaction.editReply(
			"Only the ticket owner or support can export this ticket.",
		);
		return;
	}
	const messages: DiscordAPI.APIMessage[] = [];
	let before: string | undefined;
	while (messages.length < 1000) {
		const page =
			await interaction.client.rest.request<DiscordAPI.RESTGetAPIChannelMessagesResult>(
				{
					method: "GET",
					path: `${DiscordAPI.Routes.channelMessages(channelId)}?${new URLSearchParams({ limit: "100", ...(before ? { before } : {}) })}`,
				},
			);
		messages.push(...page);
		if (page.length < 100) break;
		before = page.at(-1)!.id;
	}
	// Plain text cannot execute user HTML. This is a bounded snapshot, not an archival service.
	const text = [
		`Ticket ${channelId}; owner ${owner}; exported ${new Date().toISOString()}`,
		`Most recent ${messages.length} messages (limit 1000). Attachment URLs may expire; file bytes are not archived.`,
		...messages.reverse().map((message) =>
			JSON.stringify({
				id: message.id,
				timestamp: message.timestamp,
				edited_timestamp: message.edited_timestamp,
				author: { id: message.author.id, username: message.author.username },
				content: message.content,
				embeds: message.embeds,
				components: message.components,
				attachments: message.attachments.map(({ id, filename, url, size }) => ({
					id,
					filename,
					url,
					size,
				})),
			}),
		),
	].join("\n");
	const transcript = new AttachmentBuilder()
		.setFilename(`ticket-${channelId}.txt`)
		.setDescription("Ticket transcript snapshot")
		.setFileData(new Blob([text], { type: "text/plain;charset=utf-8" }));
	if (transcript.getFile()!.data.size > 8 * 1024 * 1024)
		throw new Error("Transcript exceeds this example's 8 MiB export limit.");
	const message = new MessageBuilder()
		.setContent(`Transcript for ticket ${channelId}`)
		.setAllowedMentions({ parse: [] })
		.setAttachments(transcript);
	await interaction.client.rest.request({
		method: "POST",
		path: DiscordAPI.Routes.channelMessages(config.transcriptChannelId),
		...message.toFileBody(),
	});
	await interaction.editReply(
		"The transcript was saved to the support archive. The ticket remains open.",
	);
}

/** Route persistent button/modal ids from the application's InteractionCreate listener. */
export async function handleTicketInteraction(
	interaction: InteractionContext,
	config: TicketConfig,
): Promise<void> {
	if (interaction.guildId !== config.guildId) return;
	if (
		interaction.isButton() &&
		interaction.customId === openId &&
		interaction.channelId === config.panelChannelId
	) {
		await interaction.showModal(
			ticketModal(interaction.user.id, interaction.id),
		);
	} else if (
		interaction.isModalSubmit() &&
		/^tickets:create:\d+:\d+$/.test(interaction.customId)
	) {
		if (interaction.customId.split(":")[2] !== interaction.user.id) {
			await interaction.reply({
				content: "Open your own ticket from the panel.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		await submit(interaction, config);
	} else if (interaction.isButton() && interaction.customId === transcriptId) {
		try {
			await saveTranscript(interaction, config);
		} catch (error) {
			if (interaction.deferred)
				await interaction.editReply(
					"The transcript could not be saved. The ticket is unchanged; contact support.",
				);
			throw error;
		}
	}
}
