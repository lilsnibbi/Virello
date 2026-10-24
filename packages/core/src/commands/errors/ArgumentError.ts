import type { IArgument } from "../arguments/Argument";
import { UserError } from "./UserError";

/** Errors thrown by the argument parser */
export class ArgumentError<T = unknown> extends UserError {
	/** Resolver that rejected the input. */
	public readonly argument: IArgument<T>;
	/** Original argument text that failed resolution. */
	public readonly parameter: string;

	/**
	 * Create a resolver failure.
	 * @param options - Identifier, message, context, and any source metadata.
	 */
	public constructor(options: ArgumentError.Options<T>) {
		super({
			...options,
			identifier: options.identifier ?? options.argument.name,
		});
		this.argument = options.argument;
		this.parameter = options.parameter;
	}

	/** The error name, ArgumentError. */
	public override get name(): string {
		return "ArgumentError";
	}
}

/** Types and helpers for {@link ArgumentError}. */
export declare namespace ArgumentError {
	/** The options for {@link ArgumentError}. */
	export interface Options<T> extends Omit<UserError.Options, "identifier"> {
		/** The argument that caused the error. */
		argument: IArgument<T>;

		/** The parameter that failed to be parsed. */
		parameter: string;

		/** The identifier.
		 * @default argument.name */
		identifier?: string;
	}
}
