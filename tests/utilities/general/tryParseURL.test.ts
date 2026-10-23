import { describe, expect, test } from "bun:test";
import { URL } from "node:url";
import { tryParseURL } from "../../../packages/util/src/general";

describe("tryParseURL", () => {
	test("GIVEN valid URL THEN returns URL", () => {
		expect(tryParseURL("https://skyra.pw")).toStrictEqual(
			new URL("https://skyra.pw"),
		);
	});

	test("GIVEN invalid url THEN returns null", () => {
		expect(tryParseURL("thisisnotaurl")).toBeNull();
	});
});
