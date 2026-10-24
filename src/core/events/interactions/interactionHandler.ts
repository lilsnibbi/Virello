import type { BaseInteraction as Interaction } from "discord.js";
import { Module } from "../../core/modules/index";
import type { Awaitable } from "../../../util/general";
import { Option } from "../../../util/result/index";

/** Module that filters interactions with parse and handles accepted interactions with run. */
export abstract class InteractionHandler<
	Options extends InteractionHandler.Options = InteractionHandler.Options,
> extends Module<Options, "interactions"> {
	/** Optional class metadata passed as constructor options by the loader. */
	public static override readonly options?: InteractionHandler.Options;
	/** The type for this handler */
	public readonly interactionHandlerType: InteractionHandlerTypes;

	/**
	 * Create a handler for one interaction category.
	 * @param context - Loader metadata and interaction-handler store.
	 * @param options - Module settings with the required interactionHandlerType.
	 */
	public constructor(context: InteractionHandler.Context, options: Options) {
		super(context, options);

		this.interactionHandlerType = options.interactionHandlerType;
	}

	/**
	 * Handle an interaction accepted by parse. The store waits for completion and reports failures through
	 * InteractionHandlerError.
	 * @param interaction - Matching Discord interaction.
	 * @param parsedData - Value returned by parse inside Some.
	 * @returns Any value or asynchronous work; the value is ignored.
	 */
	public abstract run(interaction: Interaction, parsedData?: unknown): unknown;

	/**
	 * Decide whether this handler accepts an interaction. The default accepts every interaction in its category with
	 * Some(undefined).
	 * @param _interaction - Matching Discord interaction.
	 * @returns Some with optional parsed data to run, or None to skip. Throwing emits InteractionHandlerParseError.
	 */
	public parse(_interaction: Interaction): Awaitable<Option<unknown>> {
		return this.some();
	}

	/** Accept an interaction, optionally carrying data to run. Omitted data produces Some(undefined). */
	public some(): Option.Some<never>;
	/** Accept an interaction, optionally carrying data to run. Omitted data produces Some(undefined). */
	public some<T>(data: T): Option.Some<T>;
	/** Accept an interaction, optionally carrying data to run. Omitted data produces Some(undefined). */
	public some<T>(data?: T): Option.Some<T | undefined> {
		return Option.some(data);
	}

	/** Skip the interaction by returning the shared None value. */
	public none(): Option.None {
		return Option.none;
	}

	/** Return module metadata with the interaction category. */
	public override toJSON(): InteractionHandlerJSON {
		return {
			...super.toJSON(),
			interactionHandlerType: this.interactionHandlerType,
		};
	}
}

/** Module settings with a required interaction category. */
export interface InteractionHandlerOptions extends Module.Options {
	/** The type of interaction this handler is for. Must be one of {@link InteractionHandlerTypes}. */
	readonly interactionHandlerType: InteractionHandlerTypes;
}

/** Serialized interaction-handler metadata. */
export interface InteractionHandlerJSON extends Module.JSON {
	/** Interaction category handled by this module. */
	interactionHandlerType: InteractionHandlerTypes;
}

/** Value carried by the Some branch of a handler’s awaited parse result. */
export type InteractionHandlerParseResult<Instance extends InteractionHandler> =
	Option.UnwrapSome<Awaited<ReturnType<Instance["parse"]>>>;

/** Types and helpers for {@link InteractionHandler}. */
export declare namespace InteractionHandler {
	/** Shorthand for {@link Module.Context}. */
	export type Context = Module.Context<"interactions">;
	/** Shorthand for {@link InteractionHandlerOptions}. */
	export type Options = InteractionHandlerOptions;
	/** Shorthand for {@link InteractionHandlerJSON}. */
	export type JSON = InteractionHandlerJSON;
	/** Shorthand for {@link InteractionHandlerParseResult}. */
	export type ParseResult<Instance extends InteractionHandler> =
		InteractionHandlerParseResult<Instance>;
}

/** Interaction categories used to filter handlers before parse runs. */
export enum InteractionHandlerTypes {
	// Specifically focused types
	/** Button interactions. */
	Button,
	/** Any select-menu interaction. */
	SelectMenu,
	/** Modal submissions. */
	ModalSubmit,

	// More free-falling handlers, for 1 shared handler between buttons and select menus (someone will have a use for this >,>)
	/** Any message component, including buttons and select menus. */
	MessageComponent,
	// Optional autocompletes, you can use this or in-command
	/** Autocomplete interactions. */
	Autocomplete,
}
