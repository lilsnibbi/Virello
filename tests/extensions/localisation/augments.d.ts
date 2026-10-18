import type { LocaleManager } from "../../../src/extensions/localisation/LocaleManager";

declare module "../../../src/core/modules/index" {
	interface Container {
		client: import("../../../src/core/client/VirelloClient").VirelloClient;
		i18n: LocaleManager;
	}
}
