import { describe, expect, test } from "bun:test";
import { objectKeys } from "../../../src/utilities/index";

describe("objectKeys", () => {
	test("GIVEN basic readonly THEN returns expected", () => {
		const source = { a: "Hello", b: 420 } as const;
		const expected = ["a", "b"];

		expect<unknown>(objectKeys(source)).toEqual(expected);
	});

	test("GIVEN deep readonly THEN returns expected", () => {
		const source = { a: "Hello", b: 420, deep: { i: [] } } as const;
		const expected = ["a", "b", "deep"];

		expect<unknown>(objectKeys(source)).toEqual(expected);
	});

	test("GIVEN array readonly THEN returns expected", () => {
		const source = ["Hello", 420] as const;
		const expected = ["0", "1"];

		expect<unknown>(objectKeys(source)).toEqual(expected);
	});

	test("GIVEN basic THEN returns expected", () => {
		const source = { a: "Hello", b: 420 };
		const expected = ["a", "b"];

		expect<unknown>(objectKeys(source)).toEqual(expected);
	});

	test("GIVEN deep THEN returns expected", () => {
		const source = { a: "Hello", b: 420, deep: { i: [] } };
		const expected = ["a", "b", "deep"];

		expect<unknown>(objectKeys(source)).toEqual(expected);
	});

	test("GIVEN array THEN returns expected", () => {
		const source = ["Hello", 420];
		const expected = ["0", "1"];

		expect<unknown>(objectKeys(source)).toEqual(expected);
	});
});
