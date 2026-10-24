import type { CollectorFilter, MessageReaction } from "discord.js";
import type { User } from "discord.js";
import type {
	MessagePrompterChannelTypes,
	MessagePrompterMessage,
} from "../constants";
import type { IMessagePrompterExplicitConfirmReturn } from "../ExplicitReturnTypes";
import type { IMessagePrompterConfirmStrategyOptions } from "../strategyOptions";
import { MessagePrompterBaseStrategy } from "./MessagePrompterBaseStrategy";

/** Prompt strategy that waits for a confirmation or cancellation reaction. Timeout and Discord failures reject. */
export class MessagePrompterConfirmStrategy
	extends MessagePrompterBaseStrategy
	implements IMessagePrompterConfirmStrategyOptions
{
	/** The confirm emoji used */
	public confirmEmoji: string;

	/** The cancel emoji used */
	public cancelEmoji: string;

	/** Constructor for the {@link MessagePrompterBaseStrategy} class */
	public constructor(
		message: MessagePrompterMessage,
		options?: IMessagePrompterConfirmStrategyOptions,
	) {
		super("confirm", message, options);

		this.confirmEmoji =
			options?.confirmEmoji ?? MessagePrompterConfirmStrategy.confirmEmoji;
		this.cancelEmoji =
			options?.cancelEmoji ?? MessagePrompterConfirmStrategy.cancelEmoji;
	}

	/** This executes the {@link MessagePrompter} and sends the message if {@link IMessagePrompterOptions.type} equals confirm. The handler will wait for one (1) reaction. */
	public override async run(
		channel: MessagePrompterChannelTypes,
		authorOrFilter: User | CollectorFilter<[MessageReaction, User]>,
	): Promise<IMessagePrompterExplicitConfirmReturn | boolean> {
		const response = await this.collectReactions(channel, authorOrFilter, [
			this.confirmEmoji,
			this.cancelEmoji,
		]);

		const confirmed =
			(response?.emoji?.id ?? response?.emoji?.name) ===
			this.reactionKey(this.confirmEmoji);

		return this.explicitReturn ? { ...response, confirmed } : confirmed;
	}

	/** The default confirm emoji used for {@link MessagePrompterConfirmStrategy} */
	public static confirmEmoji: string = "🇾";

	/** The default cancel emoji used for {@link MessagePrompterConfirmStrategy} */
	public static cancelEmoji: string = "🇳";
}
