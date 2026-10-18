import type {
	CollectorFilter,
	Reaction as MessageReaction,
} from "../../../discord/Collector";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import type { APIUser as User } from "discord-api-types/v10";
import type { Ctor } from "../../index";
import type {
	MessagePrompterChannelTypes,
	MessagePrompterMessage,
} from "./constants";
import type {
	IMessagePrompterExplicitConfirmReturn,
	IMessagePrompterExplicitMessageReturn,
	IMessagePrompterExplicitNumberReturn,
	IMessagePrompterExplicitReturnBase,
} from "./ExplicitReturnTypes";
import { MessagePrompterBaseStrategy } from "./strategies/MessagePrompterBaseStrategy";
import { MessagePrompterConfirmStrategy } from "./strategies/MessagePrompterConfirmStrategy";
import { MessagePrompterMessageStrategy } from "./strategies/MessagePrompterMessageStrategy";
import { MessagePrompterNumberStrategy } from "./strategies/MessagePrompterNumberStrategy";
import { MessagePrompterReactionStrategy } from "./strategies/MessagePrompterReactionStrategy";
import type {
	IMessagePrompterConfirmStrategyOptions,
	IMessagePrompterNumberStrategyOptions,
	IMessagePrompterReactionStrategyOptions,
	IMessagePrompterStrategyOptions,
} from "./strategyOptions";

/** Response types for each named prompt strategy. Explicit mode adds response metadata. */
export interface StrategyReturns {
	/** Confirmation/cancellation reaction result. */
	confirm: IMessagePrompterExplicitConfirmReturn | boolean;
	/** Message reply result. */
	message: IMessagePrompterExplicitMessageReturn | Message;
	/** Numeric emoji selection result. */
	number: IMessagePrompterExplicitNumberReturn | number;
	/** Configured reaction selection result. */
	reaction: IMessagePrompterExplicitReturnBase | string;
}

/** Configuration accepted by each named prompt strategy. */
export interface StrategyOptions {
	/** Confirmation/cancellation reaction settings. */
	confirm: IMessagePrompterConfirmStrategyOptions;
	/** Message reply settings. */
	message: IMessagePrompterStrategyOptions;
	/** Numeric emoji selection settings. */
	number: IMessagePrompterNumberStrategyOptions;
	/** Configured reaction selection settings. */
	reaction: IMessagePrompterReactionStrategyOptions;
}

/** Collector argument tuples supplied to filters for each named prompt strategy. */
export interface StrategyFilters {
	/** Confirmation/cancellation reaction filter arguments. */
	confirm: [MessageReaction, User];
	/** Message reply filter arguments. */
	message: [Message];
	/** Numeric emoji selection filter arguments. */
	number: [MessageReaction, User];
	/** Configured reaction selection filter arguments. */
	reaction: [MessageReaction, User];
}

/** This is a {@link MessagePrompter}, a utility that sends a message, prompting for user input. */
export class MessagePrompter<S extends keyof StrategyReturns = "confirm"> {
	/** The strategy used in {@link MessagePrompter.run} */
	public strategy: MessagePrompterBaseStrategy;

	/** Constructor for the {@link MessagePrompter} class */
	public constructor(
		message: MessagePrompterMessage | MessagePrompterBaseStrategy,
		strategy?: S,
		strategyOptions?: S extends keyof StrategyOptions
			? StrategyOptions[S]
			: never,
	) {
		let strategyToRun: MessagePrompterBaseStrategy;

		if (message instanceof MessagePrompterBaseStrategy) {
			strategyToRun = message;
		} else {
			const mapStrategy = MessagePrompter.strategies.get(
				strategy ?? MessagePrompter.defaultStrategy,
			);

			if (!mapStrategy) {
				throw new Error("No strategy provided");
			}

			const Strategy = mapStrategy as Ctor<
				[message: MessagePrompterMessage, options?: StrategyOptions[S]],
				MessagePrompterBaseStrategy
			>;
			strategyToRun = new Strategy(message, strategyOptions);
		}

		this.strategy = strategyToRun;
	}

	/** This executes the {@link MessagePrompter} and sends the message. */
	public run<
		Filter extends (S extends keyof StrategyFilters
			? StrategyFilters[S]
			: unknown[]),
	>(
		channel: MessagePrompterChannelTypes,
		authorOrFilter: User | CollectorFilter<Filter>,
	): S extends keyof StrategyReturns ? Promise<StrategyReturns[S]> : never {
		return this.strategy.run(
			channel,
			authorOrFilter as User | CollectorFilter<unknown[]>,
		) as S extends keyof StrategyReturns ? Promise<StrategyReturns[S]> : never;
	}

	/** The available strategies */
	public static readonly strategies = new Map<
		keyof StrategyReturns,
		| typeof MessagePrompterConfirmStrategy
		| typeof MessagePrompterNumberStrategy
		| typeof MessagePrompterReactionStrategy
		| typeof MessagePrompterMessageStrategy
	>([
		["confirm", MessagePrompterConfirmStrategy],
		["number", MessagePrompterNumberStrategy],
		["reaction", MessagePrompterReactionStrategy],
		["message", MessagePrompterMessageStrategy],
	]);

	/** The default strategy to use */
	public static defaultStrategy: keyof StrategyReturns = "confirm";
}
