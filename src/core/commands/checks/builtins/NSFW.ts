import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "discord.js";
import type { Message } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";

/** Require the invocation channel’s nsfw field to be true. Available through CorePreconditions. */
export class NSFWCheck extends AllFlowsPrecondition {
	/**
	 * Check a message invocation. Require the invocation channel’s nsfw field to be true.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async messageRun(message: Message): AllFlowsPrecondition.AsyncResult {
		// `nsfw` is undefined in DMChannel, doing `=== true`
		// will result on it returning `false`.
		return Reflect.get(await this.fetchChannelFromMessage(message), "nsfw") ===
			true
			? this.ok()
			: this.error({
					identifier: Identifiers.PreconditionNSFW,
					message: "You cannot run this message command outside NSFW channels.",
				});
	}

	/**
	 * Check a slash invocation. Require the invocation channel’s nsfw field to be true.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async chatInputRun(
		interaction: ChatInputCommandInteraction,
	): AllFlowsPrecondition.AsyncResult {
		const channel = await this.fetchChannelFromInteraction(interaction);

		// `nsfw` is undefined in DMChannel, doing `=== true`
		// will result on it returning `false`.
		return Reflect.get(channel, "nsfw") === true
			? this.ok()
			: this.error({
					identifier: Identifiers.PreconditionNSFW,
					message:
						"You cannot run this chat input command outside NSFW channels.",
				});
	}

	/**
	 * Check a context-menu invocation. Require the invocation channel’s nsfw field to be true.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async contextMenuRun(
		interaction: ContextMenuCommandInteraction,
	): AllFlowsPrecondition.AsyncResult {
		const channel = await this.fetchChannelFromInteraction(interaction);

		// `nsfw` is undefined in DMChannel, doing `=== true`
		// will result on it returning `false`.
		return Reflect.get(channel, "nsfw") === true
			? this.ok()
			: this.error({
					identifier: Identifiers.PreconditionNSFW,
					message: "You cannot run this command outside NSFW channels.",
				});
	}
}
