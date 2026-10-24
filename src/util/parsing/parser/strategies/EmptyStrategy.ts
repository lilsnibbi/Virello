import { Option } from "../../../result/index";
import type { IUnorderedStrategy } from "./IUnorderedStrategy";

/** Strategy that recognizes no flags or named options. */
export class EmptyStrategy implements IUnorderedStrategy {
	/** Always return None. */
	public matchFlag(): Option<string> {
		return Option.none;
	}

	/** Always return None. */
	public matchOption(): Option<readonly [key: string, value: string]> {
		return Option.none;
	}
}
