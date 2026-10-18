import type {
	APIInteraction,
	APIInteractionResponseCallbackData,
	RESTPostAPIInteractionCallbackJSONBody,
} from "discord-api-types/v10";
import {
	InteractionResponseType,
	InteractionType,
} from "discord-api-types/v10";
import type { RestClient } from "../rest/RestClient";
import type { $RestRequest } from "../rest/RestClient";
import { Routes } from "discord-api-types/v10";
import { RestError } from "../rest/RestError";

/** Initial-response state. Unknown means a transport failure left delivery uncertain; another initial response is blocked. */
export type $InteractionReplyState =
	"unanswered" | "pending" | "answered" | "unknown";

/** Uses native callback bodies and prevents concurrent initial responses. */
export class EngineInteraction {
	private current: $InteractionReplyState = "unanswered";
	/**
	 * Wrap a native interaction with initial-response tracking.
	 * @param data - Native interaction payload.
	 * @param rest - REST client used to send callbacks.
	 */
	public constructor(
		/** Original native Discord interaction payload. */
		public readonly data: APIInteraction,
		private readonly rest: RestClient,
	) {}
	/** Current initial-response state: unanswered, pending, answered, or uncertain after a transport failure. */
	public get replyState(): $InteractionReplyState {
		return this.current;
	}
	/**
	 * Send a channel-message initial response for a command, component, or modal interaction.
	 * @param data - Native response message data.
	 * @returns Completion of the initial response.
	 * @throws For other interaction types, consumed responses, or REST failures.
	 */
	public reply(data: APIInteractionResponseCallbackData): Promise<void> {
		if (
			![
				InteractionType.ApplicationCommand,
				InteractionType.MessageComponent,
				InteractionType.ModalSubmit,
			].includes(this.data.type)
		)
			return Promise.reject(
				new TypeError(
					"This interaction requires a different native callback type.",
				),
			);
		return this.respond({
			type: InteractionResponseType.ChannelMessageWithSource,
			data,
		});
	}
	/**
	 * Send one native initial callback. Concurrent or repeated initial callbacks are rejected.
	 * @param body - Native callback type and data.
	 * @returns Completion of delivery. A 4xx failure restores unanswered; uncertain failures set unknown.
	 * @throws If a response is already pending/consumed or REST delivery fails.
	 */
	public async respond(
		body: RESTPostAPIInteractionCallbackJSONBody,
		files?: $RestRequest["files"],
	): Promise<void> {
		if (this.current !== "unanswered")
			throw new Error(
				"Interaction initial response is already pending or consumed.",
			);
		this.current = "pending";
		try {
			await this.rest.request({
				method: "POST",
				path: Routes.interactionCallback(this.data.id, this.data.token),
				body,
				files,
				auth: false,
			});
			this.current = "answered";
		} catch (error) {
			this.current =
				error instanceof RestError && error.status >= 400 && error.status < 500
					? "unanswered"
					: "unknown";
			throw error;
		}
	}
}
