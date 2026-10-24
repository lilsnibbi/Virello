import type { Argument } from "./Argument";
import type { MessageResolverOptions } from "./resolvers/message";

/** The context for the `'enum'` argument. */
export interface EnumArgumentContext extends Argument.RunContext {
	/** Allowed text values. Missing or empty lists fail with ArgumentEnumEmptyError. */
	readonly enum?: string[];
	/** Compare enum values without case when true. The original input is returned. Defaults to false. */
	readonly caseInsensitive?: boolean;
}

/** The context for the `'boolean'` argument. */
export interface BooleanArgumentContext extends Argument.RunContext {
	/** The words that resolve to `true`. Any words added to this array will be merged with the words: */
	readonly truths?: string[];
	/** The words that resolve to `false`. Any words added to this array will be merged with the words: */
	readonly falses?: string[];
}

/** The context for the `'member'` argument. */
export interface MemberArgumentContext extends Argument.RunContext {
	/** Whether to perform a fuzzy search with the given argument. This will leverage `FetchMembersOptions.query` to do the fuzzy searching.
	 * @default true */
	readonly performFuzzySearch?: boolean;
}

/** The context for the `'message'` argument. */
export type MessageArgumentContext = Omit<
	MessageResolverOptions,
	"messageOrInteraction"
> &
	Argument.RunContext;
