import { PermissionsBitField, type Client } from "discord.js";
export { PermissionsBitField as Permissions } from "discord.js";
export type {
	PermissionResolvable as PermissionInput,
	PermissionsString as PermissionName,
} from "discord.js";
/** Permissions used by framework preconditions for direct-message commands. */
export const directMessagePermissions: Readonly<PermissionsBitField> =
	new PermissionsBitField([
		"ViewChannel",
		"SendMessages",
		"ReadMessageHistory",
		"AddReactions",
		"EmbedLinks",
		"AttachFiles",
		"UseExternalEmojis",
		"UseExternalStickers",
		"MentionEveryone",
	]).freeze();
/** Fetch missing members through discord.js, then use its channel overwrite calculation. */
export async function permissionsFor(
	client: Client,
	guildId: string | null,
	channelId: string,
	userId: string,
): Promise<Readonly<PermissionsBitField>> {
	if (!guildId) return directMessagePermissions;
	const channel = await client.channels.fetch(channelId);
	if (!channel || !("guild" in channel) || channel.guild.id !== guildId)
		throw new Error("Guild channel is unavailable.");
	const member = await channel.guild.members.fetch(userId);
	return channel.permissionsFor(member) ?? new PermissionsBitField();
}
