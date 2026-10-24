import { describe, expect, test } from "bun:test";
import { noop } from "../../../packages/util/src/general";

describe("noop", () => {
	test("GIVEN noop THEN has undefined return type", () => {
		expect(noop()).toBeUndefined();
	});
});
