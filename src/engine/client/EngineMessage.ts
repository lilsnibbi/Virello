import type {
	APIMessage,
	RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import type { RestClient } from "../rest/RestClient";

/** A thin helper over a native message object; data may be a live cache object. */
export class EngineMessage {
	/**
	 * Wrap a native message with a reply helper.
	 * @param data - Native message payload.
	 * @param rest - REST client used to send replies.
	 */
	public constructor(
		/** Native message data wrapped by this helper. */
		public readonly data: APIMessage,
		private readonly rest: RestClient,
	) {}
	/**
	 * Reply in this message’s channel. Supplied message_reference fields override the default reference.
	 * @param body - Native message body.
	 * @returns The created native message; REST failures reject.
	 */
	public reply(body: RESTPostAPIChannelMessageJSONBody): Promise<APIMessage> {
		return this.rest.createMessage(this.data.channel_id, {
			...body,
			message_reference: {
				message_id: this.data.id,
				channel_id: this.data.channel_id,
				...body.message_reference,
			},
		});
	}
}
