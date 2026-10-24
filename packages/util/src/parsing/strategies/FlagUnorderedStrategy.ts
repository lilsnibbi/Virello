import { Option } from "../../result/index";
import { PrefixedStrategy } from "../index";

/** The strategy options used in Virello. */
export interface FlagStrategyOptions {
	/** Accepted key-only flags. Use true to allow any name, or false/an empty list to disable flags. Defaults to an empty list. */
	flags?: readonly string[] | boolean;

	/** Accepted key/value option names. Use true to allow any name, or false/an empty list to disable options. Defaults to an empty list. */
	options?: readonly string[] | boolean;

	/** The prefixes for both flags and options.
	 * @default ['--', '-', '—'] */
	prefixes?: string[];

	/** The flag separators.
	 * @default ['=', ':'] */
	separators?: string[];
}

const never = () => Option.none;
const always = () => true;

export class FlagUnorderedStrategy extends PrefixedStrategy {
	public readonly flags: readonly string[] | true;
	public readonly options: readonly string[] | true;

	public constructor({
		flags,
		options,
		prefixes = ["--", "-", "—"],
		separators = ["=", ":"],
	}: FlagStrategyOptions = {}) {
		super(prefixes, separators);
		this.flags = flags || [];
		this.options = options || [];

		if (this.flags === true) this.allowedFlag = always;
		else if (this.flags.length === 0) this.matchFlag = never;

		if (this.options === true) {
			this.allowedOption = always;
		} else if (this.options.length === 0) {
			this.matchOption = never;
		}
	}

	public override matchFlag(s: string): Option<string> {
		const result = super.matchFlag(s);

		// The flag must be an allowed one.
		if (result.isSomeAnd((value) => this.allowedFlag(value))) return result;

		// If it did not match a flag, return null.
		return Option.none;
	}

	public override matchOption(
		s: string,
	): Option<readonly [key: string, value: string]> {
		const result = super.matchOption(s);

		if (result.isSomeAnd((option) => this.allowedOption(option[0])))
			return result;

		return Option.none;
	}

	private allowedFlag(s: string) {
		return (this.flags as readonly string[]).includes(s);
	}

	private allowedOption(s: string) {
		return (this.options as readonly string[]).includes(s);
	}
}
