import type {
	APIChannel,
	APIGuild,
	APIGuildMember,
	APIMessage,
	APIRole,
	APIVoiceState,
} from "discord-api-types/v10";
import type { $GatewayDispatch } from "../gateway/types";

/** Partial object data merged into a cache entry. Nested objects are partial; arrays are replaced as complete values. */
export type $Patch<T> = T extends readonly unknown[]
	? T
	: T extends object
		? { [K in keyof T]?: $Patch<T[K]> }
		: T;

/** Cached entity with a completeness flag. A patch alone never makes an entry complete. */
export type $CacheEntry<T> =
	| {
			/** True after a full entity was stored with put; false when only patches are known. */
			complete: true;
			/** Full entity when complete is true; otherwise the known partial fields. */
			data: T;
	  }
	| {
			/** True after a full entity was stored with put; false when only patches are known. */
			complete: false;
			/** Full entity when complete is true; otherwise the known partial fields. */
			data: $Patch<T>;
	  };

/** Native Discord entity types supported by the engine cache. */
export interface $CacheEntities {
	/** Guild metadata, possibly marked unavailable. Gateway guild snapshots remain partial. */
	guild: APIGuild & {
		/** Whether Discord temporarily marked this guild unavailable, when known. */
		unavailable?: boolean;
	};
	/** Native Discord channel data. */
	channel: APIChannel;
	/** Native Discord role data, scoped to a guild. */
	role: APIRole;
	/** Native Discord guild member data, scoped to a guild. */
	member: APIGuildMember;
	/** Native Discord message data, scoped to a channel. */
	message: APIMessage;
	/** Connected voice states, scoped to a guild and keyed by user ID. */
	voiceState: APIVoiceState;
}
/** Entity names accepted by cache policies and deletion events. */
export type $CacheKind = keyof $CacheEntities;
/** Candidate cache write passed to the synchronous policy callback. */
export interface $CacheDecision {
	/** Kind of entity being stored. */
	kind: $CacheKind;
	/** Entity ID; member entries use the user ID. */
	id: string;
	/** Guild ID for roles and members, channel ID for messages, or the available guild ID/empty string for channels and guilds. */
	scope: string;
	/** Incoming full or partial data. Treat it as read-only. */
	data: Readonly<object>;
}
/** Return true to retain an incoming entity or false to remove or skip it. Called synchronously before cache writes. */
export type $CachePolicy = (entry: $CacheDecision) => boolean;
/** Resident cache settings used for gateway and explicit fetch results. */
export interface $CacheOptions {
	/** Cache guild metadata unless false. Defaults to true. */
	guilds?: boolean;
	/** Cache channels unless false. Defaults to true. */
	channels?: boolean;
	/** Cache roles unless false. Defaults to true. */
	roles?: boolean;
	/** Retain connected voice states from guild snapshots and voice updates. Defaults to true; requires GuildVoiceStates intent for updates. */
	voiceStates?: boolean;
	/**
	 * Nonnegative member limit per guild, or a callback returning that limit when the guild cache is created. Defaults to
	 * 1000; 0 disables it.
	 */
	membersPerGuild?: number | ((guildId: string) => number);
	/** Nonnegative message limit per channel. Defaults to 0, which disables message caching. */
	messagesPerChannel?: number;
	/** Optional synchronous filter for incoming writes. Return false to exclude the entity; accepted entries still follow capacity limits. */
	policy?: $CachePolicy;
}

/** Deletion emitted from a gateway dispatch, with any previous cached entry and the original payload. */
export type $CacheDeletion = {
	[K in $CacheKind]: {
		/** Deleted entity kind, narrowing the previous entry’s type. */
		kind: K;
		/** Deleted entity ID; members use the user ID. */
		id: string;
		/** Owning guild or channel ID, or an empty string for an unscoped entity. */
		scope: string;
		/** Cached entry removed by the dispatch, or undefined if no entry existed. */
		previous: $CacheEntry<$CacheEntities[K]> | undefined;
		/** Original gateway dispatch that caused this deletion. */
		payload: $GatewayDispatch;
	};
}[$CacheKind];
