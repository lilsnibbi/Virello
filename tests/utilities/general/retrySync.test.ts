import { describe, expect, jest, test } from "bun:test";
import { retrySync } from "../../../src/utilities/index";

describe("retry", () => {
	test("GIVEN a simple string return THEN returns the same on first attempt", () => {
		const mockFunction = jest.fn().mockReturnValue("test");
		const result = retrySync(mockFunction, 3);

		expect(result).toBe("test");
		expect(mockFunction).toBeCalledTimes(1);
	});

	test("GIVEN a twice failing function THEN returns the third result", () => {
		let counter = 0;
		const cb = () => {
			if (counter < 2) {
				++counter;
				throw new Error("💣💥");
			}

			return "success!";
		};
		const mockFunction = jest.fn(cb);

		const result = retrySync(mockFunction, 3);

		expect(result).toBe("success!");
		expect(counter).toBe(2);
		expect(mockFunction).toBeCalledTimes(3);
	});

	test("GIVEN a thrice failing function WHEN retries is lower THEN returns throws the last error", () => {
		let counter = 0;
		const cb = () => {
			if (counter < 2) {
				++counter;
				throw new Error("💣💥");
			}

			return "success!";
		};
		const mockFunction = jest.fn().mockImplementation(cb);

		expect(() => retrySync(mockFunction, 2)).toThrowError(Error("💣💥"));
		expect(counter).toBe(2);
		expect(mockFunction).toBeCalledTimes(2);
	});

	test("GIVEN 0 retries THEN returns result", () => {
		const mockFunction = jest.fn().mockReturnValue("test");
		const result = retrySync(mockFunction, 0);

		expect(result).toBe("test");
		expect(mockFunction).toBeCalledTimes(1);
	});

	test("GIVEN retries below 1 THEN throws", () => {
		const mockFunction = jest.fn().mockReturnValue("test");
		expect(() => retrySync(mockFunction, -1)).toThrowError(
			RangeError("Expected retries to be a number >= 0"),
		);
		expect(mockFunction).toBeCalledTimes(0);
	});
});
