import type { ApplicationCommandRegistry } from "./Registry";
import {
	acquire,
	getBulkOverwriteRetries,
	getDefaultBehaviorWhenNotIdentical,
	getDefaultGuildIds,
	registries,
	setBulkOverwriteRetries,
	setDefaultBehaviorWhenNotIdentical,
	setDefaultGuildIds,
} from "./registries";

/** Shared application command registries and registration defaults. */
export const ApplicationCommandRegistries = {
	/** Get the registry for a command name, creating it when absent. Returns the same registry for later calls with that name. */
	acquire,
	/** Set the shared update behavior. Omit or pass null to reset to RegisterBehavior.Overwrite. */
	setDefaultBehaviorWhenNotIdentical,
	/** Set fallback guild IDs for registrations without a nonempty guild list. Omit or pass null to reset to global scope. */
	setDefaultGuildIds,
	/** Set the positive maximum attempt count used for bulk overwrites. Null resets it to 1; values at or below 0 throw RangeError. */
	setBulkOverwriteRetries,
	/** Return the shared fallback guild ID array, or undefined for global scope. */
	getDefaultGuildIds,
	/** Return the shared update behavior. Initially RegisterBehavior.Overwrite. */
	getDefaultBehaviorWhenNotIdentical,
	/** Return the configured maximum bulk-overwrite attempt count. Initially 1. */
	getBulkOverwriteRetries,
	/** Read-only view of the live registry map, keyed by local command name. */
	get registries(): ReadonlyMap<string, ApplicationCommandRegistry> {
		return registries;
	},
};
