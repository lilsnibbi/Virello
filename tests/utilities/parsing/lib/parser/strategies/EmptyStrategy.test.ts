import { describe, expect, test } from "bun:test";
import {
	EmptyStrategy,
	type IUnorderedStrategy,
} from "../../../../../../packages/util/src/parsing/index";
import { Option } from "../../../../../../packages/util/src/result/index";

describe("EmptyStrategy", () => {
	const strategy: IUnorderedStrategy = new EmptyStrategy();

	describe("matchFlag", () => {
		test("GIVEN any value THEN returns none", () => {
			expect(strategy.matchFlag("foo")).toEqual(Option.none);
		});
	});

	describe("matchOption", () => {
		test("GIVEN any value THEN returns none", () => {
			expect(strategy.matchOption("foo")).toEqual(Option.none);
		});
	});
});
