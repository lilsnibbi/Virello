import type {
	APIEmbed,
	APIMessageTopLevelComponent,
	APIInteractionResponseCallbackData,
	RESTPostAPIChannelMessageJSONBody,
	RESTPatchAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import type { $RestRequest } from "../engine/rest/RestClient";

/** Builders are accepted wherever a native embed or component is accepted. */
export interface JSONEncodable<T> {
	toJSON(): T;
}
export function isJSONEncodable<T>(
	value: T | JSONEncodable<T> | undefined,
): value is JSONEncodable<T> {
	return (
		typeof value === "object" &&
		value !== null &&
		"toJSON" in value &&
		typeof value.toJSON === "function"
	);
}
type BuiltContent = {
	embeds?: readonly (APIEmbed | JSONEncodable<APIEmbed>)[];
	components?: readonly (
		APIMessageTopLevelComponent | JSONEncodable<APIMessageTopLevelComponent>
	)[];
	files?: $RestRequest["files"];
};
export type MessageBody = Omit<
	RESTPostAPIChannelMessageJSONBody,
	"embeds" | "components"
> &
	BuiltContent;
export type MessageEditBody = Omit<
	RESTPatchAPIChannelMessageJSONBody,
	"embeds" | "components"
> &
	BuiltContent;
export type InteractionReplyBody = Omit<
	APIInteractionResponseCallbackData,
	"embeds" | "components"
> &
	BuiltContent;
/** Snapshot builders into a native Discord JSON body and separate multipart uploads. */
export function messagePayload(
	input: string | MessageBody | MessageEditBody | InteractionReplyBody,
): { body: Record<string, unknown>; files: $RestRequest["files"] } {
	if (typeof input === "string")
		return { body: { content: input }, files: undefined };
	const { files, ...body } = input;
	return {
		body: JSON.parse(JSON.stringify(body)) as Record<string, unknown>,
		files,
	};
}
