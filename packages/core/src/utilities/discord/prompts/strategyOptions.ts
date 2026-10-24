import type { MessageContext as Message } from "../../../discord/MessageContext";
import type { VirelloClient } from "../../../core/client/VirelloClient";

/** Common settings for a prompt strategy. */
export interface IMessagePrompterStrategyOptions {
	/** Client used to send and collect. Defaults to editMessage.client or the active container client. */
	client?: VirelloClient;
	/** Collector timeout in milliseconds. Defaults to the strategy’s global default, initially 10000. */
	timeout?: number;
	/** Return response metadata instead of only the selected value. Defaults to the global default, initially false. */
	explicitReturn?: boolean;
	/** Editable message to reuse for the prompt. Otherwise a new message is sent. */
	editMessage?: Message;
}

/** Prompt settings and confirm/cancel reactions. */
export interface IMessagePrompterConfirmStrategyOptions extends IMessagePrompterStrategyOptions {
	/** Confirmation reaction. Defaults to the strategy’s static confirmEmoji, initially 🇾. */
	confirmEmoji?: string;
	/** Cancellation reaction. Defaults to the strategy’s static cancelEmoji, initially 🇳. */
	cancelEmoji?: string;
}

/** Settings for a prompt that selects from an emoji range. */
export interface IMessagePrompterNumberStrategyOptions extends IMessagePrompterStrategyOptions {
	/** Starting emoji index and returned number. Defaults to 0; negative values throw when run. */
	start?: number;
	/** Exclusive ending emoji index. Defaults to 10; values above 10 throw when run. */
	end?: number;
	/** Emoji lookup array. Defaults to the strategy’s static 0–10 emoji list. */
	numberEmojis?: string[];
}

/** Prompt settings with the accepted reaction list. */
export interface IMessagePrompterReactionStrategyOptions extends IMessagePrompterStrategyOptions {
	/** Reactions to add and accept. An empty or missing list throws when run. */
	reactions: string[];
}
