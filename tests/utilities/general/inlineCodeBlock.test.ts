import { describe, expect, test } from "bun:test";
import { inlineCodeBlock } from "../../../src/utilities/index";

describe("inlineCodeblock", () => {
	test("GIVEN text THEN converts to inline codeblock", () => {
		expect<unknown>(inlineCodeBlock("const isEnabled = true")).toEqual(
			"`const isEnabled = true`",
		);
	});
});
