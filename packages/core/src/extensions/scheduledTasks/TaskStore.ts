import { ModuleStore } from "../../core/modules/index";
import { Task } from "./Task";

/** A store for managing scheduled tasks. */
export class TaskStore extends ModuleStore<Task, "tasks"> {
	/** Loaded task modules with an interval or cron rule. */
	public readonly repeatedTasks: Task[] = [];

	/** Create an empty task store. */
	public constructor() {
		super(Task, { name: "tasks" });
	}

	/**
	 * Store a module and track its repeat rule when present. Use insert() to run load hooks.
	 * @param key - Lookup name.
	 * @param value - Task module.
	 * @returns This store.
	 */
	public override set(key: string, value: Task): this {
		if (value.interval !== null || value.pattern !== null) {
			this.repeatedTasks.push(value);
		}

		return super.set(key, value);
	}

	/**
	 * Remove a task from lookup and the repeated-module list. Use unload() for cleanup.
	 * @param key - Lookup name.
	 * @returns Whether a lookup entry existed.
	 */
	public override delete(key: string): boolean {
		const index = this.repeatedTasks.findIndex((task) => task.name === key);

		// If the scheduled task was found, remove it
		if (index !== -1) this.repeatedTasks.splice(index, 1);

		return super.delete(key);
	}

	/** Clear lookup entries and repeated-module tracking. Use unloadAll() for cleanup. */
	public override clear(): void {
		this.repeatedTasks.length = 0;
		super.clear();
	}
}
