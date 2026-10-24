const privateKey =
	/token|secret|password|authorization|credential|api[_-]?key|cookie|session|headers?|body|payload|content|prompt|arguments?|response|email|username|webhook|connectionstring|databaseurl|redisurl/i;
const tokenCount = /^(?:inputTokens|outputTokens|totalTokens|tokenCount)$/i;
const maximumString = 320;

/** Never call metadata getters or toJSON, including while inspecting an error. */
export function dataProperty(value: object, key: string): unknown {
	let current: object | null = value;
	for (let depth = 0; current && depth < 5; depth++) {
		const descriptor = Object.getOwnPropertyDescriptor(current, key);
		if (descriptor) return "value" in descriptor ? descriptor.value : undefined;
		current = Object.getPrototypeOf(current);
	}
	return undefined;
}

/** A backstop for diagnostic text; callers should still pass fixed operational messages. */
export function safeText(
	value: string,
	secrets: readonly string[] = [],
	limit = maximumString,
): string {
	let text = value
		.slice(0, 16_384)
		// eslint-disable-next-line no-control-regex -- strip terminal escapes before secret matching
		.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(
			// eslint-disable-next-line no-control-regex -- keep only newlines/tabs to escape below
			/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,
			"",
		);
	for (const secret of secrets) {
		if (secret.length >= 6) {
			text = text.replaceAll(secret, "[REDACTED]");
			try {
				text = text.replaceAll(encodeURIComponent(secret), "[REDACTED]");
			} catch {
				/* Ill-formed UTF-16 still receives exact-value redaction. */
			}
		}
	}
	text = text
		.replace(
			/(?:https?|wss?|redis|rediss|postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s<>"']+/gi,
			(url) => {
				try {
					const parsed = new URL(url);
					return /^(?:https?|wss?):$/.test(parsed.protocol)
						? parsed.origin
						: "[REDACTED_URL]";
				} catch {
					return "[REDACTED_URL]";
				}
			},
		)
		.replace(/\b(?:Bot|Bearer)\s+[^\s,;]+/gi, "[REDACTED_AUTH]")
		.replace(
			/\/(?:api\/(?:v\d+\/)?)?(?:webhooks|interactions)\/[^\s<>"'|]+/gi,
			"/[REDACTED_ROUTE]",
		)
		.replace(/(\/[^\s<>"'?|]+)\?[^\s<>"'|]+/g, "$1?[REDACTED_QUERY]")
		.replace(
			/\b(?:mfa\.[\w-]{20,}|[\w-]{20,}\.[\w-]{6,}\.[\w-]{20,})\b/g,
			"[REDACTED_TOKEN]",
		)
		.replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[REDACTED_EMAIL]")
		.replace(
			/\b(token|secret|password|authorization|cookie|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
			"$1=[REDACTED]",
		)
		.replace(/\r/g, "\\r")
		.replace(/\n|\u2028|\u2029/g, "\\n")
		.replace(/\t/g, "\\t");
	return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

/** One shared budget bounds the entire context, rather than each recursive object. */
export function safeContext(
	value: unknown,
	secrets: readonly string[] = [],
): Record<string, unknown> {
	let budget = 1536;
	let nodes = 0;
	const seen = new Set<object>();
	const visit = (item: unknown, depth: number): unknown => {
		if (++nodes > 80 || budget <= 0) return "[Truncated]";
		if (item === null || typeof item === "boolean") return item;
		if (typeof item === "number")
			return Number.isFinite(item) ? item : String(item);
		if (typeof item === "bigint") return safeText(String(item), secrets, 64);
		if (typeof item === "string") {
			const text = safeText(
				item,
				secrets,
				Math.max(3, Math.min(maximumString, budget)),
			);
			budget -= text.length;
			return text;
		}
		if (!item || typeof item !== "object") return undefined;
		if (seen.has(item)) return "[Circular]";
		if (depth >= 3) return "[Truncated]";
		seen.add(item);
		try {
			if (Array.isArray(item)) {
				const length = dataProperty(item, "length") as number;
				const result = [];
				for (
					let index = 0;
					index < Math.min(length, 8) && budget > 0 && nodes < 80;
					index++
				)
					result.push(
						visit(dataProperty(item, String(index)), depth + 1) ?? null,
					);
				if (length > result.length) result.push("[Truncated]");
				return result;
			}
			const result: Record<string, unknown> = Object.create(null);
			let count = 0;
			const keys = Object.keys(item);
			const priority =
				depth === 0
					? [
							"requestId",
							"traceId",
							"connectionId",
							"routeId",
							"destinationConnectionId",
							"generation",
							"shard",
							"host",
							"command",
							"module",
							"task",
							"guildId",
						].filter((key) => keys.includes(key))
					: [];
			for (const key of [
				...priority,
				...keys.filter((key) => !priority.includes(key)),
			]) {
				if (count++ >= 24 || budget <= 0 || nodes >= 80) {
					result.truncated = true;
					break;
				}
				const descriptor = Object.getOwnPropertyDescriptor(item, key);
				if (!descriptor || !("value" in descriptor)) continue;
				const name = safeText(key, secrets, 64);
				budget -= name.length;
				const child =
					privateKey.test(key) &&
					!(tokenCount.test(key) && typeof descriptor.value === "number")
						? "[REDACTED]"
						: visit(descriptor.value, depth + 1);
				if (child !== undefined) result[name] = child;
			}
			return result;
		} catch {
			return "[Unavailable]";
		}
	};
	const result = visit(value, 0);
	return result && typeof result === "object" && !Array.isArray(result)
		? (result as Record<string, unknown>)
		: {};
}
