/** Error thrown when a missing Option value is unwrapped. */
export class OptionError extends Error {
	/** Runtime error class name. */
	public override get name(): string {
		return this.constructor.name;
	}
}
