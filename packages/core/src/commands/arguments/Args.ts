import type { URL } from "node:url";
import type {
	APIGuildCategoryChannel as CategoryChannel,
	ChannelType,
	APIDMChannel as DMChannel,
	APIGuildMember as GuildMember,
	APINewsChannel as NewsChannel,
	APIRole as Role,
	APIGuildStageVoiceChannel as StageChannel,
	APITextChannel as TextChannel,
	APIThreadChannel as ThreadChannel,
	APIUser as User,
	APIGuildVoiceChannel as VoiceChannel,
} from "discord-api-types/v10";
import type { MessageContext as Message } from "../../discord/MessageContext";
import { container } from "../../core/modules/index";
import type {
	ChannelTypes,
	GuildBasedChannelTypes,
} from "../../utilities/discord/index";
import type { Awaitable } from "@virello/util/general";
import {
	type ArgumentStream,
	join,
	type Parameter,
} from "@virello/util/parsing";
import { Option, Result } from "@virello/util/result";
import { ArgumentError } from "../errors/ArgumentError";
import { Identifiers } from "../errors/Identifiers";
import { UserError } from "../errors/UserError";
import type { MessageCommand } from "../types";
import type { Argument, IArgument } from "./Argument";
import type { EmojiObject } from "./resolvers/emoji";

/** The argument parser to be used in {@link Command}. */
export class Args {
	/** The original message that triggered the command. */
	public readonly message: Message;

	/** The command that is being run. */
	public readonly command: MessageCommand;

	/** The context of the command being run. */
	public readonly commandContext: MessageCommand.RunContext;

	/** The internal Lexure parser. */
	protected readonly parser: ArgumentStream;

	/** The states stored in the args. */
	private readonly states: ArgumentStream.State[] = [];

	/**
	 * Wrap the parsed arguments for one message command.
	 * @param message - Triggering message.
	 * @param command - Command being invoked.
	 * @param parser - Parsed argument stream.
	 * @param context - Matched command and prefix metadata.
	 */
	public constructor(
		message: Message,
		command: MessageCommand,
		parser: ArgumentStream,
		context: MessageCommand.RunContext,
	) {
		this.message = message;
		this.command = command;
		this.parser = parser;
		this.commandContext = context;
	}

	/** Set the parser to the first token. */
	public start(): Args {
		this.parser.reset();
		return this;
	}

	/**
	 * Resolve the next positional argument, consuming it only on success.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns Ok with the parsed value, or an unavailable, missing, or argument error. Resolver exceptions still reject.
	 */
	public async pickResult<T>(
		type: IArgument<T>,
		options?: ArgOptions,
	): Promise<ResultType<T>>;
	/**
	 * Resolve the next positional argument, consuming it only on success.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns Ok with the parsed value, or an unavailable, missing, or argument error. Resolver exceptions still reject.
	 */
	public async pickResult<K extends keyof ArgType>(
		type: K,
		options?: ArgOptions,
	): Promise<ResultType<ArgType[K]>>;
	/**
	 * Resolve the next positional argument, consuming it only on success.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns Ok with the parsed value, or an unavailable, missing, or argument error. Resolver exceptions still reject.
	 */
	public async pickResult<K extends keyof ArgType>(
		type: K,
		options: ArgOptions = {},
	): Promise<ResultType<ArgType[K]>> {
		const argument = this.resolveArgument<ArgType[K]>(type);
		if (!argument) return this.unavailableArgument(type);

		const result = await this.parser.singleParseAsync(async (arg) =>
			argument.run(arg, {
				args: this,
				argument,
				message: this.message,
				command: this.command,
				commandContext: this.commandContext,
				...options,
			}),
		);
		if (result.isErrAnd((value) => value === null)) {
			return this.missingArguments();
		}

		return result as ResultType<ArgType[K]>;
	}

	/**
	 * Resolve and consume the next positional argument.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns The parsed value.
	 * @throws The raw UserError or ArgumentError on failure; resolver exceptions also propagate.
	 */
	public async pick<T>(type: IArgument<T>, options?: ArgOptions): Promise<T>;
	/**
	 * Resolve and consume the next positional argument.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns The parsed value.
	 * @throws The raw UserError or ArgumentError on failure; resolver exceptions also propagate.
	 */
	public async pick<K extends keyof ArgType>(
		type: K,
		options?: ArgOptions,
	): Promise<ArgType[K]>;
	/**
	 * Resolve and consume the next positional argument.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns The parsed value.
	 * @throws The raw UserError or ArgumentError on failure; resolver exceptions also propagate.
	 */
	public async pick<K extends keyof ArgType>(
		type: K,
		options?: ArgOptions,
	): Promise<ArgType[K]> {
		const result = await this.pickResult(type, options);
		return result.unwrapRaw();
	}

	/**
	 * Join all remaining positional arguments and resolve them as one value. Restore the cursor if the resolver returns Err.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns The parsed value or an argument/missing-resolver error. Resolver exceptions still reject.
	 */
	public async restResult<T>(
		type: IArgument<T>,
		options?: ArgOptions,
	): Promise<ResultType<T>>;
	/**
	 * Join all remaining positional arguments and resolve them as one value. Restore the cursor if the resolver returns Err.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns The parsed value or an argument/missing-resolver error. Resolver exceptions still reject.
	 */
	public async restResult<K extends keyof ArgType>(
		type: K,
		options?: ArgOptions,
	): Promise<ResultType<ArgType[K]>>;
	/**
	 * Join all remaining positional arguments and resolve them as one value. Restore the cursor if the resolver returns Err.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns The parsed value or an argument/missing-resolver error. Resolver exceptions still reject.
	 */
	public async restResult<T>(
		type: keyof ArgType | IArgument<T>,
		options: ArgOptions = {},
	): Promise<ResultType<T>> {
		const argument = this.resolveArgument(type);
		if (!argument) return this.unavailableArgument(type);
		if (this.parser.finished) return this.missingArguments();

		const state = this.parser.save();
		const data = join(this.parser.many().unwrapOr<Parameter[]>([]));
		const result = await argument.run(data, {
			args: this,
			argument,
			message: this.message,
			command: this.command,
			commandContext: this.commandContext,
			...options,
		});

		return result.inspectErr(() => this.parser.restore(state));
	}

	/**
	 * Resolve all remaining positional arguments as one joined value.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns The parsed value.
	 * @throws The raw resolution error, or a thrown resolver exception.
	 */
	public async rest<T>(type: IArgument<T>, options?: ArgOptions): Promise<T>;
	/**
	 * Resolve all remaining positional arguments as one joined value.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns The parsed value.
	 * @throws The raw resolution error, or a thrown resolver exception.
	 */
	public async rest<K extends keyof ArgType>(
		type: K,
		options?: ArgOptions,
	): Promise<ArgType[K]>;
	/**
	 * Resolve all remaining positional arguments as one joined value.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings.
	 * @returns The parsed value.
	 * @throws The raw resolution error, or a thrown resolver exception.
	 */
	public async rest<K extends keyof ArgType>(
		type: K,
		options?: ArgOptions,
	): Promise<ArgType[K]> {
		const result = await this.restResult(type, options);
		return result.unwrapRaw();
	}

	/**
	 * Resolve consecutive arguments until input ends, the count is reached, or resolution fails.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings and optional times limit.
	 * @returns Parsed values; a failure before the first value returns Err. Later failures stop with the values collected so
	 * far.
	 */
	public async repeatResult<T>(
		type: IArgument<T>,
		options?: RepeatArgOptions,
	): Promise<ArrayResultType<T>>;
	/**
	 * Resolve consecutive arguments until input ends, the count is reached, or resolution fails.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings and optional times limit.
	 * @returns Parsed values; a failure before the first value returns Err. Later failures stop with the values collected so
	 * far.
	 */
	public async repeatResult<K extends keyof ArgType>(
		type: K,
		options?: RepeatArgOptions,
	): Promise<ArrayResultType<ArgType[K]>>;
	/**
	 * Resolve consecutive arguments until input ends, the count is reached, or resolution fails.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings and optional times limit.
	 * @returns Parsed values; a failure before the first value returns Err. Later failures stop with the values collected so
	 * far.
	 */
	public async repeatResult<K extends keyof ArgType>(
		type: K,
		options: RepeatArgOptions = {},
	): Promise<ArrayResultType<ArgType[K]>> {
		const argument = this.resolveArgument(type);
		if (!argument) return this.unavailableArgument(type);
		if (this.parser.finished) return this.missingArguments();

		const output: ArgType[K][] = [];

		for (let i = 0, times = options.times ?? Infinity; i < times; i++) {
			const result = await this.parser.singleParseAsync(async (arg) =>
				argument.run(arg, {
					args: this,
					argument,
					message: this.message,
					command: this.command,
					commandContext: this.commandContext,
					...options,
				}),
			);

			if (result.isErr()) {
				const error = result.unwrapErr();
				if (error === null) break;

				if (output.length === 0) {
					return result as Result.Err<UserError | ArgumentError<ArgType[K]>>;
				}

				break;
			}

			output.push(result.unwrap() as ArgType[K]);
		}

		return Result.ok(output);
	}

	/**
	 * Resolve consecutive arguments and return the collected values. Later parse failures stop the list without consuming the
	 * failed input.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings and optional times limit.
	 * @returns Parsed values.
	 * @throws A missing input/resolver error, the first resolution error, or a thrown resolver exception.
	 */
	public async repeat<T>(
		type: IArgument<T>,
		options?: RepeatArgOptions,
	): Promise<T[]>;
	/**
	 * Resolve consecutive arguments and return the collected values. Later parse failures stop the list without consuming the
	 * failed input.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings and optional times limit.
	 * @returns Parsed values.
	 * @throws A missing input/resolver error, the first resolution error, or a thrown resolver exception.
	 */
	public async repeat<K extends keyof ArgType>(
		type: K,
		options?: RepeatArgOptions,
	): Promise<ArgType[K][]>;
	/**
	 * Resolve consecutive arguments and return the collected values. Later parse failures stop the list without consuming the
	 * failed input.
	 * @param type - Registered argument name or resolver object.
	 * @param options - Extra resolver settings and optional times limit.
	 * @returns Parsed values.
	 * @throws A missing input/resolver error, the first resolution error, or a thrown resolver exception.
	 */
	public async repeat<K extends keyof ArgType>(
		type: K,
		options?: RepeatArgOptions,
	): Promise<ArgType[K][]> {
		const result = await this.repeatResult(type, options);
		return result.unwrapRaw();
	}

	/**
	 * Try a resolver or parsing callback, restoring the saved cursor after it resolves normally.
	 * @param type - Registered resolver, resolver object, or callback returning a Result.
	 * @returns The parsing result. Thrown callbacks/resolvers reject before cursor restoration.
	 */
	public async peekResult<T>(
		type: () => Argument.Result<T>,
	): Promise<ResultType<T>>;
	/**
	 * Try a resolver or parsing callback, restoring the saved cursor after it resolves normally.
	 * @param type - Registered resolver, resolver object, or callback returning a Result.
	 * @returns The parsing result. Thrown callbacks/resolvers reject before cursor restoration.
	 */
	public async peekResult<T>(
		type: IArgument<T>,
		options?: ArgOptions,
	): Promise<ResultType<T>>;
	/**
	 * Try a resolver or parsing callback, restoring the saved cursor after it resolves normally.
	 * @param type - Registered resolver, resolver object, or callback returning a Result.
	 * @returns The parsing result. Thrown callbacks/resolvers reject before cursor restoration.
	 */
	public async peekResult<K extends keyof ArgType>(
		type: (() => Awaitable<Argument.Result<ArgType[K]>>) | K,
		options?: ArgOptions,
	): Promise<ResultType<ArgType[K]>>;

	/**
	 * Try a resolver or parsing callback, restoring the saved cursor after it resolves normally.
	 * @param type - Registered resolver, resolver object, or callback returning a Result.
	 * @returns The parsing result. Thrown callbacks/resolvers reject before cursor restoration.
	 */
	public async peekResult<K extends keyof ArgType>(
		type: (() => Awaitable<Argument.Result<ArgType[K]>>) | K,
		options: ArgOptions = {},
	): Promise<ResultType<ArgType[K]>> {
		this.save();
		const result =
			typeof type === "function"
				? await type()
				: await this.pickResult(type, options);
		this.restore();
		return result;
	}

	/**
	 * Try a resolver or parsing callback without consuming input on normal completion.
	 * @param type - Registered resolver, resolver object, or callback returning a Result.
	 * @returns The parsed value.
	 * @throws The raw result error or any thrown resolver/callback exception.
	 */
	public async peek<T>(type: () => Argument.Result<T>): Promise<T>;
	/**
	 * Try a resolver or parsing callback without consuming input on normal completion.
	 * @param type - Registered resolver, resolver object, or callback returning a Result.
	 * @returns The parsed value.
	 * @throws The raw result error or any thrown resolver/callback exception.
	 */
	public async peek<T>(type: IArgument<T>, options?: ArgOptions): Promise<T>;
	/**
	 * Try a resolver or parsing callback without consuming input on normal completion.
	 * @param type - Registered resolver, resolver object, or callback returning a Result.
	 * @returns The parsed value.
	 * @throws The raw result error or any thrown resolver/callback exception.
	 */
	public async peek<K extends keyof ArgType>(
		type: (() => Argument.Result<ArgType[K]>) | K,
		options?: ArgOptions,
	): Promise<ArgType[K]>;
	/**
	 * Try a resolver or parsing callback without consuming input on normal completion.
	 * @param type - Registered resolver, resolver object, or callback returning a Result.
	 * @returns The parsed value.
	 * @throws The raw result error or any thrown resolver/callback exception.
	 */
	public async peek<K extends keyof ArgType>(
		type: (() => Argument.Result<ArgType[K]>) | K,
		options?: ArgOptions,
	): Promise<ArgType[K]> {
		const result = await this.peekResult(type, options);
		return result.unwrapRaw();
	}

	/**
	 * Read the next raw positional argument, optionally mapping it through a callback.
	 * @param cb - Optional mapper returning Some to consume the argument or None to leave it available.
	 * @returns Some with the raw or mapped value, or None when no value is accepted.
	 */
	public nextMaybe(): Option<string>;
	/**
	 * Read the next raw positional argument, optionally mapping it through a callback.
	 * @param cb - Optional mapper returning Some to consume the argument or None to leave it available.
	 * @returns Some with the raw or mapped value, or None when no value is accepted.
	 */
	public nextMaybe<T>(cb: ArgsNextCallback<T>): Option<T>;
	/**
	 * Read the next raw positional argument, optionally mapping it through a callback.
	 * @param cb - Optional mapper returning Some to consume the argument or None to leave it available.
	 * @returns Some with the raw or mapped value, or None when no value is accepted.
	 */
	public nextMaybe<T>(cb?: ArgsNextCallback<T>): Option<T | string> {
		return Option.from<T | string>(
			typeof cb === "function"
				? this.parser.singleMap(cb)
				: this.parser.single(),
		);
	}

	/**
	 * Read the next raw positional argument, optionally mapping it.
	 * @param cb - Optional mapper returning an Option.
	 * @returns The raw or mapped value, or null at exhaustion or when the mapper returns None, despite the narrower overload
	 * types.
	 */
	public next(): string;
	/**
	 * Read the next raw positional argument, optionally mapping it.
	 * @param cb - Optional mapper returning an Option.
	 * @returns The raw or mapped value, or null at exhaustion or when the mapper returns None, despite the narrower overload
	 * types.
	 */
	public next<T>(cb: ArgsNextCallback<T>): T;
	/**
	 * Read the next raw positional argument, optionally mapping it.
	 * @param cb - Optional mapper returning an Option.
	 * @returns The raw or mapped value, or null at exhaustion or when the mapper returns None, despite the narrower overload
	 * types.
	 */
	public next<T>(cb?: ArgsNextCallback<T>): T | string | null {
		const value = cb ? this.nextMaybe<T | string | null>(cb) : this.nextMaybe();
		return value.unwrapOr(null);
	}

	/** Check if one or more flag were given. */
	public getFlags(...keys: readonly string[]): boolean {
		return this.parser.flag(...keys);
	}

	/** Get the last value of one or more options as an {@link Option}. If you do not care about safely handling non-existing values you can use {@link Args.getOption} to get `string | null` as return type */
	public getOptionResult(...keys: readonly string[]): Option<string> {
		return this.parser.option(...keys);
	}

	/** Get the last value of one or more options. Similar to {@link Args.getOptionResult} but returns the value on success, or `null` if not. */
	public getOption(...keys: readonly string[]): string | null {
		return this.parser.option(...keys).unwrapOr(null);
	}

	/** Get all the values of one or more option. */
	public getOptionsResult(
		...keys: readonly string[]
	): Option<readonly string[]> {
		return this.parser.options(...keys);
	}

	/** Get all the values of one or more option. Similar to {@link Args.getOptionsResult} but returns the value on success, or `null` if not. */
	public getOptions(...keys: readonly string[]): readonly string[] | null {
		return this.parser.options(...keys).unwrapOr(null);
	}

	/** Saves the current state into the stack following a FILO strategy (first-in, last-out). */
	public save(): void {
		this.states.push(this.parser.save());
	}

	/** Restores the previously saved state from the stack. */
	public restore(): void {
		if (this.states.length !== 0) this.parser.restore(this.states.pop()!);
	}

	/** Whether all arguments have been consumed. */
	public get finished(): boolean {
		return this.parser.finished;
	}

	/** Defines the `JSON.stringify` override. */
	public toJSON(): ArgsJson {
		return {
			message: this.message,
			command: this.command,
			commandContext: this.commandContext,
		};
	}

	/**
	 * Create an ArgsUnavailable error result for a missing resolver.
	 * @param type - Requested resolver name or object.
	 * @returns Err with the name and invocation context.
	 */
	protected unavailableArgument<T>(
		type: string | IArgument<T>,
	): Result.Err<UserError> {
		const name = typeof type === "string" ? type : type.name;
		return Result.err(
			new UserError({
				identifier: Identifiers.ArgsUnavailable,
				message: `The argument "${name}" was not found.`,
				context: { name, ...this.toJSON() },
			}),
		);
	}

	/** Create an ArgsMissing error result with this invocation’s context. */
	protected missingArguments(): Result.Err<UserError> {
		return Result.err(
			new UserError({
				identifier: Identifiers.ArgsMissing,
				message: "There are no more arguments.",
				context: this.toJSON(),
			}),
		);
	}

	/** Resolve an argument. */
	private resolveArgument<T>(
		arg: keyof ArgType | IArgument<T>,
	): IArgument<T> | undefined {
		if (typeof arg === "object") return arg;
		return container.modules.require("arguments").get(arg as string) as
			IArgument<T> | undefined;
	}

	/** Convert a callback into a usable argument. */
	public static make<T>(cb: IArgument<T>["run"], name = ""): IArgument<T> {
		return { run: cb, name };
	}

	/** Create an {@link Ok} result. */
	public static ok<T>(value: T): Result.Ok<T> {
		return Result.ok(value);
	}

	/** Create an {@link Err} result containing an {@link ArgumentError}. */
	public static error<T>(
		options: ArgumentError.Options<T>,
	): Result.Err<ArgumentError<T>> {
		return Result.err(new ArgumentError<T>(options));
	}
}

/** Invocation metadata included in argument errors and toJSON output. */
export interface ArgsJson {
	/** Message whose arguments are being parsed. */
	message: Message<boolean>;
	/** Command being invoked. */
	command: MessageCommand;
	/** Matched prefix and command metadata. */
	commandContext: MessageCommand.RunContext;
}

/** Built-in argument names and their output types. Augment this interface to type custom argument names. */
export interface ArgType {
	/** Boolean parsed from the accepted true/false spellings. */
	boolean: boolean;
	/** Cached channel resolved by ID or mention. */
	channel: ChannelTypes;
	/** Date parsed with the JavaScript Date constructor. */
	date: Date;
	/** Fully cached direct-message channel. */
	dmChannel: DMChannel;
	/** Unicode or custom Discord emoji metadata. */
	emoji: EmojiObject;
	/** Number parsed with Number(), subject to optional bounds. */
	float: number;
	/** Cached guild category channel. */
	guildCategoryChannel: CategoryChannel;
	/** Cached guild channel of any supported type. */
	guildChannel: GuildBasedChannelTypes;
	/** Cached guild announcement channel. */
	guildNewsChannel: NewsChannel;
	/** Cached announcement thread. */
	guildNewsThreadChannel: ThreadChannel & {
		/** Discord channel type for this thread variant. */
		type: ChannelType.AnnouncementThread;
		/** Cached parent channel, or null when unavailable. */
		parent: NewsChannel | null;
	};
	/** Cached private thread. */
	guildPrivateThreadChannel: ThreadChannel & {
		/** Discord channel type for this thread variant. */
		type: ChannelType.PrivateThread;
		/** Cached parent channel, or null when unavailable. */
		parent: TextChannel | null;
	};
	/** Cached public thread. */
	guildPublicThreadChannel: ThreadChannel & {
		/** Discord channel type for this thread variant. */
		type: ChannelType.PublicThread;
		/** Cached parent channel, or null when unavailable. */
		parent: TextChannel | null;
	};
	/** Cached stage voice channel. */
	guildStageVoiceChannel: StageChannel;
	/** Cached guild text channel. */
	guildTextChannel: TextChannel;
	/** Cached guild thread of any thread type. */
	guildThreadChannel: ThreadChannel;
	/** Cached guild voice channel. */
	guildVoiceChannel: VoiceChannel;
	/** URL accepted by the URL constructor. */
	hyperlink: URL;
	/** Integer parsed with Number(), subject to optional bounds. */
	integer: number;
	/** Fetched guild member. */
	member: GuildMember;
	/** Resolved Discord message; fetching can use HTTP. */
	message: Message;
	/** Number parsed with Number(), subject to optional bounds. */
	number: number;
	/** Guild role resolved by ID, mention, or cached name. */
	role: Role;
	/** Raw argument text subject to optional length bounds. */
	string: string;
	/** Alias of the hyperlink argument. */
	url: URL;
	/** Fetched Discord user. */
	user: User;
	/** Original input text matching one configured enum value. */
	enum: string;
}

/** Extra argument context passed to a resolver. Built-in numeric, date, and string resolvers use the bounds when provided. */
export type ArgOptions = Omit<Argument.RunContext, "message" | "command">;

/** Resolver context with an optional maximum number of repeated values. */
export interface RepeatArgOptions extends ArgOptions {
	/** The maximum number of times the argument can be repeated.
	 * @default Infinity */
	times?: number;
}

/** The callback used for {@link Args.nextMaybe} and {@link Args.next}. */
export type ArgsNextCallback<T> = (value: string) => Option<T>;

/** One parsed argument or a user-facing missing/resolution error. */
export type ResultType<T> = Result<T, UserError | ArgumentError<T>>;
/** A list of parsed arguments or a user-facing missing/resolution error. */
export type ArrayResultType<T> = Result<T[], UserError | ArgumentError<T>>;
