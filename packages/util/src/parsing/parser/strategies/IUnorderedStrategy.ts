import type { Option } from "../../../result/index";

/** Recognize flag names and option key/value pairs in parameter text. None leaves the text positional. */
export interface IUnorderedStrategy {
	/** Matches a flag. */
	matchFlag(input: string): Option<string>;

	/** Matches an option. */
	matchOption(input: string): Option<readonly [key: string, value: string]>;
}
