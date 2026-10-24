import {
	PermissionFlagsBits,
	Routes,
	type APIGuild,
	type APIRole,
} from "discord-api-types/v10";
import type { VirelloClient } from "../core/client/VirelloClient";

export type PermissionName = keyof typeof PermissionFlagsBits;
export type PermissionInput =
	bigint | number | string | Permissions | readonly PermissionInput[];

/** A Discord permission mask. Accepts native decimal strings, flags, names and lists. */
export class Permissions {
	static readonly All = Object.values(PermissionFlagsBits).reduce(
		(mask, bit) => mask | bit,
		0n,
	);
	static readonly Flags = PermissionFlagsBits;
	readonly bitfield: bigint;
	constructor(input: PermissionInput = 0n) {
		this.bitfield = Permissions.resolve(input);
	}
	static resolve(input: PermissionInput): bigint {
		if (input instanceof Permissions) return input.bitfield;
		if (Array.isArray(input))
			return input.reduce<bigint>(
				(mask, item) => mask | Permissions.resolve(item),
				0n,
			);
		if (typeof input === "string" && Object.hasOwn(PermissionFlagsBits, input))
			return PermissionFlagsBits[input as PermissionName];
		if (
			(typeof input === "string" && /^\d+$/.test(input)) ||
			typeof input === "bigint" ||
			(typeof input === "number" && Number.isSafeInteger(input))
		) {
			const value = BigInt(input);
			if (value >= 0n) return value;
		}
		throw new TypeError("Invalid Discord permission mask.");
	}
	has(input: PermissionInput, checkAdmin = true): boolean {
		const mask = Permissions.resolve(input);
		return (
			(checkAdmin &&
				(this.bitfield & PermissionFlagsBits.Administrator) !== 0n) ||
			(this.bitfield & mask) === mask
		);
	}
	missing(input: PermissionInput, checkAdmin = true): PermissionName[] {
		return new Permissions(input)
			.toArray()
			.filter((name) => !this.has(name, checkAdmin));
	}
	toArray(): PermissionName[] {
		return (Object.keys(PermissionFlagsBits) as PermissionName[]).filter(
			(name) => this.has(name, false),
		);
	}
	freeze(): this {
		return Object.freeze(this);
	}
	toJSON(): string {
		return this.bitfield.toString();
	}
}

/** Permission capabilities Discord makes available in direct messages. */
export const directMessagePermissions = new Permissions([
	"ViewChannel",
	"SendMessages",
	"ReadMessageHistory",
	"AddReactions",
	"EmbedLinks",
	"AttachFiles",
	"UseExternalEmojis",
	"UseExternalStickers",
	"MentionEveryone",
]);

/** Resolve member permissions using native guild roles and channel overwrites, fetching missing cache data. */
export async function permissionsFor(
	client: VirelloClient,
	guildId: string | null,
	channelId: string,
	userId: string,
): Promise<Permissions> {
	if (!guildId) return directMessagePermissions;
	let guild = client.cache.guilds.get(guildId)?.data;
	if (!guild?.owner_id)
		guild = await client.rest.request<APIGuild>({
			method: "GET",
			path: Routes.guild(guildId),
		});
	if (guild.owner_id === userId) return new Permissions(Permissions.All);
	const cached = client.cache.members.get(guildId, userId);
	const member = cached?.complete
		? cached.data
		: await client.engine.fetchMember(guildId, userId);
	let roles = [...client.cache.roles.values(guildId)]
		.filter((entry) => entry.complete)
		.map((entry) => entry.data);
	if (
		!roles.some((role) => role.id === guildId) ||
		member.roles.some((id) => !roles.some((role) => role.id === id))
	)
		roles = await client.rest.request<APIRole[]>({
			method: "GET",
			path: Routes.guildRoles(guildId),
		});
	let mask = roles
		.filter((role) => role.id === guildId || member.roles.includes(role.id))
		.reduce((bits, role) => bits | BigInt(role.permissions), 0n);
	if (mask & PermissionFlagsBits.Administrator)
		return new Permissions(Permissions.All);
	const cachedChannel = client.cache.channels.get(channelId);
	let channel = cachedChannel?.complete
		? cachedChannel.data
		: await client.engine.fetchChannel(channelId);
	if (
		[10, 11, 12].includes(channel.type) &&
		"parent_id" in channel &&
		channel.parent_id
	) {
		const cachedParent = client.cache.channels.get(channel.parent_id);
		channel = cachedParent?.complete
			? cachedParent.data
			: await client.engine.fetchChannel(channel.parent_id);
	}
	if ("permission_overwrites" in channel) {
		const overwrites = channel.permission_overwrites ?? [];
		const everyone = overwrites.find(
			(entry) => entry.id === guildId && entry.type === 0,
		);
		if (everyone)
			mask = (mask & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
		const matching = overwrites.filter(
			(entry) => entry.type === 0 && member.roles.includes(entry.id),
		);
		mask =
			(mask &
				~matching.reduce((bits, entry) => bits | BigInt(entry.deny), 0n)) |
			matching.reduce((bits, entry) => bits | BigInt(entry.allow), 0n);
		const personal = overwrites.find(
			(entry) => entry.type === 1 && entry.id === userId,
		);
		if (personal)
			mask = (mask & ~BigInt(personal.deny)) | BigInt(personal.allow);
	}
	if (
		member.communication_disabled_until &&
		Date.parse(member.communication_disabled_until) > Date.now()
	)
		mask &=
			PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory;
	return new Permissions(mask);
}
