import type { VirelloClient } from "../../core/client/VirelloClient";
import { Extension } from "../../core/lifecycle/Extension";
import { Services } from "./index";
/** Built-in extension for shared service modules. Configure it through client.options.extensions. */
export class ServicesExtension extends Extension {
	/**
	 * Register shared service modules during client construction.
	 * @param client - Client being configured.
	 */
	static override setup(client: VirelloClient): void {
		client.services = new Services();
		client.modules.register(client.services.store);
	}
}
