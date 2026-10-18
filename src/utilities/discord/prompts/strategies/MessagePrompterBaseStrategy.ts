import type { APIUser as User } from "discord-api-types/v10";
import { container } from "../../../../core/Container";
import type { VirelloClient } from "../../../../core/client/VirelloClient";
import type {
	CollectorFilter,
	CollectorOptions,
	Reaction as MessageReaction,
} from "../../../../discord/Collector";
import type { MessageContext as Message } from "../../../../discord/MessageContext";
import type { Awaitable } from "../../../index";
import type {
	MessagePrompterChannelTypes,
	MessagePrompterMessage,
} from "../constants";
import type { IMessagePrompterExplicitReturnBase } from "../ExplicitReturnTypes";
import type { IMessagePrompterStrategyOptions } from "../strategyOptions";

/** Prompt strategies share native sending, ordered collectors and deterministic cleanup. */
export abstract class MessagePrompterBaseStrategy {
	public timeout: number;
	public explicitReturn: boolean;
	public appliedMessage: Message | null = null;
	public editMessage: Message | undefined;
	private readonly selectedClient?: VirelloClient;

	public constructor(
		public type: string,
		public message: MessagePrompterMessage,
		options?: IMessagePrompterStrategyOptions,
	) {
		const defaults = MessagePrompterBaseStrategy.defaultStrategyOptions;
		this.timeout = options?.timeout ?? defaults.timeout ?? 10000;
		this.explicitReturn =
			options?.explicitReturn ?? defaults.explicitReturn ?? false;
		this.editMessage = options?.editMessage ?? defaults.editMessage;
		this.selectedClient = options?.client ?? defaults.client;
	}
	public get client(): VirelloClient {
		return this.selectedClient ?? this.editMessage?.client ?? container.client;
	}
	public abstract run(
		channel: MessagePrompterChannelTypes,
		authorOrFilter: User | CollectorFilter<unknown[]>,
	): Awaitable<unknown>;

	protected async send(channel: MessagePrompterChannelTypes): Promise<Message> {
		const channelId = typeof channel === "string" ? channel : channel.id;
		if (this.editMessage?.editable)
			this.appliedMessage = await this.editMessage.edit(this.message);
		else this.appliedMessage = await this.client.send(channelId, this.message);
		return this.appliedMessage;
	}

	/** Add the allowed reactions and wait for one accepted non-bot response. */
	protected async collectReactions(
		channel: MessagePrompterChannelTypes,
		authorOrFilter: User | CollectorFilter<[MessageReaction, User]>,
		reactions: string[],
	): Promise<IMessagePrompterExplicitReturnBase> {
		const message = await this.send(channel);
		const collector = message.createReactionCollector({
			...this.createReactionPromptFilter(reactions, authorOrFilter),
			max: 1,
			time: this.timeout,
		});
		const collected = new Promise<MessageReaction>((resolve, reject) => {
			collector.once("collect", resolve);
			collector.once("end", (values, reason) => {
				if (!values.size)
					reject(collector.error ?? new Error(`Collector ended: ${reason}`));
			});
			collector.once("error", reject);
		});
		// The collector can time out while reaction requests are still queued.
		void collected.catch(() => {});
		try {
			for (const reaction of reactions) {
				if (collector.ended || collector.collected.size) break;
				await message.react(reaction);
			}
			const selected = await collected;
			return {
				emoji: selected.emoji,
				reaction: reactions.find(
					(reaction) =>
						this.reactionKey(reaction) ===
						(selected.emoji.id ?? selected.emoji.name),
				),
				strategy: this,
				appliedMessage: message,
				message: this.message,
			};
		} finally {
			collector.stop();
			collector.removeAllListeners();
		}
	}
	protected reactionKey(emoji: string): string {
		return /^<?a?:?[^:<>]+:(\d+)>?$/.exec(emoji)?.[1] ?? emoji;
	}
	protected createReactionPromptFilter(
		reactions: string[],
		authorOrFilter: User | CollectorFilter<[MessageReaction, User]>,
	): CollectorOptions<[MessageReaction, User]> {
		return {
			filter: async (reaction, user) =>
				!user.bot &&
				reactions.some(
					(value) =>
						this.reactionKey(value) ===
						(reaction.emoji.id ?? reaction.emoji.name),
				) &&
				(typeof authorOrFilter === "function"
					? await authorOrFilter(reaction, user)
					: user.id === authorOrFilter.id),
		};
	}
	public static defaultStrategyOptions: IMessagePrompterStrategyOptions = {
		timeout: 10000,
		explicitReturn: false,
		editMessage: undefined,
	};
}
