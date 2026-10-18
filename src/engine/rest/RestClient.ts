import type {
	APIGuildMember,
	APIMessage,
	RESTGetAPIChannelResult,
	RESTGetAPIGatewayBotResult,
	RESTPostAPIChannelMessageJSONBody,
	RESTPostAPIInteractionCallbackJSONBody,
} from "discord-api-types/v10";
import { Routes } from "discord-api-types/v10";
import { type $Clock, delay, endpoint, integer, systemClock } from "../common";
import { type $RouteKey, RateLimits, routeKey } from "./RateLimits";
import { RequestQueue } from "./RequestQueue";
import { RestError } from "./RestError";

/** Fetch-compatible HTTP transport returning a Response promise. It must honor the supplied abort signal. */
export type $Fetch = (
	input: string | URL,
	init?: RequestInit,
) => Promise<Response>;
/** Discord REST transport, queue, retry, and response limits. */
export interface $RestOptions {
	/** Discord API base URL. Defaults to https://discord.com/api/v10; TLS is required outside loopback tests. */
	baseURL?: string;
	/** HTTP transport. Defaults to global fetch. */
	fetch?: $Fetch;
	/** Clock and timer hooks. Defaults to native engine timing. */
	clock?: $Clock;
	/** Positive integer cap on queued and running requests, including retries. Defaults to 1024. */
	maxPendingRequests?: number;
	/** Positive integer cap on concurrent requests. Defaults to 8. */
	maxConcurrentRequests?: number;
	/** Nonnegative retry limit for transport failures and 5xx responses on GET, PUT, and DELETE. Defaults to 2. */
	maxRetries?: number;
	/** Nonnegative retry limit after rate-limit responses. Defaults to 5; applies to all methods. */
	maxRateLimitRetries?: number;
	/** Positive integer network deadline per attempt, in milliseconds. Queueing and retry waits are separate. Defaults to 15000. */
	timeoutMs?: number;
	/** Positive integer cap on response body bytes. Defaults to 8388608. */
	maxResponseBytes?: number;
}
/** One JSON request relative to the configured Discord API base URL. */
export interface $RestRequest {
	/** HTTP method used for the API call. */
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	/** Absolute API path beginning with one slash. Traversal, fragments, backslashes, and embedded newlines are rejected. */
	path: string;
	/** Optional JSON-serializable body, serialized when the request is queued. */
	body?: unknown;
	/** Optional file uploads. Blobs (including Bun.file) are sent as Discord multipart files with payload_json. */
	files?: readonly { name: string; data: Blob }[];
	/** Send the bot token unless false. Defaults to true; interaction callbacks use false. */
	auth?: boolean;
	/** Optional cancellation signal for the full operation, including queue and retry waits. */
	signal?: AbortSignal;
}

async function readResponse(
	response: Response,
	maximum: number,
): Promise<unknown> {
	if (response.status === 204 || !response.body) return undefined;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > maximum)
				throw new Error("REST response exceeds maxResponseBytes.");
			chunks.push(value);
		}
	} catch (error) {
		await reader.cancel().catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const text = new TextDecoder().decode(bytes);
	if (!text) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		if (response.ok) throw new Error("REST returned invalid JSON.");
		return text;
	}
}

/** Discord REST over Bun fetch. No environment variables are read by the engine. */
export class RestClient {
	readonly #token: string;
	private readonly fetcher: $Fetch;
	private readonly clock: $Clock;
	private readonly queue: RequestQueue;
	private readonly rates: RateLimits;
	private readonly unauthenticatedRates: RateLimits;
	private readonly lifetime = new AbortController();
	private readonly base: string;
	private readonly retries: number;
	private readonly rateRetries: number;
	private readonly timeout: number;
	private readonly responseLimit: number;
	private readonly maximumPending: number;
	private pending = 0;

	/**
	 * Create an HTTP client without opening connections.
	 * @param token - Nonempty Discord bot token.
	 * @param options - Transport, queue, retry, and response settings.
	 * @throws For an empty token, invalid endpoint, or invalid limits.
	 */
	public constructor(token: string, options: $RestOptions = {}) {
		this.#token = token;
		if (!token.trim()) throw new TypeError("A bot token is required.");
		this.base = endpoint(
			options.baseURL ?? "https://discord.com/api/v10",
		).href.replace(/\/$/, "");
		this.fetcher = options.fetch ?? fetch;
		this.clock = options.clock ?? systemClock;
		this.maximumPending = integer(
			options.maxPendingRequests ?? 1024,
			"maxPendingRequests",
			1,
		);
		this.queue = new RequestQueue(
			this.maximumPending,
			options.maxConcurrentRequests ?? 8,
			this.clock,
		);
		this.rates = new RateLimits(this.clock);
		this.unauthenticatedRates = new RateLimits(this.clock);
		this.retries = integer(options.maxRetries ?? 2, "maxRetries");
		this.rateRetries = integer(
			options.maxRateLimitRetries ?? 5,
			"maxRateLimitRetries",
		);
		this.timeout = integer(options.timeoutMs ?? 15_000, "timeoutMs", 1);
		this.responseLimit = integer(
			options.maxResponseBytes ?? 8 * 1024 * 1024,
			"maxResponseBytes",
			1,
		);
	}
	/** Number of operations still queued or running, including retry waits. */
	public get pendingRequests(): number {
		return this.pending;
	}
	/** Permanently abort queued and running requests. Later calls reject. */
	public close(): void {
		this.lifetime.abort(new Error("REST client closed."));
	}

	/**
	 * Queue a Discord JSON request with route and global rate-limit handling.
	 * @param request - Method, API path, body, authentication, and cancellation settings.
	 * @returns Parsed JSON cast to T, or undefined for an empty successful response.
	 * @throws For invalid paths or JSON, exhausted queue capacity, cancellation, transport/response failures, or RestError
	 * for a rejected HTTP response. POST/PATCH transport failures are not retried.
	 */
	public request<T>(request: $RestRequest): Promise<T> {
		if (
			!request.path.startsWith("/") ||
			request.path.startsWith("//") ||
			request.path.includes("\\") ||
			request.path.includes("#") ||
			request.path.charCodeAt(request.path.length - 1) <= 0x20 ||
			/[\t\r\n]/.test(request.path) ||
			request.path
				.replace(/%2e/gi, ".")
				.split(/[/?]/)
				.some((part) => part === ".." || part === ".")
		)
			return Promise.reject(
				new TypeError(
					"REST paths must be absolute API paths without traversal.",
				),
			);
		const signal = request.signal
			? AbortSignal.any([request.signal, this.lifetime.signal])
			: this.lifetime.signal;
		if (signal.aborted) return Promise.reject(signal.reason);
		if (this.pending >= this.maximumPending)
			return Promise.reject(new Error("REST queue capacity exceeded."));
		let body: string | FormData | undefined;
		try {
			body =
				request.body === undefined ? undefined : JSON.stringify(request.body);
			if (request.files?.length) {
				const form = new FormData();
				form.set("payload_json", body ?? "{}");
				request.files.forEach((file, index) => {
					if (!(file.data instanceof Blob) || !file.name)
						throw new TypeError("Uploads require a name and Blob data.");
					form.set(`files[${index}]`, file.data, file.name);
				});
				body = form;
			}
		} catch (error) {
			return Promise.reject(error);
		}
		const snapshot = { ...request };
		this.pending++;
		return this.execute<T>(snapshot, body, signal).finally(() => {
			this.pending--;
		});
	}
	private async execute<T>(
		request: $RestRequest,
		body: string | FormData | undefined,
		signal: AbortSignal,
	): Promise<T> {
		const route = routeKey(request.method, request.path);
		// Bot and unauthenticated (IP-scoped) global limits are independent.
		// Interaction callbacks use the latter and must not wait on a bot cooldown.
		const scope = request.auth === false ? "unauthenticated" : "bot";
		const rates =
			request.auth === false ? this.unauthenticatedRates : this.rates;
		const callbackId =
			request.method === "POST"
				? /^\/interactions\/(\d+)\/[^/]+\/callback$/.exec(
						request.path.split("?")[0],
					)?.[1]
				: undefined;
		const safeRetry = ["GET", "PUT", "DELETE"].includes(request.method);
		let attempts = 0;
		let rateAttempts = 0;
		for (;;) {
			signal.throwIfAborted();
			let response: Response;
			let result: unknown;
			try {
				({ response, result } = await this.queue.add(
					() => this.attempt(request, body, signal, route, rates),
					signal,
					() => `${scope} ${rates.queueKey(route, callbackId)}`,
					() => rates.readyAt(route),
				));
			} catch (error) {
				signal.throwIfAborted();
				if (!safeRetry || attempts++ >= this.retries) throw error;
				await delay(
					this.clock,
					Math.min(500 * 2 ** (attempts - 1), 8000),
					signal,
				);
				continue;
			}
			if (response.status === 429) {
				if (rateAttempts++ >= this.rateRetries)
					throw new RestError(response.status, result);
				continue;
			}
			if (response.status >= 500 && safeRetry && attempts++ < this.retries) {
				await delay(
					this.clock,
					Math.min(500 * 2 ** (attempts - 1), 8000),
					signal,
				);
				continue;
			}
			if (!response.ok) throw new RestError(response.status, result);
			return result as T;
		}
	}
	private async attempt(
		request: $RestRequest,
		body: string | FormData | undefined,
		signal: AbortSignal,
		route: $RouteKey,
		rates: RateLimits,
	): Promise<{ response: Response; result: unknown }> {
		signal.throwIfAborted();
		const controller = new AbortController();
		const attemptSignal = AbortSignal.any([signal, controller.signal]);
		const timer = this.clock.setTimeout(
			() => controller.abort(new Error("REST request timed out.")),
			this.timeout,
		);
		try {
			const headers = new Headers({
				"User-Agent":
					"VirelloEngine (https://discord.com/developers/docs, 0.1.0)",
			});
			if (request.auth !== false)
				headers.set("Authorization", `Bot ${this.#token}`);
			if (typeof body === "string")
				headers.set("Content-Type", "application/json");
			const response = await this.fetcher(this.base + request.path, {
				method: request.method,
				headers,
				body,
				signal: attemptSignal,
				redirect: "error",
			});
			rates.observe(route, response.headers);
			const result = await readResponse(response, this.responseLimit);
			attemptSignal.throwIfAborted();
			// Publish cooldowns before releasing this bucket's scheduler slot.
			if (response.status === 429)
				rates.limited(route, response.headers, result);
			return { response, result };
		} finally {
			this.clock.clearTimeout(timer);
		}
	}
	/**
	 * Fetch Discord’s gateway URL, recommended shard count, and current session-start limits.
	 * @param signal - Optional cancellation signal.
	 * @returns Native gateway metadata; REST failures reject.
	 */
	public getGatewayBot(
		signal?: AbortSignal,
	): Promise<RESTGetAPIGatewayBotResult> {
		return this.request({ method: "GET", path: Routes.gatewayBot(), signal });
	}
	/**
	 * Fetch a member from Discord.
	 * @param guildId - Guild ID.
	 * @param userId - Member’s user ID.
	 * @param signal - Optional cancellation signal.
	 * @returns Native member data; REST failures reject.
	 */
	public getMember(
		guildId: string,
		userId: string,
		signal?: AbortSignal,
	): Promise<APIGuildMember> {
		return this.request({
			method: "GET",
			path: Routes.guildMember(guildId, userId),
			signal,
		});
	}
	/**
	 * Fetch a channel from Discord.
	 * @param channelId - Channel ID.
	 * @param signal - Optional cancellation signal.
	 * @returns Native channel data; REST failures reject.
	 */
	public getChannel(
		channelId: string,
		signal?: AbortSignal,
	): Promise<RESTGetAPIChannelResult> {
		return this.request({
			method: "GET",
			path: Routes.channel(channelId),
			signal,
		});
	}
	/**
	 * Fetch a message from Discord.
	 * @param channelId - Channel ID.
	 * @param messageId - Message ID.
	 * @param signal - Optional cancellation signal.
	 * @returns Native message data; REST failures reject.
	 */
	public getMessage(
		channelId: string,
		messageId: string,
		signal?: AbortSignal,
	): Promise<APIMessage> {
		return this.request({
			method: "GET",
			path: Routes.channelMessage(channelId, messageId),
			signal,
		});
	}
	/**
	 * Send a message to a channel.
	 * @param channelId - Destination channel ID.
	 * @param body - Native message body.
	 * @param signal - Optional cancellation signal.
	 * @returns The created message; REST failures reject.
	 */
	public createMessage(
		channelId: string,
		body: RESTPostAPIChannelMessageJSONBody,
		signal?: AbortSignal,
	): Promise<APIMessage> {
		return this.request({
			method: "POST",
			path: Routes.channelMessages(channelId),
			body,
			signal,
		});
	}
	/**
	 * Send a native initial interaction callback without bot-token authentication.
	 * @param id - Interaction ID.
	 * @param token - Interaction token.
	 * @param body - Native callback body.
	 * @param signal - Optional cancellation signal.
	 * @returns Completion of the callback; REST failures reject.
	 */
	public interactionCallback(
		id: string,
		token: string,
		body: RESTPostAPIInteractionCallbackJSONBody,
		signal?: AbortSignal,
	): Promise<void> {
		return this.request({
			method: "POST",
			path: Routes.interactionCallback(id, token),
			auth: false,
			body,
			signal,
		});
	}
}
