import type { APIUser as User } from "discord-api-types/v10";
import {
	MessageCollector,
	type CollectorFilter,
	type CollectorOptions,
} from "../../../../discord/Collector";
import type { MessageContext as Message } from "../../../../discord/MessageContext";
import type {
	MessagePrompterChannelTypes,
	MessagePrompterMessage,
} from "../constants";
import type { IMessagePrompterExplicitMessageReturn } from "../ExplicitReturnTypes";
import type { IMessagePrompterStrategyOptions } from "../strategyOptions";
import { MessagePrompterBaseStrategy } from "./MessagePrompterBaseStrategy";

/** Wait for one accepted non-bot message; timeout and Discord failures reject. */
export class MessagePrompterMessageStrategy
	extends MessagePrompterBaseStrategy
	implements IMessagePrompterStrategyOptions
{
	public constructor(
		message: MessagePrompterMessage,
		options: IMessagePrompterStrategyOptions,
	) {
		super("message", message, options);
	}
	public override async run(
		channel: MessagePrompterChannelTypes,
		authorOrFilter: User | CollectorFilter<[Message]>,
	): Promise<IMessagePrompterExplicitMessageReturn | Message> {
		const appliedMessage = await this.send(channel);
		const collector = new MessageCollector(
			this.client,
			appliedMessage.channelId,
			{
				...this.createMessagePromptFilter(authorOrFilter),
				max: 1,
				time: this.timeout,
			},
		);
		try {
			const response = await new Promise<Message>((resolve, reject) => {
				collector.once("collect", resolve);
				collector.once("end", (values, reason) => {
					if (!values.size)
						reject(
							collector.error ?? new Error(`No messages received: ${reason}`),
						);
				});
				collector.once("error", reject);
			});
			return this.explicitReturn
				? { response, strategy: this, appliedMessage, message: this.message }
				: response;
		} finally {
			collector.stop();
			collector.removeAllListeners();
		}
	}
	private createMessagePromptFilter(
		authorOrFilter: User | CollectorFilter<[Message]>,
	): CollectorOptions<[Message]> {
		return {
			filter: async (message) =>
				!message.author.bot &&
				(typeof authorOrFilter === "function"
					? await authorOrFilter(message)
					: message.author.id === authorOrFilter.id),
		};
	}
}
