import type { CollectorFilter, MessageReaction } from "discord.js";
import type { User } from "discord.js";
import type {
	MessagePrompterChannelTypes,
	MessagePrompterMessage,
} from "../constants";
import type { IMessagePrompterExplicitReturnBase } from "../ExplicitReturnTypes";
import type { IMessagePrompterReactionStrategyOptions } from "../strategyOptions";
import { MessagePrompterBaseStrategy } from "./MessagePrompterBaseStrategy";

/** Prompt strategy that waits for a reaction from a configured list. Timeout and Discord failures reject. */
export class MessagePrompterReactionStrategy
	extends MessagePrompterBaseStrategy
	implements MessagePrompterReactionStrategy
{
	/** The emojis used */
	public reactions: string[];

	/** Constructor for the {@link MessagePrompterReactionStrategy} class */
	public constructor(
		message: MessagePrompterMessage,
		options: IMessagePrompterReactionStrategyOptions,
	) {
		super("reactions", message, options);

		this.reactions = options?.reactions;
	}

	/** This executes the {@link MessagePrompterReactionStrategy} and sends the message. The handler will wait for one (1) reaction. */
	public async run(
		channel: MessagePrompterChannelTypes,
		authorOrFilter: User | CollectorFilter<[MessageReaction, User]>,
	): Promise<IMessagePrompterExplicitReturnBase | string> {
		if (!this.reactions?.length)
			throw new TypeError("There are no reactions provided.");

		const response = await this.collectReactions(
			channel,
			authorOrFilter,
			this.reactions,
		);

		return this.explicitReturn ? response : (response.reaction ?? response);
	}
}
