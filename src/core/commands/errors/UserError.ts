/** The UserError class to be emitted in the pieces. @property name This will be `'UserError'` and can be used to distinguish the type of error when any error gets thrown */
export class UserError extends Error {
	/** An identifier, useful to localize emitted errors. */
	public readonly identifier: string;

	/** User-provided context. */
	public readonly context: unknown;

	/**
	 * Create a user-facing command failure.
	 * @param options - Identifier, message, context, and any source metadata.
	 */
	public constructor(options: UserError.Options) {
		super(options.message);
		this.identifier = options.identifier;
		this.context = options.context ?? null;
	}

	/** The error name, UserError. */
	public override get name(): string {
		return "UserError";
	}
}

/** Types and helpers for {@link UserError}. */
export declare namespace UserError {
	/** The options for {@link UserError}. */
	export interface Options {
		/** The identifier for this error. */
		identifier: string;

		/** The message to be passed to the Error constructor. */
		message?: string;

		/** The extra context to provide more information about this error.
		 * @default null */
		context?: unknown;
	}
}
