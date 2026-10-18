import type { APIDMChannel, APIGuild } from "discord-api-types/v10";
/** Guild identity accepted by resolvers; cached guild metadata need not be complete. */
export type GuildReference = Pick<APIGuild, "id">;
/** Known identity and type for a DM whose remaining cached fields are incomplete. */
export type PartialDMChannel = Partial<APIDMChannel> &
	Pick<APIDMChannel, "id" | "type">;
