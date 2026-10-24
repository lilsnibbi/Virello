import { ModuleStore } from "../../core/modules/index";
import { Service } from "./Service";

/** Store of shared service modules. */
export class ServiceStore extends ModuleStore<Service, "services"> {
	/** Create an empty service module store. */
	public constructor() {
		super(Service, { name: "services" });
	}
}
