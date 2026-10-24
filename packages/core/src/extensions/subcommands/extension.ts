import type { VirelloClient } from "../../core/client/VirelloClient";
import { Extension } from "../../core/lifecycle/Extension";
import { loadListeners, loadPreconditions } from "./index";
/** Built-in extension for subcommand dispatch and checks. Configure it through client.options.extensions. */
export class SubcommandsExtension extends Extension {
	/**
	 * Register subcommand dispatch and checks during client construction.
	 * @param client - Client being configured.
	 */
	static override setup(client: VirelloClient): void {
		loadPreconditions();
		const options = client.options.extensions?.subcommands;
		if (options !== false && options?.logErrors !== false) loadListeners();
	}
}
