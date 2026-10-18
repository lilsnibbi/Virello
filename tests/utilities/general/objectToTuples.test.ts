import { describe, expect, test } from "bun:test";
import { objectToTuples } from "../../../src/utilities/index";

describe("objectToTuples", () => {
	test("GIVEN basic THEN returns expected", () => {
		const source = { a: "Hello", b: 420 };
		const expected = [
			["a", "Hello"],
			["b", 420],
		] as [string, unknown][];

		expect<unknown>(objectToTuples(source)).toEqual(expected);
	});

	test("GIVEN deep THEN returns expected", () => {
		const source = { a: "Hello", b: 420, deep: { i: [] } };
		const expected = [
			["a", "Hello"],
			["b", 420],
			["deep.i", []],
		] as [string, unknown][];

		expect<unknown>(objectToTuples(source)).toEqual(expected);
	});
});
