import type { Message } from "discord.js";
import type { MessageReaction as Reaction } from "discord.js";
import type { MessagePrompterMessage } from "./constants";
import type { MessagePrompterBaseStrategy } from "./strategies/MessagePrompterBaseStrategy";

/** Prompt and collected-reaction metadata returned in explicit mode. */
export interface IMessagePrompterExplicitReturnBase {
	/** Collected Discord emoji, present for reaction-based strategies. */
	emoji?: Reaction["emoji"];
	/** Matching configured reaction value, when found. */
	reaction?: string;
	/** Strategy instance that handled the prompt. */
	strategy: MessagePrompterBaseStrategy;
	/** Sent or edited prompt message. */
	appliedMessage: Message;
	/** Original prompt content/options. */
	message: MessagePrompterMessage;
}

/** Explicit confirmation response with a boolean selection. */
export interface IMessagePrompterExplicitConfirmReturn extends IMessagePrompterExplicitReturnBase {
	/** True for the configured confirm reaction; false for cancel. */
	confirmed: boolean;
}

/** Explicit numeric-selection response. */
export interface IMessagePrompterExplicitNumberReturn extends IMessagePrompterExplicitReturnBase {
	/** Number corresponding to the selected emoji’s range position. */
	number: number;
}

/** Explicit prompt response containing the collected message. */
export interface IMessagePrompterExplicitMessageReturn extends IMessagePrompterExplicitReturnBase {
	/** Collected response message. */
	response?: Message;
}
