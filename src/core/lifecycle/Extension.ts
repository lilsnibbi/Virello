import type { Awaitable } from "../../utilities/index";
import type { VirelloClient } from "../client/VirelloClient";

/** Base class for client features. Override static hooks; Virello uses the class without constructing it. */
export abstract class Extension {
	/** Fail client startup when a hook fails if true. Otherwise disable this feature and clean up its registrations. Defaults to false. */
	static readonly critical: boolean = false;
	/**
	 * Register stores, modules, and resources synchronously during client construction.
	 * @param _client - Client being configured. Use addDisposer for owned resources.
	 */
	static setup(_client: VirelloClient): void {}
	/**
	 * Prepare services after modules and managed sharding load, before Discord login. Hooks run in extension order.
	 * @param _client - Client being started.
	 * @returns Completion of this phase.
	 */
	static beforeLogin(_client: VirelloClient): Awaitable<void> {}
	/**
	 * Start work after Discord login finishes. Hooks run in extension order.
	 * @param _client - Connected client.
	 * @returns Completion of this phase.
	 */
	static afterLogin(_client: VirelloClient): Awaitable<void> {}
}
