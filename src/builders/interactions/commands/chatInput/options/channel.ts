// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { Mixin } from "ts-mixer";
import { channelOptionPredicate } from "../Assertions";
import { ApplicationCommandOptionChannelTypesMixin } from "../mixins/ApplicationCommandOptionChannelTypesMixin";
import { ApplicationCommandOptionBase } from "./ApplicationCommandOptionBase";

/**
 * A chat input command channel option.
 *
 * @mixes {@link ApplicationCommandOptionBase}
 * @mixes {@link ApplicationCommandOptionChannelTypesMixin}
 */
export class ChatInputCommandChannelOption extends Mixin(
	ApplicationCommandOptionBase,
	ApplicationCommandOptionChannelTypesMixin,
) {
	/**
	 * @internal
	 */
	protected static override readonly predicate = channelOptionPredicate;

	/**
	 * Creates a new channel option.
	 */
	public constructor() {
		super(ApplicationCommandOptionType.Channel);
	}
}
