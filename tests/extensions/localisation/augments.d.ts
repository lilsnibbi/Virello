import type { LocaleManager } from "../../../packages/core/src/extensions/localisation/LocaleManager";

declare module "../../../packages/core/src/core/modules/index" {
	interface Container {
		client: import("../../../packages/core/src/core/client/VirelloClient").VirelloClient;
		i18n: LocaleManager;
	}
}
