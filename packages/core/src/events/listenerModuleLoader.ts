import { ModuleLoader } from "../core/modules/index";
import type { Listener } from "./listener";
import type { ListenerStore } from "./listenerStore";

/** Module loader that attaches listener callbacks during activation and removes them during cleanup. */
export class ListenerModuleLoader extends ModuleLoader<Listener> {
	/**
	 * Attach the listener’s callback and adjust a finite emitter listener limit.
	 * @param _store - Owning listener store.
	 * @param module - Listener being activated.
	 */
	public override onLoad(_store: ListenerStore, module: Listener) {
		const listenerCallback = module["_listener"];
		if (listenerCallback) {
			const emitter = module.emitter!;

			// Increment the maximum amount of listeners by one:
			const maxListeners = emitter.getMaxListeners();
			if (maxListeners !== 0) emitter.setMaxListeners(maxListeners + 1);

			emitter[module.once ? "once" : "on"](module.event, listenerCallback);
		}
	}

	/**
	 * Detach the listener’s callback and restore the finite listener limit.
	 * @param _store - Owning listener store.
	 * @param module - Listener being removed.
	 */
	public override onUnload(_store: ListenerStore, module: Listener) {
		const listenerCallback = module["_listener"];
		if (listenerCallback) {
			const emitter = module.emitter!;

			// Increment the maximum amount of listeners by one:
			const maxListeners = emitter.getMaxListeners();
			if (maxListeners !== 0) emitter.setMaxListeners(maxListeners - 1);

			emitter.off(module.event, listenerCallback);
		}
	}
}
