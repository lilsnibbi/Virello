import type { MessageContext as Message } from "../../discord/MessageContext";
import { AliasModule } from "../../core/modules/index";
import type { Awaitable } from "@virello/util/general";
import type { Result } from "@virello/util/result";
import type { ArgumentError } from "../errors/ArgumentError";
import type { MessageCommand } from "../types";
import { Args } from "./Args";

/** Defines a synchronous result of an {@link Argument}, check {@link Argument.AsyncResult} for the asynchronous version. */
export type ArgumentResult<T> = Result<T, ArgumentError<T>>;

/** Defines a synchronous or asynchronous result of an {@link Argument}, check {@link Argument.AsyncResult} for the asynchronous version. */
export type AwaitableArgumentResult<T> = Awaitable<ArgumentResult<T>>;

/** Defines an asynchronous result of an {@link Argument}, check {@link Argument.Result} for the synchronous version. */
export type AsyncArgumentResult<T> = Promise<ArgumentResult<T>>;

/** Named resolver that turns argument text into a typed Result. */
export interface IArgument<T> {
	/** The name of the argument, this is used to make the identification of an argument easier. */
	readonly name: string;

	/** The method which is called when invoking the argument. */
	run(
		parameter: string,
		context: Argument.RunContext<T>,
	): Argument.AwaitableResult<T>;
}

/** Extend this class to parse a custom argument with Args. */
export abstract class Argument<
	T = unknown,
	Options extends Argument.Options = Argument.Options,
>
	extends AliasModule<Options, "arguments">
	implements IArgument<T>
{
	/** Optional argument module metadata passed to the constructor by the loader. */
	public static override readonly options?: Argument.Options;
	/**
	 * Create an argument module.
	 * @param context - Loader metadata and argument store.
	 * @param options - Module settings; defaults to an empty object.
	 */
	public constructor(
		context: Argument.Context,
		options: Options = {} as Options,
	) {
		super(context, options);
	}

	/**
	 * Resolve one argument string.
	 * @param parameter - Text to parse.
	 * @param context - Invocation metadata and resolver options.
	 * @returns Ok with a typed value or Err with an ArgumentError, immediately or asynchronously.
	 */
	public abstract run(
		parameter: string,
		context: Argument.RunContext<T>,
	): Argument.AwaitableResult<T>;

	/** Wraps a value into a successful value. */
	public ok(value: T): Argument.Result<T> {
		return Args.ok(value);
	}

	/** Create an {@link Err} result containing an {@link ArgumentError} with a custom type. */
	public error(
		options: Omit<ArgumentError.Options<T>, "argument">,
	): Argument.Result<T> {
		return Args.error({ argument: this, identifier: this.name, ...options });
	}
}

/** Name, aliases, and enabled state for an argument module. */
export type ArgumentOptions = AliasModule.Options;

/** Invocation metadata and extra settings passed to an argument resolver. */
export interface ArgumentContext<T = unknown> extends Record<
	PropertyKey,
	unknown
> {
	/** Resolver being called. */
	argument: IArgument<T>;
	/** Argument reader for the current invocation. */
	args: Args;
	/** Triggering message. */
	message: Message;
	/** Command being invoked. */
	command: MessageCommand;
	/** Matched prefix and command metadata. */
	commandContext: MessageCommand.RunContext;
	/** Optional lower bound: number value, date timestamp in milliseconds, or string length, depending on the resolver. */
	minimum?: number;
	/** Optional upper bound in the same units as minimum. */
	maximum?: number;
	/** Extra context available to custom resolvers. Built-in number, date, and string bounds are inclusive regardless of this flag. */
	inclusive?: boolean;
}

/** Types and helpers for {@link Argument}. */
export declare namespace Argument {
	/** Shorthand for {@link ArgumentOptions}. */
	export type Options = ArgumentOptions;
	/** Shorthand for {@link ArgumentContext}. */
	export type RunContext<T = unknown> = ArgumentContext<T>;
	/** Shorthand for {@link AliasModule.Context}. */
	export type Context = AliasModule.Context<"arguments">;
	/** Shorthand for {@link ArgumentResult}. */
	export type Result<T> = ArgumentResult<T>;
	/** Shorthand for {@link AwaitableArgumentResult}. */
	export type AwaitableResult<T> = AwaitableArgumentResult<T>;
	/** Shorthand for {@link AsyncArgumentResult}. */
	export type AsyncResult<T> = AsyncArgumentResult<T>;
}
