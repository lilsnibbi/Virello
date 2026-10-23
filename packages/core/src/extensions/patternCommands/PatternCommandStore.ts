import { AliasModuleStore } from "../../core/modules/index";
import { PatternCommand } from "./PatternCommand";

/** Store of regex-triggered message commands and their aliases. */
export class PatternCommandStore extends AliasModuleStore<PatternCommand> {
	/** Create an empty pattern command store. */
	public constructor() {
		super(PatternCommand, { name: "patterns" });
	}
}
