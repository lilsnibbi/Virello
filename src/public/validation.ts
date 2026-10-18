/**
 * ArkType schema creation, validation errors, and schema types re-exported by this entry point.
 * @packageDocumentation
 */
import "../core/runtime";

export {
	/** Validation failures returned by an ArkType schema. */
	ArkErrors,
	/** An ArkType schema and its inferred input/output types. */
	type Type,
	/** Create an ArkType schema from a supported definition. */
	type,
} from "arktype";
