import { ModuleStore } from "../core/modules/index";
import { Listener } from "./listener";
import { ListenerModuleLoader } from "./listenerModuleLoader";

/** Listener module store using the subscription-aware loader. */
export class ListenerStore extends ModuleStore<Listener, "listeners"> {
	/** Create an empty listener store with automatic callback attachment and removal. */
	public constructor() {
		super(Listener, {
			name: "listeners",
			strategy: new ListenerModuleLoader(),
		});
	}
}
