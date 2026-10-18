import { describe, expect, test } from "bun:test";
import { noop } from "../../../src/utilities/index";

describe("noop", () => {
	test("GIVEN noop THEN has undefined return type", () => {
		expect(noop()).toBeUndefined();
	});
});
