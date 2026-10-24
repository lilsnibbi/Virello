import { describe, expect, test } from "bun:test";
import { ChannelType, GatewayDispatchEvents as E } from "discord-api-types/v10";
import type { APIVoiceState } from "discord-api-types/v10";
import { CacheStore } from "../../packages/cache/src/CacheStore";
import { EngineCache } from "../../packages/cache/src/EngineCache";
import { ScopedCache } from "../../packages/cache/src/ScopedCache";
import type { $GatewayDispatch } from "../../packages/ws/src/types";
import {
	dispatch,
	guild,
	member,
	memberEvent,
	message,
	user,
} from "./fixtures";

const voice: APIVoiceState = {
	guild_id: "30",
	channel_id: "20",
	user_id: "1",
	session_id: "offline-voice-state",
	deaf: false,
	mute: false,
	self_deaf: false,
	self_mute: false,
	self_video: false,
	suppress: false,
	request_to_speak_timestamp: null,
};

describe("native cache semantics", () => {
	test("omissions, nested partials, arrays and null merge in place without mutating input", () => {
		const store = new CacheStore<{
			id: string;
			user: { name: string; avatar: string | null };
			roles: string[];
			nick: string | null;
		}>();
		const original = {
			id: "1",
			user: { name: "A", avatar: "image" },
			roles: ["a", "b"],
			nick: "Nick",
		};
		const entry = store.put("1", original);
		const data = entry?.data;
		const nested = entry?.data.user;
		store.patch("1", { user: { avatar: null }, roles: [], nick: null });
		expect(store.peek("1")).toBe(entry);
		expect(store.peek("1")?.data).toBe(data);
		expect(store.peek("1")?.data.user).toBe(nested);
		expect(data).toEqual({
			id: "1",
			user: { name: "A", avatar: null },
			roles: [],
			nick: null,
		});
		expect(original.user.avatar).toBe("image");
		store.patch("1", { nick: undefined });
		expect(data?.nick).toBeNull();
	});
	test("uncached partials remain partial until a full put, including across identity promotion", () => {
		const store = new CacheStore<{ id: string; name: string }>();
		const partial = store.patch("1", { id: "1" });
		store.patch("1", { name: "complete-looking" });
		expect(partial?.complete).toBe(false);
		expect(store.put("1", { id: "1", name: "authoritative" })).toBe(partial);
		expect(partial?.complete).toBe(true);
	});
	test("LRU targeted get touches, iteration and peek do not; eviction ends identity", () => {
		const store = new CacheStore<{ id: string }>(2);
		const first = store.put("1", { id: "1" });
		store.put("2", { id: "2" });
		Array.from(store.values());
		Array.from(store);
		store.peek("1");
		store.has("1");
		store.put("3", { id: "3" });
		expect(store.peek("1")).toBeUndefined();
		expect(store.put("1", { id: "1" })).not.toBe(first);
		store.get("3");
		store.put("4", { id: "4" });
		expect(store.peek("1")).toBeUndefined();
		expect(store.peek("3")).toBeDefined();
	});
	test("per-guild default is exactly 1000 with no client-wide cap", () => {
		const cache = new EngineCache();
		for (const g of ["30", "31", "32"])
			for (let i = 0; i < 1001; i++)
				cache.putMember(g, String(i), member(String(i)));
		expect(
			[...cache.members.scopeIds()].map((g) => cache.members.size(g)),
		).toEqual([1000, 1000, 1000]);
		expect(cache.members.get("30", "0")).toBeUndefined();
		expect(cache.messages.size("20")).toBe(0);
	});
	test("zero, one, dynamic boundaries and empty-scope cleanup", () => {
		const store = new ScopedCache<{ id: string }>((scope) =>
			scope === "off" ? 0 : 1,
		);
		store.put("off", "1", { id: "1" });
		store.put("on", "1", { id: "1" });
		store.put("on", "2", { id: "2" });
		expect(store.size("off")).toBe(0);
		expect(store.size("on")).toBe(1);
		expect(store.get("on", "1")).toBeUndefined();
		store.delete("on", "2");
		expect(store.scopeCount).toBe(0);
		expect(() => new EngineCache({ membersPerGuild: -1 })).toThrow();
		expect(() => new EngineCache({ messagesPerChannel: 0.5 })).toThrow();
		const invalid = new EngineCache({
			membersPerGuild: () => Number.POSITIVE_INFINITY,
		});
		expect(() => invalid.putMember("30", "1", member("1"))).toThrow();
	});
	test("gateway messages and structural future events, targeted lookup and iteration recency", () => {
		const cache = new EngineCache({ membersPerGuild: 2 });
		cache.apply(memberEvent("1"));
		cache.apply(memberEvent("2"));
		cache.apply(dispatch(E.MessageCreate, message("100", "1")));
		cache.apply(memberEvent("3"));
		expect(cache.members.peek("30", "2")).toBeUndefined();
		expect(cache.members.peek("30", "1")).toBeDefined();
		cache.apply({
			op: 0,
			s: 20,
			t: "FUTURE_MEMBER_ACTIVITY",
			d: {
				guild_id: "30",
				nested: { member: { user: user("1"), nick: null } },
			},
		} as unknown as $GatewayDispatch);
		cache.apply(memberEvent("4"));
		expect(cache.members.peek("30", "3")).toBeUndefined();
		Array.from(cache.members.entries("30"));
		Array.from(cache.members.values("30"));
		cache.apply(memberEvent("5"));
		expect(cache.members.peek("30", "1")).toBeUndefined();
		cache.members.get("30", "4");
		cache.apply(memberEvent("6"));
		expect(cache.members.peek("30", "5")).toBeUndefined();
	});
	test("ID-only activity touches a resident member; resolved interaction data merges partial members", () => {
		const cache = new EngineCache({ membersPerGuild: 2 });
		cache.apply(memberEvent("1"));
		cache.apply(memberEvent("2"));
		cache.apply({
			op: 0,
			s: 3,
			t: "FUTURE",
			d: { guild_id: "30", user_id: "1" },
		} as unknown as $GatewayDispatch);
		cache.apply(memberEvent("3"));
		expect(cache.members.peek("30", "2")).toBeUndefined();
		cache.apply({
			op: 0,
			s: 4,
			t: "FUTURE",
			d: {
				guild_id: "30",
				resolved: {
					users: { "4": user("4") },
					members: { "4": { roles: [], nick: null } },
				},
			},
		} as unknown as $GatewayDispatch);
		expect(cache.members.peek("30", "4")).toMatchObject({
			complete: false,
			data: { user: user("4"), roles: [], nick: null },
		});
	});
	test("guild/channel/role defaults, guild snapshots never retain bulk members, and policy overrides", () => {
		const cache = new EngineCache({ membersPerGuild: 1 });
		const input = guild();
		input.voice_states = [voice];
		cache.apply(dispatch(E.GuildCreate, input));
		expect(cache.guilds.size).toBe(1);
		expect(cache.channels.size).toBe(1);
		expect(cache.roles.size("30")).toBe(1);
		expect(cache.voiceStates.peek("30", "1")).toMatchObject({
			complete: true,
			data: { channel_id: "20", user_id: "1" },
		});
		expect(cache.guilds.peek("30")?.data).not.toHaveProperty("voice_states");
		expect(cache.guilds.peek("30")?.complete).toBe(false);
		expect(cache.guilds.peek("30")?.data).not.toHaveProperty("members");
		expect(cache.guilds.peek("30")?.data).not.toHaveProperty("roles");
		expect(input.members).toHaveLength(2);
		expect(cache.members.size("30")).toBe(1);
		const filtered = new EngineCache({
			policy: (entry) => entry.kind !== "member",
			channels: false,
			roles: false,
			guilds: false,
			voiceStates: false,
		});
		filtered.apply(dispatch(E.GuildCreate, input));
		expect(
			filtered.guilds.size +
				filtered.channels.size +
				filtered.roles.size("30") +
				filtered.members.size("30") +
				filtered.voiceStates.size("30"),
		).toBe(0);
		cache.apply(dispatch(E.VoiceStateUpdate, { ...voice, channel_id: null }));
		expect(cache.voiceStates.size("30")).toBe(0);
		cache.apply(dispatch(E.VoiceStateUpdate, voice));
		cache.apply(
			dispatch(E.GuildMemberRemove, { guild_id: "30", user: user("1") }),
		);
		expect(cache.voiceStates.size("30")).toBe(0);
		cache.apply(dispatch(E.VoiceStateUpdate, voice));
		cache.apply(
			dispatch(E.ChannelDelete, { ...input.channels[0]!, guild_id: "30" }),
		);
		expect(cache.voiceStates.scopeCount).toBe(0);
	});
	test("message updates preserve identity, null reference removes deleted content, and miss is partial", () => {
		const cache = new EngineCache({ messagesPerChannel: 2 });
		cache.apply(dispatch(E.MessageCreate, message()));
		const before = cache.messages.peek("20", "100");
		cache.apply(
			dispatch(E.MessageUpdate, {
				id: "100",
				channel_id: "20",
				content: "edited",
				referenced_message: null,
			}),
		);
		expect(cache.messages.peek("20", "100")).toBe(before);
		expect(before?.data.content).toBe("edited");
		expect(before?.data.referenced_message).toBeNull();
		cache.apply(
			dispatch(E.MessageUpdate, {
				id: "101",
				channel_id: "20",
				content: "only known field",
			}),
		);
		expect(cache.messages.peek("20", "101")?.complete).toBe(false);
	});
	test("deletes return the previous record or native payload after removal; bulk deletes finish first", () => {
		const cache = new EngineCache({ messagesPerChannel: 3 });
		cache.apply(dispatch(E.GuildCreate, guild()));
		cache.apply(dispatch(E.MessageCreate, message()));
		const before = cache.messages.peek("20", "100");
		const payload = dispatch(E.MessageDeleteBulk, {
			channel_id: "20",
			ids: ["100", "404"],
		});
		const deleted = cache.apply(payload);
		expect(cache.messages.size("20")).toBe(0);
		expect(deleted[0]?.previous).toBe(before);
		expect(deleted[1]?.previous).toBeUndefined();
		expect(deleted[1]?.payload).toBe(payload);
		cache.apply(dispatch(E.GuildRoleDelete, { guild_id: "30", role_id: "10" }));
		expect(cache.roles.size("30")).toBe(0);
		expect(cache.members.peek("30", "1")?.data.roles).toEqual([]);
		cache.apply(dispatch(E.GuildDelete, { id: "30" }));
		expect(
			cache.guilds.size + cache.channels.size + cache.members.scopeCount,
		).toBe(0);
	});
	test("unavailable guild is retained as unavailable; clear ends resident identity", () => {
		const cache = new EngineCache();
		cache.apply(dispatch(E.GuildCreate, guild()));
		cache.apply(dispatch(E.VoiceStateUpdate, voice));
		expect(
			cache.apply(dispatch(E.GuildDelete, { id: "30", unavailable: true })),
		).toEqual([]);
		expect(cache.guilds.peek("30")?.data.unavailable).toBe(true);
		expect(cache.members.size("30")).toBe(0);
		expect(cache.voiceStates.size("30")).toBe(0);
		cache.apply(dispatch(E.VoiceStateUpdate, voice));
		cache.clear();
		expect(cache.voiceStates.scopeCount).toBe(0);
		expect(
			cache.guilds.size + cache.channels.size + cache.roles.scopeCount,
		).toBe(0);
	});
	test("category deletion preserves child channel identities and cached messages", () => {
		const cache = new EngineCache({ messagesPerChannel: 2 });
		const category = {
			id: "19",
			guild_id: "30",
			type: ChannelType.GuildCategory as const,
			name: "category",
			position: 0,
		};
		const child = {
			id: "20",
			guild_id: "30",
			type: ChannelType.GuildText as const,
			name: "general",
			position: 0,
			parent_id: "19",
		};
		cache.putChannel(category);
		cache.putChannel(child);
		cache.apply(dispatch(E.MessageCreate, message()));
		const before = cache.channels.peek("20");
		const cachedMessage = cache.messages.peek("20", "100");
		cache.apply(dispatch(E.ChannelDelete, category));
		expect(cache.channels.peek("19")).toBeUndefined();
		expect(cache.channels.peek("20")).toBe(before);
		expect(cache.messages.peek("20", "100")).toBe(cachedMessage);
		cache.apply(dispatch(E.ChannelUpdate, { ...child, parent_id: null }));
		expect(cache.channels.peek("20")).toBe(before);
		expect(before?.complete).toBe(true);
		expect(before?.data).toHaveProperty("parent_id", null);
	});
	for (const type of [
		ChannelType.AnnouncementThread,
		ChannelType.PublicThread,
		ChannelType.PrivateThread,
	] as const) {
		test(`parent channel deletion still removes child thread type ${type} and its messages`, () => {
			const cache = new EngineCache({ messagesPerChannel: 2 });
			const parent = {
				id: "20",
				guild_id: "30",
				type: ChannelType.GuildText as const,
				name: "general",
				position: 0,
			};
			cache.putChannel(parent);
			cache.putChannel({
				id: "21",
				guild_id: "30",
				type,
				name: "thread",
				parent_id: "20",
			});
			cache.apply(
				dispatch(E.MessageCreate, { ...message(), channel_id: "21" }),
			);
			cache.apply(dispatch(E.ChannelDelete, parent));
			expect(cache.channels.size).toBe(0);
			expect(cache.messages.scopeCount).toBe(0);
		});
	}
	test("prototype keys cannot modify object prototypes", () => {
		const store = new CacheStore<object>();
		store.patch(
			"1",
			JSON.parse(
				'{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
			) as object,
		);
		expect(Reflect.get({}, "polluted")).toBeUndefined();
	});
});

test("mentioned member payloads and structural member ID lists update recency", () => {
	const cache = new EngineCache({ membersPerGuild: 2 });
	cache.apply(memberEvent("1"));
	cache.apply(memberEvent("2"));
	cache.apply({
		op: 0,
		s: 5,
		t: "FUTURE",
		d: {
			guild_id: "30",
			mentions: [{ ...user("1"), member: { nick: null, roles: [] } }],
		},
	} as unknown as $GatewayDispatch);
	cache.apply(memberEvent("3"));
	expect(cache.members.peek("30", "2")).toBeUndefined();
	expect(cache.members.peek("30", "1")?.data.nick).toBeNull();
	cache.apply({
		op: 0,
		s: 6,
		t: "FUTURE",
		d: { guild_id: "30", removed_member_ids: ["1"] },
	} as unknown as $GatewayDispatch);
	cache.apply(memberEvent("4"));
	expect(cache.members.peek("30", "3")).toBeUndefined();
});

test("disabling channel cache does not discard independently enabled messages on an update", () => {
	const cache = new EngineCache({ channels: false, messagesPerChannel: 2 });
	cache.apply(dispatch(E.MessageCreate, message()));
	const channel = guild().channels[0];
	if (!channel) throw new Error("Missing fixture.");
	cache.apply(dispatch(E.ChannelUpdate, { ...channel, guild_id: "30" }));
	expect(cache.channels.size).toBe(0);
	expect(cache.messages.size("20")).toBe(1);
	cache.apply(dispatch(E.GuildDelete, { id: "30" }));
	expect(cache.messages.scopeCount).toBe(0);
	cache.apply(dispatch(E.VoiceStateUpdate, voice));
	cache.apply(dispatch(E.ChannelDelete, { ...channel, guild_id: "30" }));
	expect(cache.voiceStates.scopeCount).toBe(0);
});
