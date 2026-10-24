/** The four methods Virello uses. Existing logger instances stay untouched. */
export interface LoggerLike {
	/**
	 * Write diagnostic detail.
	 * @param value - Log value.
	 * @returns The logger’s own result; Virello ignores it.
	 */
	debug(value: unknown): unknown;
	/**
	 * Write an informational notice.
	 * @param value - Log value.
	 * @returns The logger’s own result; Virello ignores it.
	 */
	notif(value: unknown): unknown;
	/**
	 * Write a warning.
	 * @param value - Log value.
	 * @returns The logger’s own result; Virello ignores it.
	 */
	alert(value: unknown): unknown;
	/**
	 * Write a failure.
	 * @param value - Log value, usually an Error.
	 * @returns The logger’s own result; Virello ignores it.
	 */
	error(value: unknown): unknown;
}
