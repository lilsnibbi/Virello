import { expectTypeOf } from "expect-type";
import type {
	ShardStats as CategoryStats,
	ShardStatsResult as CategoryStatsResult,
} from "virello/sharding";
import type {
	Container,
	VirelloClient,
	ShardManager,
	ShardResult,
	ShardStats,
	ShardStatsResult,
} from "../../src/index";

expectTypeOf<ShardStats>().toEqualTypeOf<CategoryStats>();
expectTypeOf<ShardStatsResult>().toEqualTypeOf<CategoryStatsResult>();
expectTypeOf<Container["sharding"]>().toEqualTypeOf<
	VirelloClient["sharding"]
>();

declare module "virello" {
	interface ShardRequests {
		typedExample: { input: { count: number }; output: string };
	}
}
export function verifyShardingTypes(
	client: VirelloClient,
	manager: ShardManager,
) {
	expectTypeOf(
		client.sharding.request(0, "typedExample", { count: 1 }),
	).toEqualTypeOf<Promise<string>>();
	expectTypeOf(manager.broadcast("typedExample", { count: 1 })).toEqualTypeOf<
		Promise<ShardResult<string>[]>
	>();
	expectTypeOf(client.sharding.stats()).toEqualTypeOf<
		Promise<ReadonlyMap<number, ShardStatsResult>>
	>();
	expectTypeOf(manager.stats(0)).toEqualTypeOf<
		Promise<ReadonlyMap<number, ShardStatsResult>>
	>();
	client.sharding.handle("typedExample", (input, context) => {
		expectTypeOf(input.count).toEqualTypeOf<number>();
		expectTypeOf(context.source).toEqualTypeOf<number | null>();
		return String(input.count);
	});
	// @ts-expect-error Contract rejects wrong input.
	void client.sharding.request(0, "typedExample", { count: "bad" });
	// @ts-expect-error Contract rejects wrong handler output.
	client.sharding.handle("typedExample", () => 1);
	// @ts-expect-error No dynamic eval broadcast API.
	void client.sharding.broadcastEval;
}

export function verifyReadonlyStats(
	results: ReadonlyMap<number, ShardStatsResult>,
) {
	// @ts-expect-error The map has no mutators.
	results.clear();
	const result = results.get(0);
	if (!result) return;
	// @ts-expect-error Entries are read-only too.
	result.shard = 1;
	if (result.ok) {
		expectTypeOf(result.value).toEqualTypeOf<ShardStats>();
		// @ts-expect-error Samples are read-only.
		result.value.guilds = 5;
		// @ts-expect-error Nested memory data is read-only.
		result.value.memory.rss = 5;
		// @ts-expect-error Success entries have no error.
		void result.error;
	} else {
		// @ts-expect-error Failure entries contain no invented sample.
		void result.value;
		// @ts-expect-error Errors are read-only.
		result.error.message = "changed";
	}
}
