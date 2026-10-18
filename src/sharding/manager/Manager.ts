// Modified host-supervision design from discord-sharding. Apache-2.0; see ../LICENSE.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "@lilsnibbi/logger";
import { type } from "arktype";
import { createConsoleLogger } from "../../core/logging/console";
import { writeEvent } from "../../core/logging/diagnostics";
import { ShardMessenger } from "../messaging";
import { Availability } from "../transport/availability";
import { Pending } from "../transport/pending";
import {
	decode,
	encode,
	type Frame,
	failure,
	frame,
	identifier,
	type Limits,
	limits,
	loopback,
	sendSocket,
	timeout,
	validateToken,
} from "../transport/protocol";
import { type NativeSocket, Socket } from "../transport/socket";
import {
	type ShardCallOptions,
	ShardError,
	type ShardManagerOptions,
	type ShardProcessStatus,
} from "../types";

interface Child {
	slot: number;
	preferred: number;
	shard: number | null;
	generation: string;
	process: Bun.Subprocess;
	status: ShardProcessStatus;
	started: number;
	lastSeen: number;
	intentional: boolean;
	ready: boolean;
	requests: Map<string, AbortController>;
	controls: Pending;
	reconciled: boolean;
	reconciling?: Promise<void>;
	outage?: ReturnType<typeof setTimeout>;
	stop?: Promise<void>;
	startup?: ReturnType<typeof setTimeout>;
}
interface Inbound {
	child: Child;
	timer: ReturnType<typeof setTimeout>;
}

/** Runs on each deployment host; owns only the Bun children it spawns. */
export class ShardManager extends ShardMessenger {
	private readonly options: ShardManagerOptions;
	private readonly instance: string = crypto.randomUUID();
	private policy: Limits = limits();
	private count = 0;
	private socket?: NativeSocket;
	private connected = false;
	private draining = false;
	private transition?: {
		id: string;
		socket: NativeSocket;
		done: Promise<void>;
		applied: boolean;
	};
	private closed = false;
	private readonly lifecycle = new AbortController();
	private readonly children = new Map<number, Child>();
	private readonly statuses = new Map<number, ShardProcessStatus>();
	private readonly restarts = new Map<number, ReturnType<typeof setTimeout>>();
	private readonly inbound = new Map<string, Inbound>();
	private requests = new Pending(256);
	private readonly availability = new Availability();
	private readonly releases = new Set<string>();
	private releasing?: Promise<void>;
	private heartbeat?: ReturnType<typeof setInterval>;
	private loop?: Promise<void>;
	private startPromise?: Promise<void>;
	private closePromise?: Promise<void>;
	private wake?: () => void;
	private finishConnection?: () => void;
	private ownedLogger?: Logger;
	private readonly recovery: {
		maxRestarts: number;
		initialDelayMs: number;
		maxDelayMs: number;
		stableAfterMs: number;
	};
	private readonly reconnect: { initialDelayMs: number; maxDelayMs: number };
	private readonly startupMs: number;
	private readonly shutdownMs: number;
	private readonly identifyMs: number;
	private readonly pollMs: number;
	private readonly disconnectedMs: number;
	private get logger() {
		return this.options.logger ?? (this.ownedLogger ??= createConsoleLogger());
	}
	/**
	 * Validate host credentials, transport settings, and the local child entrypoint. Connections start at start().
	 * @param options - Local supervisor and coordinator settings.
	 * @throws For invalid IDs, secrets, URLs, script extensions, or recovery settings.
	 */
	public constructor(options: ShardManagerOptions) {
		super();
		type({
			"restart?": type({
				"maxRestarts?": "number",
				"initialDelayMs?": "number",
				"maxDelayMs?": "number",
				"stableAfterMs?": "number",
				"+": "reject",
			}).or("false"),
			"reconnect?": type({
				"initialDelayMs?": "number",
				"maxDelayMs?": "number",
				"+": "reject",
			}).or("false"),
			"args?": "string[]",
			"cwd?": "string",
		}).assert(options);
		identifier.assert(options.id);
		validateToken(options.token);
		const url = new URL(options.url);
		if (
			!["ws:", "wss:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.pathname !== "/sharding"
		)
			throw new TypeError(
				"Use a ws(s)://host:port/sharding URL without credentials or query.",
			);
		if (url.protocol === "ws:" && !loopback(url.hostname))
			throw new TypeError("Remote hosts require wss://.");
		const script =
			options.script instanceof URL
				? fileURLToPath(options.script)
				: options.script;
		if (!script.endsWith(".ts"))
			throw new TypeError("Shard script must be a .ts entrypoint.");
		this.options = {
			...options,
			script: resolve(options.cwd ?? process.cwd(), script),
			args: [...(options.args ?? [])],
			env: { ...options.env },
		};
		this.recovery = {
			maxRestarts: 5,
			initialDelayMs: 1000,
			maxDelayMs: 30000,
			stableAfterMs: 60000,
			...(options.restart || {}),
		};
		this.reconnect = {
			initialDelayMs: 500,
			maxDelayMs: 30000,
			...(options.reconnect || {}),
		};
		if (
			!Number.isInteger(this.recovery.maxRestarts) ||
			this.recovery.maxRestarts < 0 ||
			this.recovery.maxRestarts > 100
		)
			throw new TypeError("maxRestarts must be 0..100.");
		for (const value of [
			this.recovery.initialDelayMs,
			this.recovery.maxDelayMs,
			this.recovery.stableAfterMs,
			this.reconnect.initialDelayMs,
			this.reconnect.maxDelayMs,
		])
			timeout(value);
		if (
			this.recovery.initialDelayMs < 50 ||
			this.reconnect.initialDelayMs < 50 ||
			this.recovery.maxDelayMs < this.recovery.initialDelayMs ||
			this.reconnect.maxDelayMs < this.reconnect.initialDelayMs
		)
			throw new TypeError(
				"Recovery delays must start at 50ms or more and have a valid maximum.",
			);
		this.startupMs = timeout(options.startupTimeoutMs ?? 30000);
		this.shutdownMs = timeout(options.shutdownTimeoutMs ?? 5000);
		this.identifyMs = timeout(options.identifyTimeoutMs ?? 120000);
		this.pollMs = timeout(options.assignmentPollIntervalMs ?? 30000);
		if (this.pollMs < 50)
			throw new TypeError("assignmentPollIntervalMs must be at least 50ms.");
		this.disconnectedMs = options.maxDisconnectedLifetimeMs ?? 900000;
		if (
			!Number.isSafeInteger(this.disconnectedMs) ||
			this.disconnectedMs < 1 ||
			this.disconnectedMs > 2147483647
		)
			throw new TypeError("maxDisconnectedLifetimeMs must be 1..2147483647ms.");
		if (
			options.processCount !== undefined &&
			(!Number.isInteger(options.processCount) ||
				options.processCount < 0 ||
				options.processCount > 4096)
		)
			throw new TypeError("processCount must be 0..4096.");
	}
	/** Configured Discord shard count from the latest coordinator assignment, or zero before the first assignment. */
	public override get shardCount(): number {
		return this.count;
	}
	/** Whether this host has an authenticated coordinator connection and accepted assignment. */
	public get isConnected(): boolean {
		return this.connected;
	}
	/** Copies of local process statuses, sorted by stable slot number. Inspect each state for child readiness. */
	public get processes(): readonly ShardProcessStatus[] {
		return [...this.statuses.values()]
			.sort((a, b) => a.slot - b.slot)
			.map((v) => ({ ...v }));
	}
	/**
	 * Connect and reconcile the host assignment once, then supervise local Bun children.
	 * @returns The shared promise, resolved after authenticated assignment rather than child readiness. Recoverable
	 * connection failures retry by default.
	 * @throws If closed, a fatal admission error occurs, or reconnection is disabled and startup fails.
	 */
	public start(): Promise<void> {
		if (this.closed)
			return Promise.reject(new ShardError("CLOSED", "Manager is closed."));
		if (!this.startPromise) {
			this.heartbeat = setInterval(() => this.pingChildren(), 3000);
			this.startPromise = new Promise<void>((resolveStart, rejectStart) => {
				this.loop = this.supervise(resolveStart, rejectStart);
				void this.loop.catch((error) => {
					this.closed = true;
					rejectStart(error);
					this.report(
						"Host supervisor stopped after a lifecycle failure; inspect cleanup and child-process diagnostics.",
						error,
						"supervisor_stopped",
					);
				});
			});
		}
		return this.startPromise;
	}
	private async supervise(
		resolveStart: () => void,
		rejectStart: (e: unknown) => void,
	): Promise<void> {
		let attempt = 0;
		let first = true;
		let reportedAt = -Infinity;
		while (!this.closed) {
			let welcomed = false;
			const connectedAt = performance.now();
			try {
				await this.connection(() => {
					welcomed = true;
					first = false;
					resolveStart();
				});
			} catch (error) {
				if (this.closed) break;
				let failure = error;
				let reason = "coordinator_unavailable";
				let fatal =
					this.options.reconnect === false ||
					!(
						error instanceof ShardError &&
						["CONNECT", "DISCONNECTED", "CONNECT_TIMEOUT"].includes(error.code)
					);
				if (first && !fatal) {
					try {
						reason = await this.admissionReason();
					} catch (cause) {
						if (this.closed) break;
						failure = cause;
						fatal = true;
					}
				}
				if (fatal && first) {
					rejectStart(failure);
					this.closed = true;
				}
				if (
					!this.closed &&
					(welcomed || performance.now() - reportedAt >= 30000)
				) {
					reportedAt = performance.now();
					writeEvent(this.logger, "alert", {
						component: "sharding.manager",
						event: first ? "connection_waiting" : "connection_lost",
						message: first
							? reason === "host_already_connected"
								? "This supervisor instance is still connected; waiting for its previous socket to close."
								: "Coordinator is unavailable; waiting to connect before starting any shards."
							: this.options.reconnect === false
								? "Coordinator connection ended; reconnect is disabled and local shards will stop."
								: "Coordinator connection interrupted; shards keep Discord open in maintenance while reconnecting.",
						context: { host: this.options.id, attempt: attempt + 1, reason },
						error: welcomed ? failure : undefined,
					});
				}
			}
			this.connected = false;
			this.requests.close();
			for (const timer of this.restarts.values()) clearTimeout(timer);
			this.restarts.clear();
			// Connectivity loss does not establish process death. Existing children keep their leases and gateways.
			if (this.closed || this.options.reconnect === false)
				await Promise.all(
					[...this.children.values()].map((child) => this.stopChild(child)),
				);
			if (this.closed || this.options.reconnect === false) break;
			if (welcomed && performance.now() - connectedAt >= 60000) attempt = 0;
			const delay = Math.min(
				this.reconnect.maxDelayMs,
				this.reconnect.initialDelayMs * 2 ** Math.min(attempt++, 20),
			);
			await new Promise<void>((done) => {
				const timer = setTimeout(
					() => {
						this.wake = undefined;
						done();
					},
					Math.min(
						this.reconnect.maxDelayMs,
						delay + Math.floor(Math.random() * delay * 0.2),
					),
				);
				this.wake = () => {
					clearTimeout(timer);
					this.wake = undefined;
					done();
				};
			});
		}
		if (first)
			rejectStart(
				new ShardError("CLOSED", "Manager closed before connecting."),
			);
	}
	/** A read-only authenticated probe distinguishes retryable admission races from fatal configuration failures. */
	private async admissionReason(): Promise<string> {
		let response: Response;
		try {
			response = await fetch(this.options.url.replace(/^ws/, "http"), {
				method: "HEAD",
				headers: {
					authorization: `Bearer ${this.options.token}`,
					"x-virello-worker": this.options.id,
					"x-virello-instance": this.instance,
				},
				redirect: "error",
				signal: AbortSignal.any([
					this.lifecycle.signal,
					AbortSignal.timeout(Math.min(this.startupMs, 5000)),
				]),
			});
		} catch {
			return "coordinator_unavailable";
		}
		if (response.status === 401 || response.status === 403)
			throw new ShardError(
				"AUTH",
				"Coordinator rejected host credentials; check the host ID and shared secret.",
			);
		if (
			response.status >= 400 &&
			response.status < 500 &&
			![408, 409, 425, 429].includes(response.status)
		)
			throw new ShardError(
				"CONFIG",
				"Coordinator admission endpoint is unavailable; check the URL and framework versions.",
			);
		const reason = response.headers.get("x-virello-reason");
		return reason === "host_already_connected"
			? reason
			: "coordinator_unavailable";
	}
	private connection(onWelcome: () => void): Promise<void> {
		return new Promise((resolveConnection, rejectConnection) => {
			const socket = new Socket(this.options.url, {
				perMessageDeflate: false,
				headers: {
					authorization: `Bearer ${this.options.token}`,
					"x-virello-worker": this.options.id,
					"x-virello-instance": this.instance,
				},
			});
			this.socket = socket;
			let ended = false;
			let welcome = false;
			let lastSeen = performance.now();
			const startup = setTimeout(
				() =>
					finish(
						new ShardError(
							"CONNECT_TIMEOUT",
							"Coordinator handshake timed out.",
						),
					),
				this.startupMs,
			);
			const heartbeat = setInterval(() => {
				if (!welcome) return;
				try {
					if (performance.now() - lastSeen > 15000)
						throw new ShardError(
							"DISCONNECTED",
							"Coordinator heartbeat deadline exceeded.",
						);
					this.send(frame("ping"));
				} catch (error) {
					finish(error);
				}
			}, 3000);
			const finish = (error?: unknown) => {
				if (ended) return;
				ended = true;
				this.connected = false;
				this.loseControl();
				clearTimeout(startup);
				clearInterval(heartbeat);
				socket.removeEventListener("message", onMessage);
				socket.removeEventListener("close", onClose);
				socket.removeEventListener("error", onError);
				if (this.socket === socket) {
					this.socket = undefined;
					this.finishConnection = undefined;
				}
				socket.terminate();
				if (error) rejectConnection(error);
				else resolveConnection();
			};
			const onClose = () =>
				finish(
					new ShardError(
						"DISCONNECTED",
						welcome
							? "Coordinator disconnected."
							: "Coordinator rejected connection (authentication, ownership, or availability).",
					),
				);
			const onError = () =>
				finish(
					new ShardError(
						"CONNECT",
						"Coordinator connection failed (authentication, ownership, TLS, or availability).",
					),
				);
			const onMessage = (event: MessageEvent) => {
				if (ended || this.socket !== socket) return;
				try {
					const message = decode(event.data, this.policy.maxBytes, [
						"welcome",
						"pong",
						"invoke",
						"reply",
						"cancel",
						"released",
						"drain",
						"assignment",
					]);
					lastSeen = performance.now();
					if (!welcome) {
						if (message.op !== "welcome")
							throw new ShardError("PROTOCOL", "Expected coordinator welcome.");
						const d = message.data;
						if (
							d.count > 4096 ||
							new Set(d.shards).size !== d.shards.length ||
							d.shards.some((s: number) => s >= d.count)
						)
							throw new ShardError("PROTOCOL", "Invalid assignments.");
						this.policy = limits(d.limits);
						this.requests = new Pending(this.policy.maxPending);
						this.count = d.count;
						this.draining = false;
						this.transition = undefined;
						welcome = true;
						clearTimeout(startup);
						this.connected = true;
						const desired = Math.max(
							this.options.processCount ?? 0,
							d.shards.length,
						);
						if (desired > d.capacity)
							throw new ShardError(
								"CONFIG",
								"processCount exceeds the configured host capacity.",
							);
						void this.resumeChildren(socket, desired, d.shards).catch((error) =>
							this.transitionFailed(socket, error),
						);
						writeEvent(this.logger, "notif", {
							component: "sharding.manager",
							event: "assigned",
							message:
								"Host connected to the coordinator; shard assignments received.",
							context: {
								host: this.options.id,
								shards: d.shards,
								count: d.count,
							},
						});
						onWelcome();
						return;
					}
					if (message.op === "welcome")
						throw new ShardError("PROTOCOL", "Repeated welcome.");
					if (message.op === "drain" || message.op === "assignment") {
						this.reassign(message, socket);
						return;
					}
					this.receive(message);
				} catch (error) {
					finish(error);
				}
			};
			socket.addEventListener("message", onMessage);
			socket.addEventListener("close", onClose);
			socket.addEventListener("error", onError);
			this.finishConnection = () => finish();
			if (this.closed) finish();
		});
	}
	private reassign(
		message: Frame<"drain" | "assignment">,
		socket: NativeSocket,
	): void {
		if (message.op === "drain") {
			if (this.draining)
				throw new ShardError("PROTOCOL", "A drain is already in progress.");
			this.draining = true;
			this.availability.set(false);
			for (const timer of this.restarts.values()) clearTimeout(timer);
			this.restarts.clear();
			this.requests.close(
				new ShardError("RESHARDING", "Host is draining for a new assignment."),
			);
			const done = Promise.all(
				[...this.children.values()].map((child) => this.stopChild(child)),
			).then(() => this.flushReleases());
			this.transition = { id: message.id, socket, done, applied: false };
			void done
				.then(() => {
					if (!this.closed && this.connected && this.socket === socket)
						this.send(frame("drained", message.id));
				})
				.catch((error) => this.transitionFailed(socket, error));
			return;
		}
		const transition = this.transition;
		const d = message.data;
		if (
			!transition ||
			transition.id !== message.id ||
			transition.socket !== socket ||
			transition.applied ||
			new Set(d.shards).size !== d.shards.length ||
			d.shards.some((shard: number) => shard >= d.count)
		)
			throw new ShardError("PROTOCOL", "Unexpected assignment.");
		transition.applied = true;
		// A rollback may arrive before slow children finish draining. Never overlap generations.
		void transition.done
			.then(() => {
				if (
					this.closed ||
					!this.connected ||
					this.socket !== socket ||
					this.transition !== transition
				)
					return;
				this.count = d.count;
				this.statuses.clear();
				this.requests = new Pending(this.policy.maxPending);
				this.draining = false;
				const desired = Math.max(
					this.options.processCount ?? 0,
					d.shards.length,
				);
				for (let slot = 0; slot < desired; slot++)
					this.spawn(slot, 0, d.shards[slot] ?? slot);
				this.updateAvailability();
				writeEvent(this.logger, "notif", {
					component: "sharding.manager",
					event: "reassigned",
					message:
						"Previous shard processes exited; starting the coordinator assignment.",
					context: { host: this.options.id, shards: d.shards, count: d.count },
				});
			})
			.catch((error) => this.transitionFailed(socket, error));
	}
	private transitionFailed(socket: NativeSocket, error: unknown): void {
		if (this.socket !== socket) return;
		this.report(
			"Shard reassignment failed; ending this connection before recovery.",
			error,
			"reassignment_failed",
		);
		this.finishConnection?.();
	}
	private spawn(slot: number, restarts: number, preferred = slot): void {
		// Deliberate transitions and disconnected supervisors never spawn replacements.
		if (
			!this.connected ||
			this.closed ||
			this.draining ||
			this.children.has(slot)
		)
			return;
		const generation = crypto.randomUUID();
		const status: ShardProcessStatus = {
			slot,
			shard: null,
			state: "starting",
			pid: null,
			restarts,
		};
		this.statuses.set(slot, status);
		let child: Child | undefined;
		try {
			const subprocess = Bun.spawn(
				[
					process.execPath,
					this.options.script as string,
					...this.options.args!,
				],
				{
					cwd: this.options.cwd,
					env: {
						...process.env,
						...this.options.env,
						VIRELLO_SHARD: encode(
							{
								shard: null,
								count: this.count,
								generation,
								limits: this.policy,
								identifyTimeoutMs: this.identifyMs,
								shutdownTimeoutMs: this.shutdownMs,
								assignmentPollIntervalMs: this.pollMs,
								maxDisconnectedLifetimeMs: this.disconnectedMs,
							},
							this.policy.maxBytes,
						),
					},
					stdin: "ignore",
					stdout: "inherit",
					stderr: "inherit",
					serialization: "json",
					windowsHide: true,
					ipc: (input) => {
						if (child && this.children.get(slot) === child) {
							try {
								this.fromChild(
									child,
									decode(input, this.policy.maxBytes, [
										"boot",
										"pong",
										"poll",
										"applied",
										"call",
										"result",
										"identify",
										"done",
										"cancel",
										"metrics",
									]),
								);
							} catch (error) {
								this.report(
									"Rejected a child IPC frame; stopping the shard to protect host state.",
									error,
									"ipc_rejected",
									{ slot },
								);
								child.process.kill(9);
							}
						}
					},
				},
			);
			status.pid = subprocess.pid;
			child = {
				slot,
				shard: null,
				preferred,
				generation,
				process: subprocess,
				status,
				started: performance.now(),
				lastSeen: performance.now(),
				intentional: false,
				ready: false,
				requests: new Map(),
				controls: new Pending(1),
				reconciled: false,
			};
			this.children.set(slot, child);
			this.updateAvailability();
			this.armStartup(child);
			const owned = child;
			void subprocess.exited.then(
				(code) => this.exited(owned, code),
				(error) => {
					this.report(
						"Could not confirm the shard process exit; inspect the host and process diagnostics.",
						error,
						"exit_failed",
						{
							slot,
						},
					);
					owned.status.state = "failed";
					// A rejected exit promise is not evidence of death. Keep its lease and stop replacing processes.
					void this.close().catch((cause) =>
						this.report(
							"Host cleanup could not confirm process exit.",
							cause,
							"shutdown_unconfirmed",
						),
					);
				},
			);
		} catch (error) {
			status.state = "failed";
			this.report(
				"Bun could not start the shard process; check the entrypoint and host resources.",
				error,
				"spawn_failed",
				{
					slot,
					script: this.options.script,
				},
			);
			this.recover(slot, restarts, preferred);
		}
	}
	private armStartup(child: Child): void {
		child.startup = setTimeout(() => {
			if (!child.ready && this.children.get(child.slot) === child) {
				this.report(
					"Shard did not complete its boot handshake; stopping the child process.",
					new ShardError("STARTUP_TIMEOUT", "Child startup timed out."),
					"startup_timeout",
					{ shard: child.shard },
				);
				child.process.kill(9);
			}
		}, this.startupMs);
	}
	private pingChildren(): void {
		for (const child of this.children.values()) {
			if (!child.ready || child.intentional) continue;
			if (performance.now() - child.lastSeen > 15000) child.process.kill(9);
			else this.safeChild(child, frame("ping"));
		}
	}
	private updateAvailability(): void {
		this.availability.set(
			this.connected &&
				!this.closed &&
				!this.draining &&
				[...this.children.values()].every(
					(child) => child.ready && child.reconciled && !child.intentional,
				),
		);
	}
	private armOutage(child: Child): void {
		if (child.outage || child.shard === null || child.intentional) return;
		// The child owns its graceful cutoff; the supervisor also bounds a stalled child's shutdown.
		child.outage = setTimeout(() => {
			child.outage = setTimeout(() => {
				if (this.children.get(child.slot) === child) child.process.kill(9);
			}, this.shutdownMs);
		}, this.disconnectedMs);
	}
	private loseControl(): void {
		this.availability.set(false);
		this.requests.close();
		for (const [id, entry] of this.inbound) {
			clearTimeout(entry.timer);
			this.safeChild(entry.child, frame("cancel", id));
		}
		this.inbound.clear();
		for (const child of this.children.values()) {
			child.reconciled = false;
			child.controls.close();
			if (child.shard !== null) child.status.state = "maintenance";
			this.armOutage(child);
			if (child.ready && !child.intentional)
				this.safeChild(child, frame("unavailable"));
		}
	}
	private flushReleases(): Promise<void> {
		return (this.releasing ??= (async () => {
			for (const generation of this.releases) {
				// Generation-wide confirmation also covers a lease whose successful reply was lost.
				await this.rpc(
					frame("offline", undefined, { shard: null, generation }),
					{ timeoutMs: this.shutdownMs },
				);
				this.releases.delete(generation);
			}
		})().finally(() => {
			this.releasing = undefined;
		}));
	}
	private async resumeChildren(
		socket: NativeSocket,
		desired: number,
		preferred: number[],
	): Promise<void> {
		await this.flushReleases();
		if (this.closed || !this.connected || this.socket !== socket) return;
		// Surviving processes report their own previous IDs, including IDs removed by a new total.
		for (const child of this.children.values()) this.reconcile(child);
		for (let slot = 0; slot < desired; slot++) {
			const status = this.statuses.get(slot);
			if (status?.state !== "failed")
				this.spawn(slot, status?.restarts ?? 0, preferred[slot] ?? slot);
		}
		this.updateAvailability();
	}
	private reconcile(child: Child): void {
		if (
			!this.connected ||
			this.closed ||
			this.draining ||
			!child.ready ||
			child.intentional ||
			child.reconciling
		)
			return;
		const socket = this.socket;
		const current = () =>
			this.connected &&
			!this.closed &&
			!this.draining &&
			this.socket === socket &&
			this.children.get(child.slot) === child &&
			!child.intentional;
		child.reconciling = (async () => {
			let shard: number | null;
			let count = this.count;
			let reason = "";
			try {
				const lease = (await this.rpc(
					frame("lease", undefined, {
						previous: child.shard,
						generation: child.generation,
						preferred: child.preferred,
					}),
					{ timeoutMs: this.startupMs },
				)) as { shard: number; count: number };
				if (
					!Number.isInteger(lease.shard) ||
					lease.shard < 0 ||
					!Number.isInteger(lease.count) ||
					lease.count < 1 ||
					lease.count > 4096 ||
					lease.shard >= lease.count
				)
					throw new ShardError(
						"PROTOCOL",
						"Coordinator returned an invalid shard lease.",
					);
				shard = lease.shard;
				count = lease.count;
			} catch (error) {
				if (
					!(error instanceof ShardError) ||
					!["LEASE_INVALID", "LEASE_TAKEN", "NO_CAPACITY"].includes(error.code)
				)
					throw error;
				shard = null;
				reason = error.code;
			}
			if (!current()) return;
			// Remember an accepted lease even if the connection disappears before its acknowledgement.
			if (shard !== null) {
				child.shard = shard;
				child.status.shard = shard;
				this.armOutage(child);
			}
			const assignment = frame("assign", undefined, { shard, count, reason });
			const applied = child.controls.create(assignment.id, this.startupMs);
			void applied.catch(() => {});
			this.sendChild(child, assignment);
			try {
				await applied;
			} catch (error) {
				if (error instanceof ShardError && error.code === "TIMEOUT")
					throw new ShardError(
						"RECONCILE_TIMEOUT",
						"Shard did not finish closing or configuring its Discord gateway.",
					);
				throw error;
			}
			// A rejected process has confirmed its old Discord session is closed before forgetting the ID.
			child.shard = shard;
			child.status.shard = shard;
			if (shard === null) {
				clearTimeout(child.outage);
				child.outage = undefined;
			}
			if (!current()) return;
			if (shard !== null)
				await this.rpc(
					frame("ready", undefined, { shard, generation: child.generation }),
					{ timeoutMs: this.startupMs },
				);
			if (!current()) return;
			child.reconciled = true;
			child.status.state = shard === null ? "dormant" : "running";
			clearTimeout(child.outage);
			child.outage = undefined;
			this.safeChild(child, frame("healthy", assignment.id));
			this.updateAvailability();
		})()
			.catch((error) => {
				if (
					current() &&
					error instanceof ShardError &&
					error.code === "RECONCILE_TIMEOUT"
				) {
					this.report(
						"Shard gateway reconciliation timed out; terminating the owned process for recovery.",
						error,
						"reconciliation_failed",
						{
							slot: child.slot,
							shard: child.shard,
						},
					);
					child.process.kill(9);
				}
				if (
					current() &&
					error instanceof ShardError &&
					["PROTOCOL", "OWNERSHIP"].includes(error.code)
				)
					this.transitionFailed(socket!, error);
			})
			.finally(() => {
				child.reconciling = undefined;
			});
	}
	private fromChild(child: Child, message: Frame): void {
		child.lastSeen = performance.now();
		if (child.intentional) return;
		if (message.op === "boot") {
			if (child.ready) throw new ShardError("PROTOCOL", "Duplicate boot.");
			clearTimeout(child.startup);
			child.ready = true;
			this.sendChild(
				child,
				frame("reply", message.id, { ok: true, value: null }),
			);
			this.reconcile(child);
			return;
		}
		if (!child.ready)
			throw new ShardError(
				"PROTOCOL",
				"Child must boot before sending requests.",
			);
		if (message.op === "pong") return;
		if (message.op === "applied") {
			child.controls.resolve(message.id, null);
			return;
		}
		if (message.op === "poll") {
			if (!child.reconciled || child.shard === null) this.reconcile(child);
			return;
		}
		if (message.op === "metrics") {
			if (!child.reconciled || child.shard === null || !this.connected) return;
			this.send(
				frame("metrics", message.id, {
					...message.data,
					shard: child.shard,
					generation: child.generation,
				}),
			);
			return;
		}
		if (message.op === "cancel") {
			child.requests.get(message.id)?.abort();
			return;
		}
		if (message.op === "done") {
			if (!child.reconciled || child.shard === null || !this.connected) return;
			this.send(
				frame("done", message.id, {
					shard: child.shard,
					generation: child.generation,
				}),
			);
			return;
		}
		if (message.op === "result") {
			const inbound = this.inbound.get(message.id);
			if (!inbound) return;
			if (inbound.child !== child)
				throw new ShardError(
					"PROTOCOL",
					"Child attempted another shard response.",
				);
			this.inbound.delete(message.id);
			clearTimeout(inbound.timer);
			this.send(
				frame("result", message.id, {
					shard: child.shard,
					generation: child.generation,
					result: message.data.result,
				}),
			);
			return;
		}
		if (
			!child.reconciled ||
			child.shard === null ||
			!this.connected ||
			this.draining
		) {
			this.safeChild(
				child,
				frame(
					"reply",
					message.id,
					failure(
						new ShardError(
							"DISCONNECTED",
							"Shard assignment is not reconciled.",
						),
					),
				),
			);
			return;
		}
		if (child.requests.has(message.id))
			throw new ShardError("PROTOCOL", "Duplicate child request.");
		if (child.requests.size >= this.policy.maxPending) {
			this.sendChild(
				child,
				frame(
					"reply",
					message.id,
					failure(
						new ShardError("CAPACITY", "Child request capacity reached."),
					),
				),
			);
			return;
		}
		const controller = new AbortController();
		child.requests.set(message.id, controller);
		const data =
			message.op === "call"
				? { ...message.data, source: child.shard }
				: {
						shard: child.shard,
						generation: child.generation,
						timeoutMs: this.identifyMs,
					};
		void this.rpc(frame(message.op, undefined, data), {
			timeoutMs: data.timeoutMs,
			signal: controller.signal,
		})
			.then(
				(value) => {
					if (!child.intentional)
						this.safeChild(
							child,
							frame("reply", message.id, { ok: true, value }),
						);
				},
				(error) => {
					if (!child.intentional)
						this.safeChild(child, frame("reply", message.id, failure(error)));
				},
			)
			.finally(() => child.requests.delete(message.id));
	}
	private receive(message: Frame): void {
		if (message.op === "pong") return;
		if (message.op === "released") {
			this.requests.resolve(message.id, null);
			return;
		}
		if (message.op === "reply") {
			if (message.data.ok)
				this.requests.resolve(message.id, message.data.value);
			else
				this.requests.reject(
					message.id,
					new ShardError(message.data.error.code, message.data.error.message),
				);
			return;
		}
		if (message.op === "cancel") {
			const entry = this.inbound.get(message.id);
			if (entry) {
				this.inbound.delete(message.id);
				clearTimeout(entry.timer);
				this.safeChild(entry.child, message);
			}
			return;
		}
		if (message.op === "invoke") {
			const child = [...this.children.values()].find(
				(entry) => entry.shard === message.data.target,
			);
			if (
				!child?.ready ||
				!child.reconciled ||
				child.intentional ||
				child.generation !== message.data.generation
			) {
				this.send(
					frame("result", message.id, {
						shard: message.data.target,
						generation: message.data.generation,
						result: failure(
							new ShardError(
								"UNAVAILABLE",
								"Destination child is unavailable.",
							),
						),
					}),
				);
				return;
			}
			if (this.inbound.has(message.id))
				throw new ShardError("PROTOCOL", "Duplicate invocation.");
			if (this.inbound.size >= this.policy.maxPending) {
				this.send(
					frame("result", message.id, {
						shard: child.shard,
						generation: child.generation,
						result: failure(
							new ShardError("CAPACITY", "Host handler capacity reached."),
						),
					}),
				);
				return;
			}
			timeout(message.data.timeoutMs);
			this.inbound.set(message.id, {
				child,
				timer: setTimeout(() => {
					this.inbound.delete(message.id);
					this.safeChild(child, frame("cancel", message.id));
				}, message.data.timeoutMs),
			});
			this.sendChild(child, message);
		}
	}
	/**
	 * Route a host request to a Discord shard through the coordinator.
	 * @param target - Target shard ID.
	 * @param name - Registered request name.
	 * @param payload - Plain JSON input.
	 * @param options - Deadline and cancellation settings.
	 * @returns The remote handler’s output.
	 * @throws If preparation, transport, or the remote handler fails.
	 */
	protected override async call(
		target: number,
		name: string,
		payload: unknown,
		options: ShardCallOptions,
	): Promise<unknown> {
		options = await this.prepare(options);
		if (!Number.isInteger(target) || target < 0 || target >= this.count)
			throw new ShardError("TARGET", "Shard is outside the configured range.");
		identifier.assert(name);
		return this.rpc(
			frame("call", undefined, {
				source: -1,
				target,
				name,
				payload,
				timeoutMs: timeout(options.timeoutMs ?? this.policy.timeoutMs),
			}),
			options,
		);
	}
	/**
	 * Wait for coordinator availability when requested and return the remaining operation budget.
	 * @param options - Deadline, cancellation, and wait settings.
	 * @returns Prepared call settings.
	 * @throws On closure, disconnection, exhausted wait capacity, cancellation, or timeout.
	 */
	protected override prepare(
		options: ShardCallOptions,
	): Promise<ShardCallOptions> {
		return this.availability.prepare(
			options,
			this.policy.timeoutMs,
			this.policy.maxPending - this.requests.size,
		);
	}
	private async rpc(
		message: Frame,
		options: ShardCallOptions,
	): Promise<unknown> {
		if (this.draining && message.op !== "offline")
			throw new ShardError(
				"RESHARDING",
				"Host is draining for a new assignment.",
			);
		if (!this.connected || (this.closed && message.op !== "offline"))
			throw new ShardError("DISCONNECTED", "Manager is not connected.");
		encode(message, this.policy.maxBytes);
		const pending = this.requests.create(
			message.id,
			options.timeoutMs ?? this.policy.timeoutMs,
			options.signal,
			() => {
				try {
					this.send(frame("cancel", message.id));
				} catch {
					/* Disconnect already rejects pending requests. */
				}
			},
		);
		if (this.requests.has(message.id)) {
			try {
				this.send(message);
			} catch (error) {
				this.requests.reject(message.id, error);
			}
		}
		return pending;
	}
	private send(message: Frame): void {
		if (!this.socket || !this.connected)
			throw new ShardError("DISCONNECTED", "Manager is disconnected.");
		try {
			sendSocket(this.socket, message, this.policy);
		} catch (error) {
			this.finishConnection?.();
			throw error;
		}
	}
	private sendChild(child: Child, message: Frame): void {
		child.process.send(encode(message, this.policy.maxBytes));
	}
	private safeChild(child: Child, message: Frame): void {
		try {
			this.sendChild(child, message);
		} catch {
			if (this.children.get(child.slot) === child) child.process.kill(9);
		}
	}
	private exited(child: Child, code: number): void {
		if (this.children.get(child.slot) !== child) return;
		clearTimeout(child.startup);
		clearTimeout(child.outage);
		child.controls.close();
		this.children.delete(child.slot);
		child.status.pid = null;
		for (const controller of child.requests.values()) controller.abort();
		child.requests.clear();
		for (const [id, entry] of this.inbound)
			if (entry.child === child) {
				clearTimeout(entry.timer);
				this.inbound.delete(id);
			}
		this.releases.add(child.generation);
		if (this.connected) void this.flushReleases().catch(() => {});
		child.status.state = "stopped";
		this.updateAvailability();
		if (child.intentional || this.closed) return;
		this.report(
			"Shard process ended unexpectedly; applying the configured restart policy.",
			new ShardError("CHILD_EXIT", "Applying configured restart policy."),
			"child_exited",
			{
				shard: child.shard,
				exitCode: code,
				restarts: child.status.restarts,
				restartEnabled: this.options.restart !== false,
				maxRestarts: this.recovery.maxRestarts,
			},
		);
		const attempts =
			performance.now() - child.started >= this.recovery.stableAfterMs
				? 0
				: child.status.restarts;
		this.recover(child.slot, attempts, child.preferred);
	}
	private recover(shard: number, attempts: number, preferred = shard): void {
		const status = this.statuses.get(shard)!;
		if (this.closed || this.draining) return;
		if (
			this.options.restart === false ||
			attempts >= this.recovery.maxRestarts
		) {
			status.state = "failed";
			return;
		}
		status.state = "backoff";
		status.restarts = attempts + 1;
		if (!this.connected) return;
		const delay = Math.min(
			this.recovery.maxDelayMs,
			this.recovery.initialDelayMs * 2 ** Math.min(attempts, 20),
		);
		this.restarts.set(
			shard,
			setTimeout(() => {
				this.restarts.delete(shard);
				const socket = this.socket;
				void this.flushReleases()
					.then(() => {
						if (this.socket === socket)
							this.spawn(shard, attempts + 1, preferred);
					})
					.catch((error) => {
						if (socket) this.transitionFailed(socket, error);
					});
			}, delay),
		);
	}
	private stopChild(child: Child): Promise<void> {
		child.intentional = true;
		clearTimeout(child.startup);
		clearTimeout(child.outage);
		return (child.stop ??= (async () => {
			try {
				this.sendChild(child, frame("stop"));
			} catch {
				/* Escalate only this owned process below. */
			}
			if (await this.waitExit(child, this.shutdownMs)) return;
			child.process.kill(9);
			if (!(await this.waitExit(child, this.shutdownMs)))
				throw new ShardError(
					"SHUTDOWN_TIMEOUT",
					`Could not confirm shard ${child.shard} exited; this supervisor will not spawn replacements.`,
				);
		})());
	}
	private async waitExit(child: Child, ms: number): Promise<boolean> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				child.process.exited.then(() => true),
				new Promise<false>((done) => {
					timer = setTimeout(() => done(false), ms);
				}),
			]);
		} finally {
			clearTimeout(timer);
		}
	}
	/**
	 * Stop reconnects and restarts, stop owned children, release confirmed leases, and close transport resources.
	 * @returns One shared shutdown promise. A child with unconfirmed exit cannot be safely restarted.
	 */
	public close(): Promise<void> {
		return (this.closePromise ??= this.stop());
	}
	private async stop(): Promise<void> {
		// Keep transport alive until child exits are reported and shutdown is acknowledged.
		this.closed = true;
		this.availability.close();
		this.lifecycle.abort();
		this.wake?.();
		for (const timer of this.restarts.values()) clearTimeout(timer);
		this.restarts.clear();
		try {
			await Promise.all(
				[...this.children.values()].map((child) => this.stopChild(child)),
			);
			if (this.connected) {
				await this.flushReleases();
				const message = frame("release");
				const ack = this.requests.create(message.id, this.shutdownMs);
				void ack.catch(() => {});
				try {
					this.send(message);
					await ack;
				} catch (error) {
					this.report(
						"Children have exited, but the coordinator did not acknowledge host shutdown; closing the connection.",
						error,
						"shutdown_unconfirmed",
					);
				}
			}
		} finally {
			clearInterval(this.heartbeat);
			this.finishConnection?.();
			this.requests.close();
			for (const entry of this.inbound.values()) clearTimeout(entry.timer);
			this.inbound.clear();
			await this.loop;
			await this.ownedLogger?.close();
		}
	}
	private report(
		message: string,
		error: unknown,
		event: string,
		context: Record<string, unknown> = {},
	): void {
		writeEvent(this.logger, "error", {
			component: "sharding.manager",
			event,
			message,
			error,
			context: { host: this.options.id, ...context },
		});
	}
}
