/** Error thrown when unwrapping the wrong Result branch. It retains the original inner value. */
export class ResultError<E> extends Error {
	/** Original value or error from the branch that could not be unwrapped. */
	public readonly value: E;

	/**
	 * Create an unwrap failure.
	 * @param message - Explanation of the failure.
	 * @param value - Inner value or error to retain.
	 */
	public constructor(message: string, value: E) {
		super(message);
		this.value = value;
	}

	/** Runtime error class name. */
	public override get name(): string {
		return this.constructor.name;
	}
}
