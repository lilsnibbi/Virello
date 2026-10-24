import type {
	ChatInputCommandInteraction,
	CommandInteraction,
	ContextMenuCommandInteraction,
} from "../../../discord/InteractionContext";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import type { Snowflake } from "discord-api-types/v10";
import { RateLimitManager } from "@virello/util/time";
import type { Command } from "../../Command";
import { BucketScope } from "../../enums";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";

/** Settings for one command’s cooldown check. */
export interface CooldownPreconditionContext
	extends AllFlowsPrecondition.RunContext {
	/** Bucket key scope. Defaults to BucketScope.User. */
	scope?: BucketScope;
	/** Reset interval in milliseconds. A falsy value skips the cooldown. */
	delay: number;
	/** Uses per bucket. Defaults to 1. */
	limit?: number;
	/** User IDs that skip this cooldown. */
	filteredUsers?: Snowflake[];
}

/** Consume a command’s cooldown bucket unless the caller is exempt. Available through CorePreconditions. */
export class CooldownCheck extends AllFlowsPrecondition {
	/** Cooldown managers keyed by command instance. Each manager owns that command’s scoped buckets. */
	public buckets: WeakMap<Command, RateLimitManager<string>> = new WeakMap<
		Command,
		RateLimitManager<string>
	>();

	/**
	 * Check a message invocation. Consume a command’s cooldown bucket unless the caller is exempt.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public messageRun(
		message: Message,
		command: Command,
		context: CooldownPreconditionContext,
	): AllFlowsPrecondition.Result {
		const cooldownId = this.getIdFromMessage(message, context);

		return this.sharedRun(
			message.author.id,
			command,
			context,
			cooldownId,
			"message",
		);
	}

	/**
	 * Check a slash invocation. Consume a command’s cooldown bucket unless the caller is exempt.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public chatInputRun(
		interaction: ChatInputCommandInteraction,
		command: Command,
		context: CooldownPreconditionContext,
	): AllFlowsPrecondition.Result {
		const cooldownId = this.getIdFromInteraction(interaction, context);

		return this.sharedRun(
			interaction.user.id,
			command,
			context,
			cooldownId,
			"chat input",
		);
	}

	/**
	 * Check a context-menu invocation. Consume a command’s cooldown bucket unless the caller is exempt.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		command: Command,
		context: CooldownPreconditionContext,
	): AllFlowsPrecondition.Result {
		const cooldownId = this.getIdFromInteraction(interaction, context);

		return this.sharedRun(
			interaction.user.id,
			command,
			context,
			cooldownId,
			"context menu",
		);
	}

	private sharedRun(
		authorId: string,
		command: Command,
		context: CooldownPreconditionContext,
		cooldownId: string,
		commandType: string,
	): AllFlowsPrecondition.Result {
		// If the command it is testing for is not this one, return ok:
		if (context.external) return this.ok();

		// If there is no delay (undefined, null, 0), return ok:
		if (!context.delay) return this.ok();

		// If the user has provided any filtered users and the authorId is in that array, return ok:
		if (context.filteredUsers?.includes(authorId)) return this.ok();

		const rateLimit = this.getManager(command, context).acquire(cooldownId);

		if (rateLimit.limited) {
			const remaining = rateLimit.remainingTime;
			const nextAvailable = `<t:${Math.floor(rateLimit.expires / 1000)}:R>`;

			return this.error({
				identifier: Identifiers.PreconditionCooldown,
				message: `There is a cooldown in effect for this ${commandType} command. It'll be available ${nextAvailable}.`,
				context: { remaining },
			});
		}

		rateLimit.consume();
		return this.ok();
	}

	private getIdFromMessage(
		message: Message,
		context: CooldownPreconditionContext,
	) {
		switch (context.scope) {
			case BucketScope.Global:
				return "global";
			case BucketScope.Channel:
				return message.channelId;
			case BucketScope.Guild:
				return message.guildId ?? message.channelId;
			default:
				return message.author.id;
		}
	}

	private getIdFromInteraction(
		interaction: CommandInteraction,
		context: CooldownPreconditionContext,
	) {
		switch (context.scope) {
			case BucketScope.Global:
				return "global";
			case BucketScope.Channel:
				return interaction.channelId ?? interaction.user.id;
			case BucketScope.Guild:
				return (
					interaction.guildId ?? interaction.channelId ?? interaction.user.id
				);
			default:
				return interaction.user.id;
		}
	}

	private getManager(command: Command, context: CooldownPreconditionContext) {
		let manager = this.buckets.get(command);
		if (!manager) {
			manager = new RateLimitManager(context.delay, context.limit);
			this.buckets.set(command, manager);
		}
		return manager;
	}
}
