import { Snowflake } from "./Snowflake";

/** Shared Snowflake instance using Twitter’s 1288834974657-millisecond epoch. */
export const TwitterSnowflake = new Snowflake(1288834974657n);
