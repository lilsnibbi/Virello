import { AliasModuleStore } from "../../core/modules/index";
import { Argument } from "./Argument";

/** Store of named argument resolver modules and their aliases. */
export class ArgumentStore extends AliasModuleStore<Argument, "arguments"> {
	/** Create an empty argument resolver store. */
	public constructor() {
		super(Argument, { name: "arguments" });
	}
}
