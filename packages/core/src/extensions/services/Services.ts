import { container } from "../../core/modules/index";
import { ServiceStore } from "./ServiceStore";

/** Shared service modules. Use get() so names cannot overwrite framework methods. */
export class Services {
	/** Service module store registered by the services extension. */
	readonly store = new ServiceStore();
	/** Create a service lookup and assign it to container.services. */
	constructor() {
		container.services = this;
	}
	/**
	 * Look up a loaded service by name.
	 * @param name - Registered service name.
	 * @returns The service, or undefined.
	 */
	get(name: string) {
		return this.store.get(name);
	}
}
