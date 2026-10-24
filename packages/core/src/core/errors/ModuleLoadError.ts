/** Reason a module could not be loaded or resolved. */
export enum ModuleLoadErrorType {
	/** The file exports no compatible module class. */
	EmptyModule = "EMPTY_MODULE",
	/** The requested module name is absent from its store. */
	MissingModule = "MISSING_MODULE",
	/** The supplied value is not an instance of the store’s module class. */
	IncorrectType = "INCORRECT_TYPE",
	/** The requested module store is unknown. */
	UnknownStore = "UNKNOWN_STORE",
}

/** Describes a loader error with a type for easy identification. */
export class ModuleLoadError extends Error {
	/** The type of the error that was thrown. */
	public readonly type: ModuleLoadErrorType;

	/**
	 * Create a module error.
	 * @param type - Machine-readable failure category.
	 * @param message - Explanation of the failure.
	 */
	public constructor(type: ModuleLoadErrorType, message: string) {
		super(message);
		this.type = type;
	}

	/** Error name with the module failure category appended. */
	public override get name() {
		return `${super.name} [${this.type}]`;
	}
}
