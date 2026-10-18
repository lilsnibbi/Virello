import type { $Clock } from "../common";
import { record } from "../common";

interface Bucket {
	remaining: number;
	reset: number;
}
export interface $RouteKey {
	route: string;
	major: string;
}

/** Normalize non-major IDs, retaining Discord's channel/guild/webhook partition. */
export function routeKey(method: string, path: string): $RouteKey {
	const parts = path.split("?")[0].split("/").filter(Boolean);
	let major = "";
	const normalized = parts.map((part, index) => {
		const previous = parts[index - 1];
		if (index === 1 && ["channels", "guilds", "webhooks"].includes(parts[0])) {
			major = `${parts[0]}:${part}`;
			return ":id";
		}
		if (parts[0] === "webhooks" && index === 2) {
			major += `:${part}`;
			return ":token";
		}
		if (parts[0] === "interactions" && index === 2) return ":token";
		if (
			/^\d+$/.test(part) ||
			["messages", "members", "roles", "interactions", "reactions"].includes(
				previous ?? "",
			)
		)
			return ":id";
		return part;
	});
	return { route: `${method} /${normalized.join("/")} ${major}`, major };
}

function seconds(value: string | null): number | undefined {
	if (value === null || value.trim() === "") return undefined;
	const result = Number(value);
	return Number.isFinite(result) && result >= 0 ? result * 1000 : undefined;
}

export class RateLimits {
	private globalUntil = 0;
	private readonly aliases = new Map<string, string>();
	private readonly buckets = new Map<string, Bucket>();
	public constructor(
		private readonly clock: $Clock,
		private readonly metadataLimit = 2048,
	) {}
	public key(route: $RouteKey): string {
		return this.aliases.get(route.route) ?? route.route;
	}
	/** Independent callbacks may overlap until Discord supplies a shared limit. */
	public queueKey(route: $RouteKey, callbackId?: string): string {
		const key = this.key(route);
		const bucket = this.buckets.get(key);
		if (
			callbackId !== undefined &&
			!this.aliases.has(route.route) &&
			(!bucket || bucket.reset <= this.clock.now())
		)
			// Keep credentials out of scheduler keys and per-interaction metadata out
			// of the bounded rate-limit maps. The queue retains only pending jobs.
			return `${key} interaction:${callbackId}`;
		return key;
	}
	public readyAt(route: $RouteKey): number {
		const bucket = this.buckets.get(this.key(route));
		return Math.max(
			this.globalUntil,
			bucket?.remaining === 0 ? bucket.reset : 0,
		);
	}
	public observe(route: $RouteKey, headers: Headers): void {
		const hash = headers.get("x-ratelimit-bucket");
		const old = this.buckets.get(this.key(route));
		if (hash)
			this.remember(this.aliases, route.route, `${hash} ${route.major}`);
		const resident = this.buckets.get(this.key(route)) ?? old;
		const remaining = headers.get("x-ratelimit-remaining");
		const reset = seconds(headers.get("x-ratelimit-reset-after"));
		const absolute = seconds(headers.get("x-ratelimit-reset"));
		const duration =
			reset ??
			(absolute === undefined ? undefined : Math.max(0, absolute - Date.now()));
		if (
			remaining !== null &&
			Number.isFinite(Number(remaining)) &&
			Number(remaining) >= 0
		) {
			this.remember(this.buckets, this.key(route), {
				remaining:
					resident && resident.reset > this.clock.now()
						? Math.min(resident.remaining, Number(remaining))
						: Number(remaining),
				reset: Math.max(
					resident?.reset ?? 0,
					duration === undefined
						? this.clock.now()
						: this.clock.now() + duration,
				),
			});
		}
	}
	public limited(route: $RouteKey, headers: Headers, body: unknown): number {
		const jsonDelay =
			record(body) && typeof body.retry_after === "number"
				? body.retry_after * 1000
				: undefined;
		const wait = jsonDelay ?? seconds(headers.get("retry-after"));
		if (
			wait === undefined ||
			!Number.isFinite(wait) ||
			wait < 0 ||
			wait > 86_400_000
		)
			throw new Error("Rate limit response has no usable retry_after.");
		// Avoid a spin when a server returns zero repeatedly.
		const until = this.clock.now() + Math.max(1, wait);
		if (
			(record(body) && body.global === true) ||
			headers.get("x-ratelimit-global") === "true"
		)
			this.globalUntil = Math.max(this.globalUntil, until);
		else {
			const key = this.key(route);
			const existing = this.buckets.get(key);
			this.remember(this.buckets, key, {
				remaining: 0,
				reset: Math.max(existing?.remaining === 0 ? existing.reset : 0, until),
			});
		}
		return wait;
	}
	private remember<T>(map: Map<string, T>, key: string, value: T): void {
		map.delete(key);
		map.set(key, value);
		// Never evict active cooldowns: fail explicitly instead of forgetting a server limit.
		if (map.size > this.metadataLimit) {
			for (const [candidate] of map) {
				const bucket =
					map === this.buckets
						? this.buckets.get(candidate)
						: this.buckets.get(this.aliases.get(candidate) ?? "");
				if (
					!bucket ||
					bucket.reset <= this.clock.now() ||
					bucket.remaining > 0
				) {
					map.delete(candidate);
					break;
				}
			}
			if (map.size > this.metadataLimit) {
				map.delete(key);
				throw new Error("REST rate-limit metadata capacity exceeded.");
			}
		}
	}
}
