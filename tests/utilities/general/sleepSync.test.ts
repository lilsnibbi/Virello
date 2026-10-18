import { describe, expect, jest, test } from "bun:test";
import { sleepSync } from "../../../src/utilities/index";

describe("sleepSync", () => {
	test("GIVEN a number of ms THEN return after that time", () => {
		jest
			.spyOn(Date, "now") //
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(25)
			.mockReturnValueOnce(50)
			.mockReturnValueOnce(50);

		expect<undefined>(sleepSync(50)).toBe(undefined);
		expect(Date.now()).toBe(50);
	});

	test("GIVEN a number of ms and a value THEN return after that time with the value", () => {
		jest
			.spyOn(Date, "now") //
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(50)
			.mockReturnValueOnce(50);

		expect<string>(sleepSync(50, "test")).toBe("test");
		expect(Date.now()).toBe(50);
	});
});
