// Adapted architecture from discord-sharding, with fixed assignments and named RPC.
// Apache-2.0; see ../LICENSE and ../../../docs/source-retention.md. This is a new incompatible protocol.

import { setTimeout as wait } from "node:timers/promises";
import type { Logger } from "@lilsnibbi/logger";
import { createConsoleLogger } from "../../core/logging/console";
import { writeEvent } from "../../core/logging/diagnostics";
import type { LoggerLike } from "../../core/logging/LoggerLike";
import { safeContext } from "../../core/logging/redact";
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
	tokenMatches,
	validateToken,
} from "../transport/protocol";
import {
	type ShardCoordinatorOptions,
	ShardError,
	type ShardHost,
	type ShardScalingStatus,
	type ShardSessionLimit,
} from "../types";
import { IdentifyScheduler, identifyCooldownMs } from "./identify";
import { type ScalingPlan, ScalingPolicy } from "./scaling";

interface Session {
	host: ShardHost;
	instance: string;
	connectionId: string;
	connectedAt: number;
	socket?: Bun.ServerWebSocket<Session>;
	lastSeen: number;
	ready: Map<number, string>;
	metrics: Map<number, { ready: boolean; guilds: number; at: number }>;
	ids: Set<string>;
	released: boolean;
}
interface Lease {
	host: string;
	instance: string;
	generation: string;
}
interface Route {
	source: Session;
	sourceShard: number;
	original: string;
	destination: Session;
	shard: number;
	generation: string;
	name: string;
	startedAt: number;
	timeoutMs: number;
	timer: ReturnType<typeof setTimeout>;
}
interface Identify {
	session: Session;
	message: Frame<"identify">;
	startedAt: number;
	timer: ReturnType<typeof setTimeout>;
}
type DisconnectReason =
	| "peer_closed"
	| "protocol_rejected"
	| "heartbeat_timeout"
	| "send_failed"
	| "server_shutdown";
type Outcome = ReturnType<typeof failure> | { ok: true; value: unknown };
const inbound = [
	"ping",
	"lease",
	"ready",
	"offline",
	"call",
	"result",
	"cancel",
	"identify",
	"done",
	"release",
	"metrics",
	"drained",
] as const;

/** Single authenticated control plane. It never spawns a process on another host. */
export class ShardCoordinator {
	private readonly options: ShardCoordinatorOptions;
	private readonly policy: Limits;
	private readonly hosts = new Map<string, ShardHost>();
	private readonly assignments = new Map<number, string>();
	// Reserved until the authenticated owner confirms exit/release, or this coordinator ends.
	private readonly leases = new Map<number, Lease>();
	private readonly logSecrets: readonly string[];
	private readonly sessions = new Map<string, Session>();
	private readonly waiting = new Map<
		string,
		{ reason: string; at: number; attempts: number }
	>();
	private readonly routes = new Map<string, Route>();
	private readonly identifies = new Map<string, Identify>();
	private scheduler?: IdentifyScheduler;
	private server?: Bun.Server<Session>;
	private heartbeat?: ReturnType<typeof setInterval>;
	private startPromise?: Promise<void>;
	private closePromise?: Promise<void>;
	private closed = false;
	private refreshing = false;
	private refreshAt = 0;
	private readonly lifecycle = new AbortController();
	private refreshPromise?: Promise<void>;
	private readonly scaling?: ScalingPolicy;
	private count: number;
	private recommendation?: number;
	private scaleStatus: ShardScalingStatus;
	private scalePromise?: Promise<ShardScalingStatus>;
	private scaleTimer?: ReturnType<typeof setTimeout>;
	private transition?: {
		id: string;
		participants: Session[];
		drained: Set<Session>;
	};
	private ownedLogger?: Logger;
	private get logger() {
		return this.options.logger ?? (this.ownedLogger ??= createConsoleLogger());
	}

	/**
	 * Validate coordinator settings and initial host assignments without opening a listener.
	 * @param options - Listener, host, session, and optional scaling settings.
	 * @throws For invalid settings, incomplete or duplicate assignments, or missing session metadata.
	 */
	public constructor(options: ShardCoordinatorOptions) {
		this.count = options.shardCount;
		this.scaleStatus = {
			phase: options.scaling ? "idle" : "disabled",
			shardCount: this.count,
		};
		if (options.scaling) {
			if (!options.botToken)
				throw new TypeError(
					"Automatic scaling requires botToken for fresh gateway metadata.",
				);
			this.scaling = new ScalingPolicy(options.scaling);
		}
		if (
			!Number.isInteger(options.shardCount) ||
			options.shardCount < 1 ||
			options.shardCount > 4096
		)
			throw new TypeError("shardCount must be 1..4096.");
		if (!options.botToken && !options.sessionStartLimit)
			throw new TypeError("Provide botToken or a fresh sessionStartLimit.");
		if (options.botToken && options.sessionStartLimit)
			throw new TypeError("Choose botToken or sessionStartLimit.");
		if (!loopback(options.hostname ?? "127.0.0.1") && !options.tls)
			throw new TypeError("Non-loopback listeners require TLS.");
		if (
			options.port !== undefined &&
			(!Number.isInteger(options.port) ||
				options.port < 0 ||
				options.port > 65535)
		)
			throw new TypeError("Invalid port.");
		this.policy = limits(options.limits);
		for (const host of options.workers) {
			identifier.assert(host.id);
			validateToken(host.token);
			if (this.hosts.has(host.id))
				throw new TypeError("Worker IDs must be unique.");
			if (
				(this.scaling || host.maxShards !== undefined) &&
				(!Number.isInteger(host.maxShards) ||
					host.maxShards! < 1 ||
					host.maxShards! > 4096 ||
					host.shards.length > host.maxShards!)
			)
				throw new TypeError(
					"Host maxShards must be 1..4096 and cover initial placement; automatic hosts must specify it.",
				);
			if (
				host.weight !== undefined &&
				(!Number.isFinite(host.weight) ||
					host.weight < 0.01 ||
					host.weight > 1000)
			)
				throw new TypeError("Host weight must be 0.01..1000.");
			for (const shard of host.shards) {
				if (
					!Number.isInteger(shard) ||
					shard < 0 ||
					shard >= options.shardCount ||
					this.assignments.has(shard)
				)
					throw new TypeError("Shard assignments must be unique and in range.");
				this.assignments.set(shard, host.id);
			}
			this.hosts.set(
				host.id,
				Object.freeze({ ...host, shards: Object.freeze([...host.shards]) }),
			);
			encode(
				frame("welcome", undefined, this.welcome(host)),
				this.policy.maxBytes,
			);
		}
		if (this.assignments.size !== options.shardCount)
			throw new TypeError("Assign every shard exactly once.");
		this.options = {
			...options,
			sessionStartLimit: options.sessionStartLimit && {
				...options.sessionStartLimit,
			},
		};
		this.logSecrets = [...this.hosts.values()].map((host) => host.token);
		if (options.botToken)
			this.logSecrets = [...this.logSecrets, options.botToken];
	}
	/** Listening WebSocket endpoint, or undefined before startup and after closure. */
	public get url(): string | undefined {
		const server = this.server;
		if (!server) return undefined;
		const host = server.hostname ?? "127.0.0.1";
		return `${this.options.tls ? "wss" : "ws"}://${host.includes(":") ? `[${host}]` : host}:${server.port}/sharding`;
	}
	/** Copies of configured hosts with their connection state and currently ready shard IDs. */
	public get workers(): readonly {
		/** Configured supervisor host ID. */
		id: string;
		/** Whether an unreleased authenticated session exists for this host. */
		connected: boolean;
		/** Shard IDs currently reported ready by this host’s sessions. */
		shards: readonly number[];
	}[] {
		return [...this.hosts.values()].map((host) => ({
			id: host.id,
			connected: [...this.sessions.values()].some(
				(session) => session.host.id === host.id && !session.released,
			),
			shards: [...this.sessions.values()]
				.filter((session) => session.host.id === host.id)
				.flatMap((session) => [...session.ready.keys()]),
		}));
	}
	/** Number of routed requests and identify requests currently awaiting completion. */
	public get pendingCount(): number {
		return this.routes.size + this.identifies.size;
	}
	/** Current configured Discord shard count. */
	public get shardCount(): number {
		return this.count;
	}
	/** Copy of the latest scaling status. */
	public get scalingStatus(): ShardScalingStatus {
		return { ...this.scaleStatus };
	}
	/**
	 * Prepare fresh Discord session limits and start the authenticated WebSocket listener once.
	 * @returns The shared startup promise.
	 * @throws If closed, metadata cannot be fetched, scaling cannot fit capacity, or the listener cannot start.
	 */
	public start(): Promise<void> {
		if (this.closed)
			return Promise.reject(new ShardError("CLOSED", "Coordinator is closed."));
		return (this.startPromise ??= this.open());
	}
	private async open(): Promise<void> {
		try {
			this.activity(
				"debug",
				"starting",
				"Preparing the coordinator listener and in-memory identify scheduler.",
			);
			this.scheduler = new IdentifyScheduler();
			if (this.options.botToken) {
				this.activity(
					"notif",
					"identify_startup_wait",
					"Waiting briefly before reading fresh Discord login limits.",
					{
						delayMs: identifyCooldownMs,
					},
				);
				await wait(identifyCooldownMs, undefined, {
					signal: this.lifecycle.signal,
				});
			}
			const sessionLimit =
				this.options.sessionStartLimit ?? (await this.fetchLimit());
			this.scheduler.update(sessionLimit);
			this.logIdentifyLimits(sessionLimit);
			if (this.scaling) {
				const plan = this.scaling.plan(
					this.recommendation!,
					[...this.hosts.values()],
					this.assignments,
				);
				this.validateAssignments(plan);
				this.commitAssignments(plan);
			}
			if (this.closed)
				throw new ShardError("CLOSED", "Coordinator closed during startup.");
			this.server = Bun.serve<Session>({
				hostname: this.options.hostname ?? "127.0.0.1",
				port: this.options.port ?? 8080,
				// Independent schedulers must not share a listener or inherit hot-reloaded sessions.
				reusePort: false,
				id: null,
				tls: this.options.tls,
				development: false,
				fetch: (request, server) => this.upgrade(request, server),
				websocket: {
					maxPayloadLength: this.policy.maxBytes,
					backpressureLimit: this.policy.maxBufferedBytes,
					closeOnBackpressureLimit: true,
					perMessageDeflate: false,
					idleTimeout: 30,
					sendPings: true,
					open: (socket) => {
						socket.data.socket = socket;
						if (
							this.closed ||
							this.sessions.get(this.sessionKey(socket.data)) !== socket.data
						) {
							socket.close(1008, "Registration ended");
							return;
						}
						this.activity(
							"notif",
							"host_connected",
							"Authenticated host connected; sending its shard assignments.",
							{
								...this.connectionContext(socket.data),
								shards: socket.data.host.shards,
								assignedCount: socket.data.host.shards.length,
							},
						);
						this.waiting.delete(socket.data.host.id);
						this.safeSend(
							socket.data,
							frame("welcome", undefined, this.welcome(socket.data.host)),
						);
					},
					message: (socket, input) => {
						let message: Frame | undefined;
						try {
							message = decode(input, this.policy.maxBytes, inbound);
							this.receive(socket.data, message);
						} catch (error) {
							this.report(
								"Host sent an invalid control-plane frame; disconnecting it to protect coordinator state.",
								error,
								"protocol_rejected",
								{
									...this.connectionContext(socket.data),
									operation: message?.op,
									requestId: message?.id,
								},
							);
							this.disconnect(socket.data, "protocol_rejected", 1008);
							socket.close(1008, "Invalid protocol");
						}
					},
					close: (socket, code) =>
						this.disconnect(socket.data, "peer_closed", code),
				},
			});
			this.heartbeat = setInterval(() => {
				for (const session of this.sessions.values())
					if (performance.now() - session.lastSeen > 15000) {
						this.disconnect(session, "heartbeat_timeout");
						session.socket?.terminate();
					}
				this.grantIdentifies();
				if (this.scaleStatus.phase === "degraded" && this.gatewayReady())
					this.setScaleStatus("idle", "recovered");
				if (
					this.scheduler?.expired &&
					this.options.botToken &&
					!this.refreshing &&
					!this.scalePromise &&
					Date.now() >= this.refreshAt
				)
					this.refreshPromise = this.refresh();
			}, 250);
			this.activity(
				"notif",
				"listening",
				"Coordinator is accepting authenticated host connections.",
				{
					address: this.server.hostname,
					port: this.server.port,
					tls: !!this.options.tls,
					hosts: this.hosts.size,
					shards: this.count,
				},
			);
			this.scheduleScaling();
		} catch (error) {
			if (!this.closed)
				this.report(
					"Coordinator could not start; inspect listener configuration and gateway metadata.",
					error,
					"startup_failed",
				);
			this.scheduler = undefined;
			throw error;
		}
	}
	private upgrade(
		request: Request,
		server: Bun.Server<Session>,
	): Response | undefined {
		if (new URL(request.url).pathname !== "/sharding")
			return new Response("Not found", { status: 404 });
		if (this.closed)
			return new Response("Coordinator stopping", { status: 503 });
		if (this.transition)
			return new Response("Coordinator draining shards", { status: 503 });
		const connectionId = crypto.randomUUID();
		const host = this.hosts.get(request.headers.get("x-virello-worker") ?? "");
		if (
			!host ||
			!tokenMatches(request.headers.get("authorization"), host.token)
		) {
			this.activity(
				"alert",
				"authentication_rejected",
				"Host authentication failed; check the configured host ID and shared secret.",
				{
					connectionId,
					host: host?.id,
					status: 401,
					reason: host ? "invalid_credentials" : "unknown_host",
				},
			);
			return new Response("Unauthorized", { status: 401 });
		}
		if (request.method === "HEAD") {
			const instance = request.headers.get("x-virello-instance");
			if (!identifier.allows(instance))
				return new Response(null, { status: 400 });
			const reason = this.sessions.has(`${host.id}/${instance}`)
				? "host_already_connected"
				: "";
			return new Response(null, {
				status: reason ? 409 : 204,
				headers: { "x-virello-reason": reason },
			});
		}
		const reject = (status: number, reason: string, text: string) => {
			const transient = reason === "host_already_connected";
			const previous = this.waiting.get(host.id);
			const attempts = previous?.reason === reason ? previous.attempts + 1 : 1;
			if (
				transient &&
				previous?.reason === reason &&
				performance.now() - previous.at < 30000
			) {
				previous.attempts = attempts;
				return new Response(text, { status });
			}
			if (transient)
				this.waiting.set(host.id, { reason, at: performance.now(), attempts });
			this.activity(
				"alert",
				"upgrade_rejected",
				reason === "host_already_connected"
					? "This supervisor instance already has an active connection; the duplicate connection was rejected."
					: "Authenticated host could not open a WebSocket connection; inspect the rejection reason.",
				{
					host: host.id,
					connectionId,
					status,
					reason,
					attempts: transient && attempts > 1 ? attempts : undefined,
				},
			);
			return new Response(text, { status });
		};
		if (
			request.headers.get("upgrade")?.toLowerCase() !== "websocket" ||
			request.headers.has("origin")
		)
			return reject(
				400,
				"native_upgrade_required",
				"Native WebSocket upgrade required",
			);
		const instance = request.headers.get("x-virello-instance");
		if (!identifier.allows(instance))
			return reject(400, "invalid_identity", "Invalid identity");
		if (this.sessions.has(`${host.id}/${instance}`))
			return reject(
				409,
				"host_already_connected",
				"Supervisor instance already connected",
			);
		if (this.sessions.size >= this.policy.maxPending + this.hosts.size)
			return reject(
				429,
				"connection_capacity",
				"Coordinator connection capacity reached",
			);
		const session: Session = {
			host,
			instance,
			connectionId,
			connectedAt: performance.now(),
			lastSeen: performance.now(),
			ready: new Map(),
			metrics: new Map(),
			ids: new Set(),
			released: false,
		};
		this.sessions.set(this.sessionKey(session), session);
		let upgraded = false;
		try {
			upgraded = server.upgrade(request, { data: session });
			if (upgraded) return undefined;
		} finally {
			if (!upgraded) {
				this.sessions.delete(this.sessionKey(session));
				this.activity(
					"debug",
					"upgrade_rolled_back",
					"WebSocket upgrade did not complete; temporary connection state was removed.",
					{
						host: host.id,
						connectionId,
					},
				);
			}
		}
		return reject(400, "upgrade_not_accepted", "Upgrade required");
	}
	private receive(session: Session, message: Frame): void {
		if (
			this.sessions.get(this.sessionKey(session)) !== session ||
			session.released
		)
			throw new ShardError("OWNERSHIP", "Stale worker connection.");
		session.lastSeen = performance.now();
		this.activity(
			"debug",
			"frame_received",
			"Received a validated host frame.",
			{
				...this.connectionContext(session),
				operation: message.op,
				requestId: message.id,
			},
		);
		const { op, data: d } = message;
		if (
			this.transition &&
			(message.op === "identify" ||
				message.op === "call" ||
				message.op === "lease")
		) {
			this.send(
				session,
				frame(
					"reply",
					message.id,
					failure(
						new ShardError(
							"RESHARDING",
							"Coordinator is draining the current topology.",
						),
					),
				),
			);
			return;
		}
		switch (op) {
			case "lease":
				this.lease(session, message);
				return;
			case "metrics":
				this.identity(session, d);
				session.metrics.set(d.shard, {
					ready: d.ready,
					guilds: d.guilds,
					at: performance.now(),
				});
				return;
			case "drained":
				if (this.transition?.id !== message.id) return;
				if (
					!this.transition.participants.includes(session) ||
					session.ready.size ||
					[...this.leases.values()].some(
						(lease) =>
							lease.host === session.host.id &&
							lease.instance === session.instance,
					)
				)
					throw new ShardError(
						"PROTOCOL",
						"Host acknowledged a drain before stopping its shards.",
					);
				this.transition.drained.add(session);
				return;
			case "ping":
				this.send(session, frame("pong", message.id));
				return;
			case "ready":
				this.assigned(session, d.shard);
				if (this.leases.get(d.shard)?.generation !== d.generation)
					throw new ShardError(
						"OWNERSHIP",
						"Shard generation does not own this lease.",
					);
				if (
					session.ready.has(d.shard) &&
					session.ready.get(d.shard) !== d.generation
				)
					throw new ShardError("OWNERSHIP", "Shard already registered.");
				if (session.ready.get(d.shard) === d.generation) {
					this.send(
						session,
						frame("reply", message.id, { ok: true, value: null }),
					);
					return;
				}
				session.ready.set(d.shard, d.generation);
				this.send(
					session,
					frame("reply", message.id, { ok: true, value: null }),
				);
				this.activity(
					"notif",
					"shard_registered",
					"Host registered a shard; requests can now be routed to it.",
					{
						...this.connectionContext(session),
						shard: d.shard,
						generation: d.generation,
						readyShards: session.ready.size,
						assignedCount: session.host.shards.length,
					},
				);
				return;
			case "offline":
				// A confirmed exit may be replayed after reconnect or coordinator restart.
				// An old exit must never release a replacement process's lease.
				for (const [shard] of this.leases)
					if (
						(d.shard === null || d.shard === shard) &&
						this.owns(session, shard, d.generation)
					)
						this.removeShard(session, shard, d.generation);
				this.send(
					session,
					frame("reply", message.id, { ok: true, value: null }),
				);
				return;
			case "done":
				this.identity(session, d);
				this.scheduler!.stopped(session.connectionId, d.shard, d.generation);
				this.activity(
					"notif",
					"identify_completed",
					"Shard confirmed its gateway login; its identify slot can finish cooling down.",
					{
						...this.connectionContext(session),
						shard: d.shard,
						generation: d.generation,
					},
				);
				this.grantIdentifies();
				return;
			case "identify": {
				this.identity(session, d);
				timeout(d.timeoutMs);
				if (
					[...this.identifies.values()].some(
						(p) => p.session === session && p.message.data.shard === d.shard,
					)
				)
					throw new ShardError(
						"PROTOCOL",
						"Shard already has a queued identify.",
					);
				if (!this.reserve(session, message)) return;
				// Another attempt by this shard means its previous identify did not produce READY.
				this.scheduler!.stopped(session.connectionId, d.shard, d.generation);
				const id = crypto.randomUUID();
				this.identifies.set(id, {
					session,
					message,
					startedAt: performance.now(),
					timer: setTimeout(() => {
						this.finishIdentify(
							id,
							new ShardError(
								"IDENTIFY_TIMEOUT",
								"No identify slot before deadline; session allowance may be exhausted or expired.",
							),
						);
					}, d.timeoutMs),
				});
				this.activity(
					"notif",
					"identify_queued",
					"Shard requested a gateway login permit; waiting for an available identify slot.",
					{
						...this.connectionContext(session),
						requestId: message.id,
						shard: d.shard,
						generation: d.generation,
						timeoutMs: d.timeoutMs,
						pendingIdentifies: this.identifies.size,
						remaining: this.scheduler!.remaining,
						expired: this.scheduler!.expired,
					},
				);
				this.grantIdentifies();
				return;
			}
			case "call":
				this.route(session, message);
				return;
			case "result": {
				const route = this.routes.get(message.id);
				if (!route) {
					this.activity(
						"debug",
						"late_result_ignored",
						"Ignored a result for a request that has already ended.",
						{
							...this.connectionContext(session),
							routeId: message.id,
							shard: d.shard,
						},
					);
					return;
				}
				if (
					route.destination !== session ||
					route.shard !== d.shard ||
					route.generation !== d.generation
				)
					throw new ShardError("PROTOCOL", "Reply identity mismatch.");
				this.complete(message.id, d.result);
				return;
			}
			case "cancel":
				for (const [id, route] of this.routes)
					if (route.source === session && route.original === message.id)
						this.complete(
							id,
							failure(new ShardError("ABORTED", "Caller cancelled.")),
						);
				for (const [id, pending] of this.identifies)
					if (pending.session === session && pending.message.id === message.id)
						this.finishIdentify(
							id,
							new ShardError("ABORTED", "Caller cancelled."),
						);
				return;
			case "release":
				if (
					session.ready.size ||
					[...this.leases.values()].some(
						(lease) =>
							lease.host === session.host.id &&
							lease.instance === session.instance,
					)
				)
					throw new ShardError(
						"OWNERSHIP",
						"Confirm all owned shard exits before releasing a worker.",
					);
				this.scheduler!.stopped(session.connectionId);
				session.released = true;
				this.activity(
					"notif",
					"host_drained",
					"Host stopped all its shards; the connection can close.",
					{
						...this.connectionContext(session),
						requestId: message.id,
					},
				);
				this.send(session, frame("released", message.id));
				return;
		}
	}
	private route(session: Session, message: Frame<"call">): void {
		const d = message.data;
		if (d.source !== -1) {
			this.assigned(session, d.source);
			if (!session.ready.has(d.source))
				throw new ShardError("OWNERSHIP", "Source shard is offline.");
		}
		timeout(d.timeoutMs);
		if (!this.reserve(session, message)) return;
		const lease = this.leases.get(d.target);
		const destination =
			lease && this.sessions.get(`${lease.host}/${lease.instance}`);
		const generation = destination?.ready.get(d.target);
		if (!destination || !generation) {
			session.ids.delete(message.id);
			this.activity(
				"alert",
				"request_rejected",
				"Shard request was not dispatched; the destination shard is unavailable.",
				{
					...this.connectionContext(session),
					requestId: message.id,
					shard: d.target,
					operation: d.name,
					code: "UNAVAILABLE",
				},
			);
			this.send(
				session,
				frame(
					"reply",
					message.id,
					failure(
						new ShardError("UNAVAILABLE", `Shard ${d.target} is unavailable.`),
					),
				),
			);
			return;
		}
		const id = crypto.randomUUID();
		const route: Route = {
			source: session,
			sourceShard: d.source,
			original: message.id,
			destination,
			shard: d.target,
			generation,
			name: d.name,
			startedAt: performance.now(),
			timeoutMs: d.timeoutMs,
			timer: setTimeout(
				() =>
					this.complete(
						id,
						failure(new ShardError("TIMEOUT", "Destination shard timed out.")),
					),
				d.timeoutMs,
			),
		};
		this.routes.set(id, route);
		try {
			this.send(destination, frame("invoke", id, { ...d, generation }));
			this.activity(
				"notif",
				"request_dispatched",
				"Dispatched a shard request to its destination host.",
				this.routeContext(id, route),
			);
		} catch (error) {
			this.complete(id, failure(error));
		}
	}
	private reserve(
		session: Session,
		message: Frame<"call" | "identify">,
	): boolean {
		const id = message.id;
		if (session.ids.has(id))
			throw new ShardError("PROTOCOL", "Duplicate operation ID.");
		if (
			this.pendingCount >= this.policy.maxPending ||
			session.ids.size >= this.policy.maxPending
		) {
			this.activity(
				"alert",
				"request_rejected",
				"Coordinator cannot accept more pending work; inspect request volume and deadlines.",
				{
					...this.connectionContext(session),
					requestId: id,
					operation: message.op === "call" ? message.data.name : "identify",
					shard:
						message.op === "call" ? message.data.target : message.data.shard,
					code: "CAPACITY",
					pending: this.pendingCount,
					maxPending: this.policy.maxPending,
				},
			);
			this.send(
				session,
				frame(
					"reply",
					id,
					failure(
						new ShardError("CAPACITY", "Coordinator request capacity reached."),
					),
				),
			);
			return false;
		}
		session.ids.add(id);
		return true;
	}
	private complete(id: string, result: Outcome): void {
		const route = this.routes.get(id);
		if (!route) return;
		this.routes.delete(id);
		clearTimeout(route.timer);
		route.source.ids.delete(route.original);
		const code = result.ok ? undefined : result.error.code;
		this.activity(
			result.ok || code === "ABORTED" ? "notif" : "alert",
			result.ok
				? "request_completed"
				: code === "TIMEOUT"
					? "request_timed_out"
					: code === "ABORTED"
						? "request_cancelled"
						: "request_failed",
			result.ok
				? "Shard request completed."
				: code === "TIMEOUT"
					? "Shard request exceeded its deadline; requesting remote cancellation."
					: code === "ABORTED"
						? "Caller cancelled the shard request; requesting remote cancellation."
						: code === "DISCONNECTED"
							? "Shard request stopped because a host connection ended."
							: code === "UNAVAILABLE"
								? "Shard request could not complete because its shard went offline."
								: "Shard request failed; inspect the destination handler and diagnostic code.",
			{ ...this.routeContext(id, route), code },
		);
		this.safeSend(route.destination, frame("cancel", id));
		this.safeSend(route.source, frame("reply", route.original, result));
	}
	private grantIdentifies(): void {
		if (!this.scheduler || this.closed || this.transition) return;
		for (const [id, pending] of this.identifies) {
			const d = pending.message.data;
			if (
				this.scheduler.grant(
					pending.session.connectionId,
					d.shard,
					d.generation,
				)
			)
				this.finishIdentify(id);
		}
	}
	private finishIdentify(id: string, error?: unknown): void {
		const pending = this.identifies.get(id);
		if (!pending) return;
		this.identifies.delete(id);
		clearTimeout(pending.timer);
		pending.session.ids.delete(pending.message.id);
		const code =
			error instanceof ShardError ? error.code : error ? "STATE" : undefined;
		this.activity(
			error && code !== "ABORTED" ? "alert" : "notif",
			!error
				? "identify_granted"
				: code === "IDENTIFY_TIMEOUT"
					? "identify_timed_out"
					: code === "ABORTED"
						? "identify_cancelled"
						: "identify_failed",
			!error
				? "Granted a gateway login permit to the shard."
				: code === "IDENTIFY_TIMEOUT"
					? "Gateway login permit missed its deadline; inspect identify allowance and active slots."
					: code === "ABORTED"
						? "Caller cancelled the queued gateway login permit."
						: "Queued gateway login permit could not complete; inspect the host connection and coordinator state.",
			{
				...this.connectionContext(pending.session),
				requestId: pending.message.id,
				shard: pending.message.data.shard,
				generation: pending.message.data.generation,
				durationMs: Math.round(performance.now() - pending.startedAt),
				remaining: this.scheduler?.remaining,
				code,
			},
		);
		this.safeSend(
			pending.session,
			frame(
				"reply",
				pending.message.id,
				error ? failure(error) : { ok: true, value: null },
			),
		);
	}
	private sessionKey(session: Session): string {
		return `${session.host.id}/${session.instance}`;
	}
	private welcome(host: ShardHost) {
		return {
			shards: host.shards,
			capacity: host.maxShards ?? host.shards.length,
			count: this.count,
			limits: this.policy,
		};
	}
	private owns(session: Session, shard: number, generation: string): boolean {
		const lease = this.leases.get(shard);
		return (
			lease?.host === session.host.id &&
			lease.instance === session.instance &&
			lease.generation === generation
		);
	}
	private lease(session: Session, message: Frame): void {
		const { previous, generation, preferred } = message.data as {
			previous: number | null;
			generation: string;
			preferred: number;
		};
		const reject = (code: string, reason: string) =>
			this.send(
				session,
				frame("reply", message.id, failure(new ShardError(code, reason))),
			);
		const existing = [...this.leases].find(
			([, lease]) =>
				lease.host === session.host.id &&
				lease.instance === session.instance &&
				lease.generation === generation,
		);
		if (existing && previous !== null && previous !== existing[0])
			return reject(
				"LEASE_INVALID",
				"This process must reconcile its existing shard ID.",
			);
		// A lost first lease reply is safe to retry with the same authenticated process generation.
		let shard = previous ?? existing?.[0] ?? null;
		if (shard !== null) {
			if (shard >= this.count)
				return reject(
					"LEASE_INVALID",
					"Previous shard ID is outside the current shard count.",
				);
			if (this.leases.has(shard) && !this.owns(session, shard, generation))
				return reject(
					"LEASE_TAKEN",
					"Previous shard ID is leased to another process.",
				);
		} else {
			const candidates = [
				...new Set([
					preferred,
					...session.host.shards,
					...Array.from({ length: this.count }, (_, id) => id),
				]),
			];
			shard =
				candidates.find((id) => id < this.count && !this.leases.has(id)) ??
				null;
			if (shard === null)
				return reject(
					"NO_CAPACITY",
					"All shard slots are leased; remaining dormant until a slot is released.",
				);
		}
		const owned = [...this.leases.values()].filter(
			(lease) => lease.host === session.host.id,
		).length;
		if (
			previous === null &&
			!existing &&
			owned >= (session.host.maxShards ?? session.host.shards.length)
		)
			return reject(
				"NO_CAPACITY",
				"This host has reached its configured shard capacity.",
			);
		// No await between observing the slot and installing its authenticated owner.
		this.leases.set(shard, {
			host: session.host.id,
			instance: session.instance,
			generation,
		});
		this.assignments.set(shard, session.host.id);
		this.send(
			session,
			frame("reply", message.id, {
				ok: true,
				value: { shard, count: this.count },
			}),
		);
	}
	private assigned(session: Session, shard: number): void {
		const lease = this.leases.get(shard);
		if (
			!lease ||
			lease.host !== session.host.id ||
			lease.instance !== session.instance
		)
			throw new ShardError(
				"OWNERSHIP",
				"This host instance does not own the shard lease.",
			);
	}
	private identity(
		session: Session,
		data: { shard: number; generation: string },
	): void {
		this.assigned(session, data.shard);
		if (session.ready.get(data.shard) !== data.generation)
			throw new ShardError("OWNERSHIP", "Stale shard generation.");
	}
	private removeShard(
		session: Session,
		shard: number,
		generation: string,
	): void {
		this.leases.delete(shard);
		session.ready.delete(shard);
		session.metrics.delete(shard);
		this.scheduler!.stopped(session.connectionId, shard, generation);
		this.activity(
			"notif",
			"shard_offline",
			"Host marked a shard offline; pending work involving it will fail.",
			{
				...this.connectionContext(session),
				shard,
				generation,
				readyShards: session.ready.size,
			},
		);
		for (const [id, route] of this.routes)
			if (
				(route.destination === session && route.shard === shard) ||
				(route.source === session && route.sourceShard === shard)
			)
				this.complete(
					id,
					failure(new ShardError("UNAVAILABLE", "Shard exited.")),
				);
		for (const [id, pending] of this.identifies)
			if (pending.session === session && pending.message.data.shard === shard)
				this.finishIdentify(id, new ShardError("UNAVAILABLE", "Shard exited."));
	}
	private disconnect(
		session: Session,
		reason: DisconnectReason,
		closeCode?: number,
	): void {
		if (this.sessions.get(this.sessionKey(session)) !== session) return;
		this.sessions.delete(this.sessionKey(session));
		this.activity(
			session.released ||
				reason === "server_shutdown" ||
				(reason === "peer_closed" && closeCode === 1000)
				? "notif"
				: "alert",
			"host_disconnected",
			session.released
				? "Host disconnected after stopping its shards."
				: "Host disconnected; shard leases remain reserved while its control connection recovers.",
			{
				...this.connectionContext(session),
				reason,
				closeCode,
				shards: [...session.ready.keys()],
				readyShards: session.ready.size,
				pending: session.ids.size,
				durationMs: Math.round(performance.now() - session.connectedAt),
			},
		);
		for (const [id, route] of this.routes)
			if (route.source === session || route.destination === session)
				this.complete(
					id,
					failure(new ShardError("DISCONNECTED", "Worker disconnected.")),
				);
		for (const [id, pending] of this.identifies)
			if (pending.session === session)
				this.finishIdentify(
					id,
					new ShardError("DISCONNECTED", "Worker disconnected."),
				);
		this.scheduler?.stopped(session.connectionId);
	}
	private send(session: Session, message: Frame): void {
		if (!session.socket)
			throw new ShardError("DISCONNECTED", "Worker socket unavailable.");
		sendSocket(session.socket, message, this.policy);
		this.activity(
			"debug",
			"frame_sent",
			"Sent a coordinator frame to the host.",
			{
				...this.connectionContext(session),
				operation: message.op,
				requestId: message.id,
			},
		);
	}
	private safeSend(session: Session, message: Frame): void {
		if (this.sessions.get(this.sessionKey(session)) !== session) return;
		try {
			this.send(session, message);
		} catch (error) {
			this.activity(
				"alert",
				"send_failed",
				"Coordinator could not send a frame; disconnecting the host and failing its pending work.",
				{
					...this.connectionContext(session),
					operation: message.op,
					requestId: message.id,
					code: error instanceof ShardError ? error.code : "SEND",
				},
			);
			this.disconnect(session, "send_failed");
			session.socket?.terminate();
		}
	}
	/**
	 * Run a scaling check with fresh metadata. Concurrent checks share a promise and respect confirmations and cooldown.
	 * @returns The resulting status, including recorded metadata/deployment failures. Disabled scaling returns its existing
	 * status.
	 * @throws If scaling is enabled but the coordinator is not running.
	 */
	public checkScaling(): Promise<ShardScalingStatus> {
		if (!this.scaling) return Promise.resolve(this.scalingStatus);
		if (this.closed || !this.server)
			return Promise.reject(
				new ShardError("STATE", "Coordinator is not running."),
			);
		return (this.scalePromise ??= this.evaluateScaling().finally(() => {
			this.scalePromise = undefined;
		}));
	}
	private scheduleScaling(): void {
		if (!this.scaling || this.closed) return;
		this.scaleTimer = setTimeout(() => {
			void this.checkScaling().finally(() => this.scheduleScaling());
		}, this.scaling.options.pollIntervalMs);
	}
	private gatewayReady(): boolean {
		if (!this.hostsConnected()) return false;
		for (let shard = 0; shard < this.count; shard++) {
			const lease = this.leases.get(shard);
			const session =
				lease && this.sessions.get(`${lease.host}/${lease.instance}`);
			const metrics = session?.metrics.get(shard);
			if (
				!session ||
				session.instance !== lease?.instance ||
				session.ready.get(shard) !== lease.generation ||
				!metrics?.ready ||
				performance.now() - metrics.at > 15000
			)
				return false;
		}
		return true;
	}
	private hostsConnected(): boolean {
		return [...this.hosts.keys()].every((id) =>
			[...this.sessions.values()].some(
				(session) => session.host.id === id && !session.released,
			),
		);
	}
	private setScaleStatus(
		phase: ShardScalingStatus["phase"],
		reason: string,
		targetShards?: number,
	): void {
		const changed =
			phase !== this.scaleStatus.phase ||
			reason !== this.scaleStatus.reason ||
			targetShards !== this.scaleStatus.targetShards;
		this.scaleStatus = {
			phase,
			reason,
			shardCount: this.count,
			...(targetShards === undefined ? {} : { targetShards }),
		};
		if (changed)
			this.activity(
				phase === "degraded" ? "alert" : "notif",
				"scaling_status",
				"Automatic shard deployment status changed.",
				{
					...this.scaleStatus,
				},
			);
	}
	private commitAssignments(plan: ScalingPlan): void {
		this.count = plan.count;
		this.assignments.clear();
		for (const [shard, host] of plan.assignments)
			this.assignments.set(shard, host);
		for (const [id, host] of this.hosts) {
			const next = Object.freeze({
				...host,
				shards: Object.freeze(
					[...plan.assignments]
						.filter(([, owner]) => owner === id)
						.map(([shard]) => shard)
						.sort((a, b) => a - b),
				),
			});
			this.hosts.set(id, next);
			for (const session of this.sessions.values())
				if (session.host.id === id) session.host = next;
		}
		this.scaleStatus = { ...this.scaleStatus, shardCount: this.count };
	}
	private async evaluateScaling(): Promise<ShardScalingStatus> {
		const policy = this.scaling!;
		try {
			await this.refreshPromise;
			const limit = await this.fetchLimit();
			if (this.closed) return this.scalingStatus;
			this.updateSessionLimit(limit);
			const ready = this.gatewayReady();
			// A larger Discord recommendation can repair a topology that is too small to log in.
			// Shrinking and guild-based balancing require complete, fresh caches; degraded commits must recover first.
			if (
				!ready &&
				(this.scaleStatus.phase === "degraded" ||
					!this.hostsConnected() ||
					this.recommendation! <= this.count)
			) {
				policy.reset();
				this.setScaleStatus(
					this.scaleStatus.phase === "degraded" ? "degraded" : "idle",
					"waiting_for_ready_hosts",
				);
				return this.scalingStatus;
			}
			const guilds = new Map<number, number>();
			for (const session of this.sessions.values())
				for (const [shard, metrics] of session.metrics)
					guilds.set(shard, metrics.guilds);
			const plan = policy.plan(
				this.recommendation!,
				[...this.hosts.values()],
				this.assignments,
				ready ? guilds : undefined,
			);
			const decision = policy.observe(plan, this.assignments);
			if (decision !== "change") {
				this.setScaleStatus(
					"idle",
					decision,
					decision === "confirming" ? plan.count : undefined,
				);
				return this.scalingStatus;
			}
			// Cover either the proposed deployment or a pre-commit rollback. In-flight permits are already charged.
			if (
				this.scheduler!.expired ||
				this.scheduler!.remaining <
					Math.max(plan.count, this.count) + policy.options.sessionReserve
			) {
				policy.reset();
				this.setScaleStatus("idle", "insufficient_session_starts", plan.count);
				return this.scalingStatus;
			}
			await this.deploy(plan);
		} catch (error) {
			policy.reset();
			if (!this.closed) {
				this.setScaleStatus(
					this.scaleStatus.phase === "degraded" ? "degraded" : "idle",
					error instanceof ShardError ? error.code : "scaling_failed",
				);
				this.report(
					"Automatic shard deployment could not complete; inspect capacity, gateway metadata and host health.",
					error,
					"scaling_failed",
				);
			}
		}
		return this.scalingStatus;
	}
	private async until(
		test: () => boolean,
		milliseconds: number,
		code: string,
	): Promise<void> {
		const deadline = performance.now() + milliseconds;
		while (!test()) {
			this.lifecycle.signal.throwIfAborted();
			if (performance.now() >= deadline)
				throw new ShardError(
					code,
					"Automatic shard transition exceeded its deadline.",
				);
			await wait(50, undefined, { signal: this.lifecycle.signal });
		}
		this.lifecycle.signal.throwIfAborted();
	}
	private async deploy(plan: ScalingPlan): Promise<void> {
		const policy = this.scaling!;
		const id = crypto.randomUUID();
		if (
			[...this.leases.values()].some(
				(lease) =>
					this.sessions.get(`${lease.host}/${lease.instance}`)?.instance !==
					lease.instance,
			)
		)
			throw new ShardError(
				"SCALING_RESERVED",
				"Disconnected process leases must be reconciled or explicitly released before scaling.",
			);
		this.validateAssignments(plan);
		// Validate every new and rollback frame before stopping any child.
		for (const host of this.hosts.values()) {
			encode(
				frame("assignment", id, {
					shards: [...plan.assignments]
						.filter(([, owner]) => owner === host.id)
						.map(([shard]) => shard),
					count: plan.count,
				}),
				this.policy.maxBytes,
			);
			encode(
				frame("assignment", id, { shards: host.shards, count: this.count }),
				this.policy.maxBytes,
			);
		}
		const transition = {
			id,
			participants: [...this.sessions.values()],
			drained: new Set<Session>(),
		};
		this.transition = transition;
		policy.changed();
		this.setScaleStatus("draining", plan.reason, plan.count);
		const error = new ShardError(
			"RESHARDING",
			"Coordinator is draining the current topology.",
		);
		for (const route of [...this.routes.keys()])
			this.complete(route, failure(error));
		for (const pending of [...this.identifies.keys()])
			this.finishIdentify(pending, error);
		for (const session of transition.participants)
			this.safeSend(session, frame("drain", id));
		try {
			await this.until(
				() => {
					if (
						transition.participants.some(
							(session) =>
								this.sessions.get(this.sessionKey(session)) !== session ||
								session.released,
						)
					)
						throw new ShardError(
							"SCALING_DISCONNECTED",
							"A host disconnected before the shard topology could commit.",
						);
					return transition.drained.size === transition.participants.length;
				},
				policy.options.drainTimeoutMs,
				"SCALING_DRAIN_TIMEOUT",
			);
		} catch (error) {
			this.transition = undefined;
			// Still the old topology. Slow hosts finish their drain before accepting this rollback.
			if (!this.closed)
				for (const session of transition.participants)
					this.safeSend(
						session,
						frame("assignment", id, {
							shards: session.host.shards,
							count: this.count,
						}),
					);
			throw error;
		}
		this.commitAssignments(plan);
		this.transition = undefined;
		this.setScaleStatus("starting", plan.reason, plan.count);
		for (const session of transition.participants)
			this.safeSend(
				session,
				frame("assignment", id, {
					shards: session.host.shards,
					count: this.count,
				}),
			);
		try {
			await this.until(
				() => this.gatewayReady(),
				policy.options.readyTimeoutMs,
				"SCALING_READY_TIMEOUT",
			);
			this.setScaleStatus("idle", "deployed");
		} catch (error) {
			// New total is committed. Reconnecting hosts always receive it; never mix totals through rollback.
			this.setScaleStatus("degraded", "waiting_for_new_topology", this.count);
			throw error;
		}
	}
	private validateAssignments(plan: ScalingPlan): void {
		if (plan.count > this.policy.maxPending)
			throw new ShardError(
				"SCALING_CAPACITY",
				"Automatic shard total exceeds limits.maxPending; allow room for all startup identifies.",
			);
		for (const host of this.hosts.values()) {
			const shards = [...plan.assignments]
				.filter(([, owner]) => owner === host.id)
				.map(([shard]) => shard);
			encode(
				frame("welcome", undefined, {
					...this.welcome(host),
					shards,
					count: plan.count,
				}),
				this.policy.maxBytes,
			);
			encode(
				frame("assignment", undefined, { shards, count: plan.count }),
				this.policy.maxBytes,
			);
		}
	}
	/**
	 * Supply fresh session metadata without increasing an unexpired allowance.
	 * @param value - Current Discord session-start limits.
	 * @throws If the coordinator is not running, the snapshot is invalid, or active identify buckets conflict with a
	 * concurrency change.
	 */
	public updateSessionLimit(value: ShardSessionLimit): void {
		if (!this.scheduler || this.closed)
			throw new ShardError("STATE", "Coordinator is not running.");
		this.scheduler.update(value);
		this.logIdentifyLimits(value);
		this.grantIdentifies();
	}
	private async fetchLimit(): Promise<ShardSessionLimit> {
		const response = await fetch("https://discord.com/api/v10/gateway/bot", {
			headers: { authorization: `Bot ${this.options.botToken}` },
			signal: AbortSignal.any([
				this.lifecycle.signal,
				AbortSignal.timeout(15000),
			]),
		});
		if (!response.ok)
			throw new ShardError(
				"GATEWAY",
				`Gateway metadata request failed (${response.status}).`,
			);
		const result = (await response.json()) as {
			session_start_limit: ShardSessionLimit;
			shards: number;
		};
		if (
			this.scaling &&
			(!Number.isInteger(result.shards) ||
				result.shards < 1 ||
				result.shards > 4096)
		)
			throw new ShardError(
				"SCALING_METADATA",
				"Discord returned an invalid recommended shard count.",
			);
		this.recommendation = result.shards;
		return result.session_start_limit;
	}
	private async refresh(): Promise<void> {
		this.refreshing = true;
		try {
			this.activity(
				"debug",
				"identify_limits_refreshing",
				"Refreshing Discord gateway login limits.",
			);
			const value = await this.fetchLimit();
			if (!this.closed) this.updateSessionLimit(value);
		} catch (error) {
			this.refreshAt = Date.now() + 30000;
			if (!this.closed)
				this.report(
					"Could not refresh Discord session limits; new shard logins remain blocked.",
					error,
					"gateway_metadata_refresh_failed",
				);
		} finally {
			this.refreshing = false;
		}
	}
	/**
	 * Stop the listener and timers, disconnect hosts, and fail pending coordination work.
	 * @returns One shared shutdown promise. Owned loggers are closed after cleanup.
	 */
	public close(): Promise<void> {
		this.closed = true;
		this.lifecycle.abort();
		return (this.closePromise ??= this.stop());
	}
	private async stop(): Promise<void> {
		await this.startPromise?.catch(() => {});
		const wasListening = this.server !== undefined;
		if (wasListening)
			this.activity(
				"notif",
				"stopping",
				"Coordinator is stopping; disconnecting hosts and failing pending work.",
				{
					hosts: this.sessions.size,
					pending: this.pendingCount,
				},
			);
		clearInterval(this.heartbeat);
		clearTimeout(this.scaleTimer);
		for (const session of this.sessions.values()) {
			this.disconnect(session, "server_shutdown");
			session.socket?.terminate();
		}
		await this.server?.stop(true);
		this.server = undefined;
		await this.refreshPromise;
		await this.scalePromise;
		this.scheduler = undefined;
		if (wasListening)
			this.activity("notif", "stopped", "Coordinator listener is closed.");
		await this.ownedLogger?.close();
	}
	private connectionContext(session: Session) {
		return { host: session.host.id, connectionId: session.connectionId };
	}
	private routeContext(id: string, route: Route) {
		return {
			...this.connectionContext(route.source),
			requestId: route.original,
			routeId: id,
			destinationHost: route.destination.host.id,
			destinationConnectionId: route.destination.connectionId,
			sourceShard: route.sourceShard === -1 ? null : route.sourceShard,
			shard: route.shard,
			generation: route.generation,
			operation: route.name,
			timeoutMs: route.timeoutMs,
			durationMs: Math.round(performance.now() - route.startedAt),
		};
	}
	private logIdentifyLimits(value: ShardSessionLimit): void {
		const remaining = this.scheduler!.remaining;
		const expired = this.scheduler!.expired;
		this.activity(
			remaining && !expired ? "notif" : "alert",
			"identify_limits_updated",
			remaining && !expired
				? "Coordinator gateway login allowance is ready."
				: "Gateway login allowance is exhausted or expired; new login permits must wait for fresh limits.",
			{
				remaining,
				expired,
				total: value.total,
				maxConcurrency: value.max_concurrency,
			},
		);
	}
	private activity(
		level: keyof LoggerLike,
		event: string,
		message: string,
		context?: Record<string, unknown>,
		error?: unknown,
	): void {
		writeEvent(this.logger, level, {
			component: "sharding.coordinator",
			event,
			message,
			// Selected metadata only; also scrub configured credentials for caller-supplied loggers.
			context: safeContext(context, this.logSecrets),
			error,
		});
	}
	private report(
		message: string,
		error: unknown,
		event: string,
		context?: Record<string, unknown>,
	): void {
		this.activity("error", event, message, context, error);
	}
}
