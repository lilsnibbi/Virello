import { describe, expect, test } from "bun:test";
import { URL } from "node:url";
import { resolveHyperlink } from "../../../src/commands/arguments/resolvers/hyperlink";
import { Identifiers } from "../../../src/commands/errors/Identifiers";
import { Result } from "../../../src/utilities/result/index";

const STRING_URL = "https://example.com";
const PARSED_URL = new URL(STRING_URL);

describe("Hyperlink resolver tests", () => {
	test("GIVEN a valid hyperlink THEN returns its parsed value", () => {
		expect(resolveHyperlink(STRING_URL)).toEqual(Result.ok(PARSED_URL));
	});
	test("GIVEN an invalid hyperlink THEN returns error", () => {
		expect(resolveHyperlink("hello")).toEqual(
			Result.err(Identifiers.ArgumentHyperlinkError),
		);
	});
});
