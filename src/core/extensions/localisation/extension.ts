import type { VirelloClient } from "../../core/client/VirelloClient";
import { Extension } from "../../core/lifecycle/Extension";
import { container } from "../../core/modules/index";
import { LocaleManager } from "./index";

/** Built-in extension for translation resources and helpers. Configure it through client.options.extensions. */
export class LocaleExtension extends Extension {
	/**
	 * Register translation resources and helpers during client construction.
	 * @param client - Client being configured.
	 */
	static override setup(client: VirelloClient): void {
		container.i18n = new LocaleManager(
			client.options.extensions?.localisation || undefined,
		);
	}
	/** Initialize startup translations after modules load and before Discord login. */
	static override async beforeLogin(): Promise<void> {
		await container.i18n.init();
	}
}
