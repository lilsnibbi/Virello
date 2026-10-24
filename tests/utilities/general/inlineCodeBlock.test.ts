import { describe, expect, test } from "bun:test";
import { inlineCodeBlock } from "../../../packages/util/src/general";

describe("inlineCodeblock", () => {
	test("GIVEN text THEN converts to inline codeblock", () => {
		expect<unknown>(inlineCodeBlock("const isEnabled = true")).toEqual(
			"`const isEnabled = true`",
		);
	});
});
