import { describe, expect, jest, test } from "bun:test";
import { lazy } from "../../../src/utilities/index";

describe("lazy", () => {
	test("GIVEN string callback THEN returns the same", () => {
		const callback = jest.fn(() => "Lorem Ipsum");

		const lazyStoredValue = lazy(callback);

		expect(lazyStoredValue()).toEqual("Lorem Ipsum");
	});

	test("GIVEN string callback with cached value THEN returns the same", () => {
		const callback = jest.fn(() => "Lorem Ipsum");

		const lazyStoredValue = lazy(callback);

		lazyStoredValue();
		const cachedValue = lazyStoredValue();

		expect(callback).toHaveBeenCalledTimes(1);
		expect(cachedValue).toEqual("Lorem Ipsum");
	});
});
