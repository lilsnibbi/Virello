import type {
	APIEmbed,
	APIMessageTopLevelComponent,
	APIInteractionResponseCallbackData,
	RESTPostAPIChannelMessageJSONBody,
	RESTPatchAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import type { $RestRequest } from "@virello/rest";

import type { JSONEncodable } from "@virello/builders";
export { isJSONEncodable, type JSONEncodable } from "@virello/builders";
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
