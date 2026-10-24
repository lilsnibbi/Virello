import {
	GatewayIntentBits as Intent,
	GatewayOpcodes as Op,
} from "discord-api-types/v10";
import { record } from "@virello/util/runtime";
import type { $GatewayCommand } from "./types";

function requireValue(value: unknown, message: string): asserts value {
	if (!value) throw new TypeError(message);
}
function snowflake(value: unknown): value is string {
	return (
		typeof value === "string" &&
		/^[1-9]\d{0,19}$/.test(value) &&
		BigInt(value) <= 0xffffffffffffffffn
	);
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
	requireValue(
		Object.keys(value).every((key) => allowed.includes(key)),
		"Unsupported Gateway command field.",
	);
}

/** Snapshot and validate the exact JSON that will be written, including shard ownership. */
export function commandSnapshot(
	payload: $GatewayCommand,
	shard: readonly [number, number],
	intents: number,
): $GatewayCommand {
	const text = JSON.stringify(payload);
	requireValue(
		typeof text === "string" &&
			new TextEncoder().encode(text).byteLength <= 4096,
		"Outbound Gateway payload exceeds 4096 bytes or is not JSON.",
	);
	const value: unknown = JSON.parse(text);
	requireValue(
		record(value) && record(value.d),
		"Invalid Gateway command envelope.",
	);
	keys(value, ["op", "d"]);
	const data = value.d;
	let guilds: unknown[] = [];
	const hasIntent = (flag: number) => (BigInt(intents) & BigInt(flag)) !== 0n;
	switch (value.op) {
		case Op.RequestGuildMembers: {
			keys(data, [
				"guild_id",
				"query",
				"limit",
				"user_ids",
				"presences",
				"nonce",
			]);
			guilds = [data.guild_id];
			requireValue(
				(data.query === undefined) !== (data.user_ids === undefined),
				"Specify exactly one of query or user_ids.",
			);
			if (data.query !== undefined) {
				requireValue(
					typeof data.query === "string" &&
						Number.isSafeInteger(data.limit) &&
						Number(data.limit) >= 0 &&
						(data.query === "" ||
							(Number(data.limit) > 0 && Number(data.limit) <= 100)),
					"Invalid member query or limit.",
				);
				if (data.query === "")
					requireValue(
						hasIntent(Intent.GuildMembers),
						"Empty member queries require the GuildMembers intent.",
					);
			} else {
				const users = Array.isArray(data.user_ids)
					? data.user_ids
					: [data.user_ids];
				requireValue(
					users.length >= 1 &&
						users.length <= 100 &&
						users.every(snowflake) &&
						data.limit === undefined,
					"Member requests require 1–100 user IDs without a query limit.",
				);
			}
			requireValue(
				data.presences === undefined || typeof data.presences === "boolean",
				"presences must be a boolean.",
			);
			if (data.presences)
				requireValue(
					hasIntent(Intent.GuildPresences),
					"Member presences require the GuildPresences intent.",
				);
			requireValue(
				data.nonce === undefined ||
					(typeof data.nonce === "string" &&
						new TextEncoder().encode(data.nonce).byteLength <= 32),
				"Member request nonce must be at most 32 UTF-8 bytes.",
			);
			break;
		}
		case Op.RequestSoundboardSounds:
			keys(data, ["guild_ids"]);
			requireValue(
				Array.isArray(data.guild_ids) && data.guild_ids.length > 0,
				"Soundboard requests require guild IDs.",
			);
			guilds = data.guild_ids;
			break;
		case Op.RequestChannelInfo:
			keys(data, ["guild_id", "fields"]);
			guilds = [data.guild_id];
			requireValue(
				Array.isArray(data.fields) &&
					data.fields.length > 0 &&
					data.fields.every(
						(field) => field === "status" || field === "voice_start_time",
					),
				"Channel info fields must be status or voice_start_time.",
			);
			break;
		case Op.VoiceStateUpdate:
			keys(data, ["guild_id", "channel_id", "self_mute", "self_deaf"]);
			guilds = [data.guild_id];
			requireValue(
				(data.channel_id === null || snowflake(data.channel_id)) &&
					typeof data.self_mute === "boolean" &&
					typeof data.self_deaf === "boolean",
				"Invalid voice state update.",
			);
			break;
		case Op.PresenceUpdate:
			keys(data, ["since", "activities", "status", "afk"]);
			requireValue(
				(data.since === null ||
					(Number.isSafeInteger(data.since) && Number(data.since) >= 0)) &&
					typeof data.afk === "boolean" &&
					typeof data.status === "string" &&
					["online", "dnd", "idle", "invisible", "offline"].includes(
						String(data.status),
					) &&
					Array.isArray(data.activities),
				"Invalid presence update.",
			);
			for (const activity of data.activities) {
				requireValue(record(activity), "Invalid presence activity.");
				keys(activity, ["name", "type", "state", "url"]);
				requireValue(
					typeof activity.name === "string" &&
						Number.isInteger(activity.type) &&
						Number(activity.type) >= 0 &&
						Number(activity.type) <= 5 &&
						(activity.state === undefined ||
							typeof activity.state === "string") &&
						(activity.url === undefined ||
							activity.url === null ||
							typeof activity.url === "string"),
					"Invalid presence activity fields.",
				);
			}
			break;
		default:
			throw new TypeError("Unsupported application Gateway opcode.");
	}
	for (const guild of guilds) {
		requireValue(
			snowflake(guild),
			"Gateway commands require valid guild snowflakes.",
		);
		if (Number((BigInt(guild) >> 22n) % BigInt(shard[1])) !== shard[0])
			throw new RangeError(
				"Guild belongs to another shard; route the command to its owning worker.",
			);
	}
	return value as unknown as $GatewayCommand;
}
