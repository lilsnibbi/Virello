import type { EventEmitter } from "node:events";
import type { VirelloClient as Client } from "../core/client/VirelloClient";
import type { ClientEvents } from "./events";
import { Module } from "../core/modules/index";
import { Result } from "../utilities/result/index";
import { Events } from "./events";

/** Extend this class to handle an event from an emitter. */
export abstract class Listener<
	E extends keyof ClientEvents | symbol = "",
	Options extends Listener.Options = Listener.Options,
> extends Module<Options, "listeners"> {
	/** Optional listener metadata passed as constructor options by the loader. */
	public static override readonly options?: Listener.Options;
	/** The emitter, if any. */
	public readonly emitter: EventEmitter | null;

	/** The name of the event the listener listens to. */
	public readonly event: string | symbol;

	/** Whether the listener will be unloaded after the first run. */
	public readonly once: boolean;

	private _listener: ((...args: unknown[]) => void) | null;

	/**
	 * Select an emitter, event, and once behavior without attaching the callback yet.
	 * @param context - Loader metadata and listener store.
	 * @param options - Listener settings. Missing emitters or empty event names disable the module.
	 */
	public constructor(
		context: Listener.Context,
		options: Options = {} as Options,
	) {
		super(context, options);

		this.emitter =
			typeof options.emitter === "undefined"
				? this.container.client
				: ((typeof options.emitter === "string"
						? (Reflect.get(
								this.container.client,
								options.emitter,
							) as unknown as EventEmitter)
						: (options.emitter as EventEmitter)) ?? null);
		this.event = options.event ?? this.name;
		this.once = options.once ?? false;

		this._listener =
			this.emitter && this.event
				? this.once
					? this._runOnce.bind(this)
					: this._run.bind(this)
				: null;

		// If there's no emitter or no listener, disable:
		if (this.emitter === null || this._listener === null) this.enabled = false;
	}

	/**
	 * Handle the event arguments. Async results are awaited; thrown or rejected work emits ListenerError.
	 * @param args - Arguments defined by ClientEvents for this event.
	 * @returns Any result; its value is ignored.
	 */
	public abstract run(
		...args: E extends keyof ClientEvents ? ClientEvents[E] : unknown[]
	): unknown;

	/** Return module metadata with the event name and once flag. */
	public override toJSON(): ListenerJSON {
		return {
			...super.toJSON(),
			once: this.once,
			event: this.event,
		};
	}

	private async _run(...args: unknown[]) {
		const result = await Result.fromAsync(() =>
			this.run(
				...(args as E extends keyof ClientEvents ? ClientEvents[E] : unknown[]),
			),
		);
		result.inspectErr((error) =>
			this.container.client.emit(Events.ListenerError, error, { module: this }),
		);
	}

	private async _runOnce(...args: unknown[]) {
		await this._run(...args);
		await this.unload();
	}
}

/** Emitter and subscription settings for a listener module. */
export interface ListenerOptions extends Module.Options {
	/** Emitter instance or client property name. Defaults to the active client. */
	readonly emitter?: keyof Client | EventEmitter;
	/** Event name or symbol. Defaults to the module name. */
	readonly event?: string | symbol;
	/** Handle only the next event, then unload. Defaults to false. */
	readonly once?: boolean;
}

/** Serialized listener metadata. */
export interface ListenerJSON extends Module.JSON {
	/** Event name or symbol used by the listener. */
	event: string | symbol;
	/** Whether the listener handles just one event. */
	once: boolean;
}

/** Types and helpers for {@link Listener}. */
export declare namespace Listener {
	/** Shorthand for {@link ListenerOptions}. */
	export type Options = ListenerOptions;
	/** Shorthand for {@link ListenerJSON}. */
	export type JSON = ListenerJSON;
	/** Shorthand for {@link Module.Context}. */
	export type Context = Module.Context<"listeners">;
}
