import type { Logger, LoggerOptions } from "@lilsnibbi/logger";
import type { Snowflake } from "discord-api-types/v10";
import type { MessageContext as Message } from "../../discord/MessageContext";
import { DiscordRuntime, type DiscordRuntimeOptions } from "./DiscordRuntime";
import { ArgumentStore } from "../../commands/arguments/ArgumentStore";
// Load built-in pieces
import { loadArguments } from "../../commands/arguments/register";
import { CommandStore } from "../../commands/CommandStore";
import { PreconditionStore } from "../../commands/checks/PreconditionStore";
import { loadPreconditions } from "../../commands/checks/register";
import { BucketScope } from "../../commands/enums";
import { messageCommands } from "../../commands/message/listeners/register";
import { registerStatusListeners } from "../../commands/registration/listeners/register";
import { acquire } from "../../commands/registration/registries";
import { registerErrorListeners } from "../../events/errors/register";
import { Events } from "../../events/events";
import { InteractionHandlerStore } from "../../events/interactions/interactionHandlerStore";
import { ListenerStore } from "../../events/listenerStore";
import { registerEvents } from "../../events/register";
import { validateSchedulerOptions } from "../../extensions/scheduledTasks/timing";
import { ShardLink, shardConfig } from "../../sharding/client/Link";
import { ManagedGateway } from "../../sharding/client/gateway";
import { sampleStats } from "../../sharding/stats";
import type { Awaitable } from "../../utilities/index";
import { type ExtensionOptions, resolveExtensions } from "../config/extensions";
import { clientOptionsSchema } from "../config/options";
import { Extension } from "../lifecycle/Extension";
import { ModuleGlob, moduleRoot } from "../loading/ModuleGlob";
import { createConsoleLogger } from "../logging/console";
import { writeEvent } from "../logging/diagnostics";
import type { ConsoleLogOptions } from "../logging/format";
import type { LoggerLike } from "../logging/LoggerLike";
import { container, ModuleRegistry, ModuleStore } from "../modules/index";
import type { ModulePaths } from "../modules/ModuleRegistry";

container.applicationCommandRegistries = { acquire };

/** A prefix string, a list of prefixes, or null for mentions only. */
export type Prefix = string | readonly string[] | null;

/**
 * Choose regular prefixes for one message. Null disables regular prefixes; configured mention and regex prefixes can still
 * match.
 * @param message - Message being parsed.
 * @returns Prefixes to try, immediately or asynchronously.
 */
export type PrefixHook = (message: Message) => Awaitable<Prefix>;

/** Framework features and native Discord runtime options. */
export interface VirelloClientOptions extends DiscordRuntimeOptions {
	/** Configure built-in features and custom extensions. Built-ins run first, in the documented extension order. */
	extensions?: ExtensionOptions;
	/** Base directory for module patterns. Defaults to cwd. */
	root?: string | URL;
	/** Bun glob patterns for each module kind. No folders are scanned implicitly. */
	modules?: ModulePaths;

	/** Whether commands can be case-insensitive
	 * @default false */
	caseInsensitiveCommands?: boolean | null;

	/** Whether prefixes can be case-insensitive
	 * @default false */
	caseInsensitivePrefixes?: boolean | null;

	/** Regular message prefixes used by the default fetchPrefix hook. Defaults to null; configured mention and regex prefixes still apply. */
	defaultPrefix?: Prefix;

	/** The regex prefix, an alternative to a mention or regular prefix to allow creating natural language command messages */
	regexPrefix?: RegExp;

	/** The prefix hook, by default it is a callback function that returns {@link VirelloClientOptions.defaultPrefix}.
	 * @default () => client.options.defaultPrefix */
	fetchPrefix?: PrefixHook;

	/** Initial bot user ID, or null when omitted. The ready listener fills it from client.user if still unset. */
	id?: Snowflake;

	/** Supply your logger instance directly. Its identity and settings are preserved. */
	logger?: LoggerLike;
	/** Used only when Virello creates its own logger. */
	loggerOptions?: Partial<LoggerOptions>;
	/** Formatting for the framework-created console logger. Supplied loggers are untouched. */
	logging?: ConsoleLogOptions;

	/** Log module discovery details through debug. Defaults to false. */
	traceModules?: boolean;

	/** Log application command registration status.
	 * @default true */
	logRegistrations?: boolean;

	/** Log framework errors with the client logger.
	 * @default true */
	logErrors?: boolean;

	/** Enable message command processing.
	 * @default false */
	messageCommands?: boolean;

	/** Controls whether the bot will automatically appear to be typing when a command is accepted.
	 * @default false */
	typing?: boolean;

	/** Default command cooldown settings. Omitted settings use a user bucket, a limit of one, and no delay. */
	defaultCooldown?: CooldownOptions;
	/** Controls whether the bot has mention as a prefix disabled
	 * @default false */
	disableMentionPrefix?: boolean;

	/** Suppress command-fetch failure logs for these guild IDs, or all guilds with true. Fetching still runs. */
	preventFailedToFetchLogForGuilds?: string[] | true;
}

/** Cleanup callback awaited during rollback or shutdown. Its return value is ignored. */
type Disposer = () => Awaitable<unknown>;
interface FeatureState {
	extension: typeof Extension;
	disposers: Disposer[];
	removeModules: () => Promise<void>;
	restoreProperties: () => void;
	active: boolean;
}
const clientState: { active?: VirelloClient } = {};

/** One active Discord client owns the shared services. */
export class VirelloClient extends DiscordRuntime {
	/** Bot user ID used for mention prefixes, or null before it is known. */
	public id: Snowflake | null = null;
	/** Resolve prefixes for each message. Defaults to returning options.defaultPrefix or null. */
	public fetchPrefix: PrefixHook;
	/** The supplied logger, or a console logger owned and closed by this client. */
	public logger: LoggerLike;
	/** Registry of this client’s module stores and configured module paths. */
	public modules: ModuleRegistry;
	/** Disable mention prefixes when true. Undefined leaves them enabled. */
	public disableMentionPrefix?: boolean;
	/** Frozen extension class list, with enabled built-ins first and duplicate custom classes removed. */
	public readonly extensions: readonly (typeof Extension)[];
	/** Coordinator-routed messaging and fresh shard stats. Also available through container.sharding. */
	public readonly sharding: ShardLink;
	/**
	 * Whether the managed Gateway is deliberately suspended. Contact loss alone preserves sticky ownership and sessions.
	 */
	public maintenance = false;
	private readonly managedGateway?: ManagedGateway;
	private closePromise?: Promise<void>;
	private loginPromise?: Promise<string>;
	private startupComplete = false;
	private closed = false;
	private readonly disposers: Disposer[] = [];
	private readonly features: FeatureState[] = [];
	private readonly pendingCleanup: Promise<void>[] = [];
	private ownedLogger?: Logger;
	private currentFeature?: FeatureState;
	private phase?: Promise<void>;

	/**
	 * Create the shared client, register stores, and run synchronous extension setup. Discord connects at login.
	 * @param options - Discord client options, including intents and Virello settings.
	 * @throws If options are invalid, another VirelloClient is active, or required setup fails. Managed children reject
	 * conflicting shard options.
	 */
	public constructor(options: VirelloClientOptions) {
		clientOptionsSchema.assert(options);
		const managed = shardConfig();
		if (managed) {
			if (options.rest?.scheduler)
				throw new TypeError("ShardManager owns the fleet REST scheduler.");
			if (
				options.gateway?.shard !== undefined ||
				options.waitForIdentify !== undefined
			)
				throw new TypeError(
					"ShardManager owns shard IDs, count, strategy and identify throttling. Remove conflicting client options.",
				);
			options = {
				...options,
				gateway: {
					...options.gateway,
					shard: [managed.shard ?? 0, managed.count],
				},
			};
		}
		for (const key of [
			"shards",
			"shardCount",
			"ws",
			"partials",
			"makeCache",
			"sweepers",
			"baseUserDirectory",
			"plugins",
			"hmr",
			"api",
			"tasks",
			"i18n",
			"loadScheduledTaskErrorListeners",
			"loadSubcommandErrorListeners",
			"subcommandDefaultCooldown",
		])
			if (key in options)
				throw new TypeError(
					`Virello no longer supports "${key}". See BREAKING_CHANGES.md.`,
				);
		const extensions = resolveExtensions(options.extensions);
		if (options.extensions?.scheduledtasks)
			validateSchedulerOptions(options.extensions.scheduledtasks);
		for (const [kind, feature] of Object.entries({
			tasks: "scheduledtasks",
			patterns: "patternCommands",
			services: "services",
		} as const))
			if (
				options.modules &&
				kind in options.modules &&
				options.extensions?.[feature] === false
			)
				throw new TypeError(
					`No module store is registered for "${kind}". Enable its extension first.`,
				);
		for (const [kind, patterns] of Object.entries(options.modules ?? {})) {
			try {
				new ModuleGlob(moduleRoot(options.root), patterns);
			} catch (cause) {
				throw new TypeError(`Invalid module patterns for "${kind}".`, {
					cause,
				});
			}
		}
		if (
			options.logger !== undefined &&
			(!options.logger ||
				["debug", "notif", "alert", "error"].some(
					(key) => typeof Reflect.get(options.logger!, key) !== "function",
				))
		)
			throw new TypeError(
				"logger must provide debug, notif, alert and error methods. Pass an existing instance directly.",
			);
		if (clientState.active)
			throw new Error(
				"Only one VirelloClient can be active. Await client.destroy() before creating another.",
			);
		super(options);
		this.extensions = extensions;
		this.logger =
			options.logger ??
			(this.ownedLogger = createConsoleLogger(
				"Virello",
				options.loggerOptions,
				options.logging,
			));
		this.sharding = new ShardLink(
			managed,
			async (code, cause) => {
				if (code !== 0)
					writeEvent(this.logger, "error", {
						component: "sharding.client",
						event: "managed_shard_stopped",
						message:
							"Stopping this shard after a supervisor or gateway failure; inspect the host logs.",
						error: cause,
						context: { code },
					});
				await this.destroy();
			},
			() => ({
				ready: this.isReady(),
				applicationReady: this.startupComplete && this.isReady(),
				guilds: this.cache.guilds.size,
				gatewayState: this.gatewayState,
				...(this.gatewayFailure
					? { blockedCode: this.gatewayFailure.code }
					: {}),
			}),
			{
				maintenance: (value) => {
					this.maintenance = value;
					if (value) this.managedGateway?.suspend();
				},
				assignment: async (shard, count) => {
					await this.managedGateway?.reconcile(shard, count);
				},
				available: () => this.managedGateway?.resume(),
				released: () => this.waitForRelease(),
				block: (code) => this.blockGateway(code),
				logger: this.logger,
			},
			() => sampleStats(this),
		);
		if (managed) {
			this.options.rest = {
				...this.options.rest,
				scheduler: this.sharding.restScheduler,
			};
			this.managedGateway = new ManagedGateway(
				this,
				() => this.sharding.waitForAssignment(),
				(error) => {
					if (!this.closed) void this.sharding.terminate(error);
				},
			);
			this.options.waitForIdentify = (id, signal) =>
				this.sharding.waitForIdentify(id, signal);
			this.on("shardReady", () => this.sharding.identified());
		}
		this.modules = new ModuleRegistry();
		this.modules.onFailure = () => this.destroy();
		this.fetchPrefix =
			options.fetchPrefix ?? (() => this.options.defaultPrefix ?? null);
		this.disableMentionPrefix = options.disableMentionPrefix;
		this.id = options.id ?? null;
		clientState.active = this;
		container.client = this;
		container.modules = this.modules;
		container.logger = this.logger;
		ModuleStore.logger = options.traceModules
			? (value) =>
					writeEvent(this.logger, "debug", {
						component: "modules",
						event: "module_trace",
						message: value,
					})
			: null;
		try {
			loadArguments();
			registerEvents();
			loadPreconditions();
			this.modules
				.register(new ArgumentStore())
				.register(new CommandStore())
				.register(new InteractionHandlerStore())
				.register(new ListenerStore())
				.register(new PreconditionStore());
			if (options.logRegistrations !== false) registerStatusListeners();
			if (options.logErrors !== false) registerErrorListeners();
			if (options.messageCommands === true) messageCommands();
			for (const extension of this.extensions) this.setupFeature(extension);
			this.modules.configure(options.modules, options.root);
			this.modules.beforeLoad = async () => {
				await Promise.all(this.pendingCleanup);
				this.assertOpen();
			};
		} catch (error) {
			void this.destroy().catch((cleanup) =>
				writeEvent(this.logger, "error", {
					component: "client",
					event: "construction_cleanup_failed",
					message:
						"Startup rollback could not release all client resources; inspect the cleanup cause.",
					error: cleanup,
				}),
			);
			throw error;
		}
	}

	/**
	 * Load configured TypeScript modules once. Repeated calls share the same promise.
	 * @returns Completion of module loading, before Discord connects.
	 * @throws If the client is closed or startup cannot finish.
	 */
	public load(): Promise<void> {
		if (this.closed)
			return Promise.reject(new Error("This VirelloClient is closed."));
		return this.modules.load();
	}

	/**
	 * Load modules, connect managed sharding, run extension hooks, and log in to Discord once.
	 * @param token - Bot token, supplied explicitly; environment variables are not read by the client.
	 * @returns The login token. Repeated calls share the same promise.
	 * @throws On startup or login failure; the client is destroyed before the rejection.
	 */
	public override login(token?: string): Promise<string> {
		if (this.closed)
			return Promise.reject(new Error("This VirelloClient is closed."));
		this.loginPromise ??= this.connect(token);
		return this.loginPromise;
	}

	private async connect(token?: string): Promise<string> {
		try {
			await this.load();
			this.assertOpen();
			if (this.sharding.enabled) await this.sharding.connect();
			this.assertOpen();
			await this.runFeatures("beforeLogin");
			this.assertOpen();
			const result = this.managedGateway
				? await this.managedGateway.start(token)
				: await super.login(token);
			this.assertOpen();
			await this.runFeatures("afterLogin");
			this.assertOpen();
			this.startupComplete = true;
			return result;
		} catch (error) {
			try {
				await this.destroy();
			} catch (cleanup) {
				throw new AggregateError(
					[error, cleanup],
					"Login and cleanup failed.",
					{ cause: cleanup },
				);
			}
			throw error;
		}
	}

	/**
	 * Register cleanup for the current extension, or the client outside a hook. Cleanup runs in reverse order.
	 * @param dispose - Callback awaited during rollback or shutdown. Its result is ignored.
	 * @throws If this client is closed.
	 */
	public addDisposer(dispose: Disposer): void {
		this.assertOpen();
		(this.currentFeature?.disposers ?? this.disposers).push(dispose);
	}

	private setupFeature(extension: typeof Extension): void {
		const finishRegistration = this.modules.trackRegistrations();
		const objects = [this, container];
		const before = objects.map((object) =>
			Object.getOwnPropertyDescriptors(object),
		);
		const state: FeatureState = {
			extension,
			active: true,
			disposers: [],
			removeModules: async () => {},
			restoreProperties: () => {},
		};
		this.features.push(state);
		this.currentFeature = state;
		let failure: unknown;
		let failed = false;
		try {
			extension.setup(this);
			this.emit(Events.ExtensionLoaded, "setup", extension.name);
		} catch (error) {
			failure = error;
			failed = true;
		} finally {
			this.currentFeature = undefined;
			state.removeModules = finishRegistration();
			const after = objects.map((object) =>
				Object.getOwnPropertyDescriptors(object),
			);
			state.restoreProperties = () =>
				objects.forEach((object, index) => {
					for (const key of Reflect.ownKeys(after[index])) {
						const previous = Reflect.get(before[index], key) as
							PropertyDescriptor | undefined;
						const assigned = Reflect.get(
							after[index],
							key,
						) as PropertyDescriptor;
						const current = Object.getOwnPropertyDescriptor(object, key);
						if (
							!current ||
							current.value !== assigned.value ||
							current.get !== assigned.get ||
							current.set !== assigned.set
						)
							continue;
						if (previous) Object.defineProperty(object, key, previous);
						else Reflect.deleteProperty(object, key);
					}
				});
		}
		if (failed) {
			writeEvent(this.logger, "error", {
				component: "extensions",
				event: "setup_failed",
				message: extension.critical
					? "Required extension setup failed; client startup cannot continue."
					: "Optional extension setup failed; disabling it and removing its registrations.",
				error: failure,
				context: { extension: extension.name, critical: !!extension.critical },
			});
			const cleanup = this.disableFeature(state);
			this.pendingCleanup.push(cleanup);
			void cleanup.catch(() => {});
			if (extension.critical)
				throw new Error(`Required extension ${extension.name} failed.`, {
					cause: failure,
				});
		}
	}

	private async runFeatures(
		phase: "beforeLogin" | "afterLogin",
	): Promise<void> {
		for (const state of this.features) {
			if (!state.active) continue;
			this.assertOpen();
			this.currentFeature = state;
			try {
				this.phase = Promise.resolve().then(() => state.extension[phase](this));
				await this.phase;
				this.emit(Events.ExtensionLoaded, phase, state.extension.name);
			} catch (cause) {
				writeEvent(this.logger, "error", {
					component: "extensions",
					event: "hook_failed",
					message: state.extension.critical
						? "Required extension login hook failed; client startup cannot continue."
						: "Optional extension login hook failed; disabling it and releasing its resources.",
					error: cause,
					context: {
						extension: state.extension.name,
						phase,
						critical: !!state.extension.critical,
					},
				});
				await this.disableFeature(state);
				if (state.extension.critical)
					throw new Error(
						`Required extension ${state.extension.name} failed during ${phase}.`,
						{ cause },
					);
			} finally {
				this.currentFeature = undefined;
				this.phase = undefined;
			}
		}
	}

	private async disableFeature(state: FeatureState): Promise<void> {
		state.active = false;
		const errors: unknown[] = [];
		for (const dispose of state.disposers.splice(0).reverse())
			try {
				await dispose();
			} catch (error) {
				errors.push(error);
			}
		try {
			await state.removeModules();
		} catch (error) {
			errors.push(error);
		}
		state.restoreProperties();
		if (errors.length)
			throw new AggregateError(
				errors,
				`Could not clean up extension ${state.extension.name}.`,
			);
	}

	/**
	 * Close sharding, await active hooks, release resources, unload modules, and disconnect Discord.
	 * @returns One shared shutdown promise. Supplied logger instances are left open.
	 * @throws An AggregateError after cleanup if any resource could not close.
	 */
	public override destroy(): Promise<void> {
		this.closed = true;
		this.managedGateway?.stop();
		this.closePromise ??= this.close();
		return this.closePromise;
	}

	private async close(): Promise<void> {
		const errors: unknown[] = [];
		try {
			await this.sharding.close();
		} catch (error) {
			errors.push(error);
		}
		await this.phase?.catch(() => {});
		for (const result of await Promise.allSettled(this.pendingCleanup))
			if (result.status === "rejected") errors.push(result.reason);
		// Close producers before unloading the modules they call.
		const disposers = [
			...this.disposers.splice(0),
			...this.features.flatMap((state) => state.disposers.splice(0)),
		];
		for (const dispose of disposers.reverse())
			try {
				await dispose();
			} catch (error) {
				errors.push(error);
			}
		await this.modules.idle();
		for (const result of await Promise.allSettled(
			[...this.modules.values()].map((store) => store.unloadAll()),
		))
			if (result.status === "rejected") errors.push(result.reason);
		try {
			await super.destroy();
		} catch (error) {
			errors.push(error);
		}
		try {
			await this.ownedLogger?.close();
		} catch (error) {
			errors.push(error);
		}
		if (container.client === this) {
			for (const key of ["client", "i18n", "tasks", "services"] as const)
				Reflect.deleteProperty(container, key);
			ModuleStore.logger = null;
		}
		if (clientState.active === this) clientState.active = undefined;
		if (errors.length)
			throw new AggregateError(
				errors,
				"Some Virello features could not close.",
			);
	}

	private assertOpen(): void {
		if (this.closed) throw new Error("This VirelloClient is closed.");
	}
}

/** Defaults used when commands build their cooldown preconditions. */
export interface CooldownOptions {
	/** Bucket key scope. Defaults to BucketScope.User. */
	scope?: BucketScope;
	/** Time in milliseconds before a bucket resets. Defaults to 0, which disables cooldowns. */
	delay?: number;
	/** Uses allowed in one bucket. Defaults to 1. */
	limit?: number;
	/** User IDs exempt from cooldowns. Defaults to an empty list. */
	filteredUsers?: Snowflake[];
	/** Command names exempt from the default cooldown. Defaults to an empty list. */
	filteredCommands?: string[];
}
