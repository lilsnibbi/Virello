import type { ShardStats } from "virello/sharding";

export type StatsReply =
	| { shard: number; ok: true; value: ShardStats }
	| { shard: number; ok: false; error: { code: string; message: string } };

declare module "virello" {
	interface ShardRequests {
		statsRead: {
			input: { shard: number | null };
			output: [number, StatsReply][];
		};
		statsUpdate: {
			input: {
				guilds: number;
				ready: boolean;
				delayMs?: number;
				invalid?: boolean;
			};
			output: null;
		};
		statsSamples: { input: null; output: number };
		probe: {
			input: { value: number };
			output: {
				shard: number;
				pid: number;
				value: number;
				source: number | null;
			};
		};
		relay: {
			input: { target: number; value: number };
			output: {
				shard: number;
				pid: number;
				value: number;
				source: number | null;
			};
		};
		all: { input: null; output: number[] };
		fail: { input: null; output: null };
		slow: { input: { ms: number }; output: string };
		abortCount: { input: null; output: number };
		crash: { input: null; output: null };
		identify: { input: null; output: { at: number; hooked: boolean } };
		loginState: { input: null; output: boolean };
		oversized: { input: null; output: string };
		lossy: { input: null; output: unknown };
		hung: { input: null; output: null };
	}
}

export {};
