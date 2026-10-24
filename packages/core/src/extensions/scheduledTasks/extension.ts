import type { VirelloClient } from "../../core/client/VirelloClient";
import { Extension } from "../../core/lifecycle/Extension";
import { container } from "../../core/modules/index";
import { loadListeners, TaskScheduler, TaskStore } from "./index";
/** Built-in extension for scheduled task execution. Configure it through client.options.extensions. */
export class TasksExtension extends Extension {
	/** Task startup failures stop client startup. Always true for this extension. */
	static override readonly critical = true;
	/**
	 * Register scheduled task execution during client construction.
	 * @param client - Client being configured.
	 */
	static override setup(client: VirelloClient): void {
		const options = client.options.extensions?.scheduledtasks || {};
		const tasks = new TaskScheduler(options);
		container.tasks = tasks;
		client.addDisposer(() => tasks.close());
		client.modules.register(new TaskStore());
		if (options.logErrors !== false) loadListeners();
	}
	/** Register enabled repeated task modules, connect the backend, and start polling after Discord login. */
	static override async afterLogin(): Promise<void> {
		await container.tasks.createRepeated();
		await container.tasks.start();
	}
}
