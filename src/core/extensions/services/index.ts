import type { Services } from "./Services";

export * from "./Service";
export * from "./ServiceStore";
export * from "./Services";

/** Add the services extension property to the framework client. */
declare module "../../core/client/VirelloClient" {
	/** Client services supplied by ServicesExtension. */
	export interface VirelloClient {
		/** Service lookup available while the services extension is enabled. */
		services: Services;
	}
}
