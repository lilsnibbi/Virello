export interface ExampleShardStats {
	shard: number;
	pid: number;
	guilds: number;
	uptimeSeconds: number;
	memoryMb: number;
	ready: boolean;
	commands: string[];
}

declare module "virello" {
	interface ShardRequests {
		exampleStats: { input: null; output: ExampleShardStats };
	}
}
