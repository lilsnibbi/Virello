import {
	MessageFlags,
	MessageFlagsBitField,
	type MessageEditOptions,
} from "discord.js";
import type { User } from "discord.js";
import { container } from "../../../../core/Container";
import type { VirelloClient } from "../../../../core/client/VirelloClient";
import type {
	CollectorFilter,
	CollectorOptions,
	MessageReaction,
} from "discord.js";
import type { Message } from "discord.js";
import type { Awaitable } from "../../../../../util/general";
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
		return this.selectedClient ?? container.client;
	}
	public abstract run(
		channel: MessagePrompterChannelTypes,
		authorOrFilter: User | CollectorFilter<unknown[]>,
	): Awaitable<unknown>;

	protected async send(channel: MessagePrompterChannelTypes): Promise<Message> {
		const channelId = typeof channel === "string" ? channel : channel.id;
		if (this.editMessage?.editable) {
			if (typeof this.message === "string") {
				this.appliedMessage = await this.editMessage.edit(this.message);
			} else {
				const flags =
					this.message.flags === undefined
						? undefined
						: new MessageFlagsBitField(
								this.message.flags as ConstructorParameters<
									typeof MessageFlagsBitField
								>[0],
							);
				if (
					flags?.any([
						MessageFlags.SuppressNotifications,
						MessageFlags.IsVoiceMessage,
					])
				)
					throw new TypeError(
						"SuppressNotifications and IsVoiceMessage apply only when sending a new prompt.",
					);
				this.appliedMessage = await this.editMessage.edit({
					...this.message,
					flags: flags?.bitfield as MessageEditOptions["flags"],
				});
			}
		} else
			this.appliedMessage = await this.client.send(channelId, this.message);
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
				if (!values.size) reject(new Error(`Collector ended: ${reason}`));
			});
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
