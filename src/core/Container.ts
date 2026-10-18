import type { acquire } from "../commands/registration/registries";
import type { LocaleManager } from "../extensions/localisation/LocaleManager";
import type { TaskScheduler } from "../extensions/scheduledTasks/TaskScheduler";
import type { Services } from "../extensions/services/Services";
import type { ShardLink } from "../sharding/client/Link";
import type { VirelloClient } from "./client/VirelloClient";
import type { LoggerLike } from "./logging/LoggerLike";
import { ModuleRegistry } from "./modules/ModuleRegistry";

/** Shared client services. Add your own properties by augmenting virello. */
export interface Container {
	/** The current module registry; initialized even before a client is created. */
	modules: ModuleRegistry;
	/** The active VirelloClient. Available after construction and removed on shutdown. */
	client: VirelloClient;
	/** The active client's shard messaging and live stats API. */
	readonly sharding: ShardLink;
	/** The active client’s logger. Assigned during client construction. */
	logger: LoggerLike;
	/** Access to named application command registries. */
	applicationCommandRegistries: {
		/** Get the registry for a command name, creating it when needed. */
		acquire: typeof acquire;
	};
	/** Locale manager, present while the localisation extension is enabled. */
	i18n: LocaleManager;
	/** Task scheduler, present while the scheduledtasks extension is enabled. */
	tasks: TaskScheduler;
	/** Service lookup, present while the services extension is enabled. */
	services: Services;
}

/** Shared framework services. Client-specific entries are populated by VirelloClient and enabled extensions. */
export const container = {
	/** Initial shared registry, replaced by the active client’s module registry. */
	modules: new ModuleRegistry(),
	/** Active client’s shard messaging and live stats API. Access requires an active client. */
	get sharding(): ShardLink {
		return this.client.sharding;
	},
} as Container;
