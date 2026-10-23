import { Snowflake } from "./Snowflake";

/** Shared Snowflake instance using Discord’s 1420070400000-millisecond epoch. */
export const DiscordSnowflake = new Snowflake(1420070400000n);
