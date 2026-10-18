import type {
	APIGuildMember,
	APIRole,
	APIUser,
	ApplicationFlags,
	GatewayGuildCreateDispatchData,
	GatewayMessageCreateDispatchData,
	GatewayReadyDispatchData,
	GuildMemberFlags,
	GuildSystemChannelFlags,
	RoleFlags,
} from "discord-api-types/v10";
import {
	ChannelType,
	GatewayDispatchEvents as E,
	GatewayOpcodes,
	Locale,
} from "discord-api-types/v10";
import type { $GatewayDispatch } from "../../src/engine/gateway/types";

export function user(id = "1"): APIUser {
	return {
		id,
		username: `user-${id}`,
		discriminator: "0",
		avatar: null,
		global_name: null,
	};
}
export function member(id = "1"): APIGuildMember {
	return {
		user: user(id),
		roles: ["10"],
		joined_at: "2026-01-01T00:00:00.000Z",
		deaf: false,
		mute: false,
		flags: 0 as GuildMemberFlags,
		nick: `Member ${id}`,
	};
}
export function role(id = "10"): APIRole {
	return {
		id,
		name: `Role ${id}`,
		color: 0,
		colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
		hoist: false,
		position: 0,
		permissions: "0",
		managed: false,
		mentionable: false,
		flags: 0 as RoleFlags,
	};
}
export function message(
	id = "100",
	authorId = "1",
): GatewayMessageCreateDispatchData {
	return {
		id,
		channel_id: "20",
		guild_id: "30",
		author: user(authorId),
		member: {
			roles: [],
			joined_at: "2026-01-01T00:00:00.000Z",
			deaf: false,
			mute: false,
			flags: 0 as GuildMemberFlags,
		},
		content: "!ping",
		timestamp: "2026-01-01T00:00:00.000Z",
		edited_timestamp: null,
		tts: false,
		mention_everyone: false,
		mentions: [],
		mention_roles: [],
		attachments: [],
		embeds: [],
		pinned: false,
		type: 0,
	};
}
export function guild(
	id = "30",
	ids = ["1", "2"],
): GatewayGuildCreateDispatchData {
	return {
		id,
		name: "Test guild",
		icon: null,
		splash: null,
		discovery_splash: null,
		owner_id: "1",
		afk_channel_id: null,
		afk_timeout: 60,
		verification_level: 0,
		default_message_notifications: 0,
		explicit_content_filter: 0,
		roles: [role()],
		emojis: [],
		features: [],
		mfa_level: 0,
		application_id: null,
		system_channel_id: null,
		system_channel_flags: 0 as GuildSystemChannelFlags,
		rules_channel_id: null,
		vanity_url_code: null,
		description: null,
		banner: null,
		premium_tier: 0,
		preferred_locale: Locale.EnglishUS,
		public_updates_channel_id: null,
		nsfw_level: 0,
		premium_progress_bar_enabled: false,
		hub_type: null,
		safety_alerts_channel_id: null,
		incidents_data: null,
		joined_at: "2026-01-01T00:00:00.000Z",
		large: false,
		member_count: ids.length,
		voice_states: [],
		members: ids.map(member),
		channels: [
			{
				id: "20",
				guild_id: id,
				type: ChannelType.GuildText,
				name: "general",
				position: 0,
				permission_overwrites: [],
			},
		],
		threads: [],
		presences: [],
		stage_instances: [],
		guild_scheduled_events: [],
		soundboard_sounds: [],
	};
}
export function ready(
	url = "wss://resume.example.test",
): GatewayReadyDispatchData {
	return {
		v: 10,
		user: { ...user("99"), verified: true, mfa_enabled: false, email: null },
		guilds: [],
		session_id: "test-session",
		resume_gateway_url: url,
		application: { id: "99", flags: 0 as ApplicationFlags, flags_new: "0" },
	};
}
export function dispatch<T extends $GatewayDispatch["t"]>(
	t: T,
	d: Extract<$GatewayDispatch, { t: T }>["d"],
	s = 1,
): $GatewayDispatch {
	return { op: GatewayOpcodes.Dispatch, t, d, s } as $GatewayDispatch;
}
export const memberEvent = (id: string, guildId = "30"): $GatewayDispatch =>
	dispatch(E.GuildMemberAdd, { ...member(id), guild_id: guildId });
