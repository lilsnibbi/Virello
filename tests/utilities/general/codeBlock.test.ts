import { describe, expect, test } from "bun:test";
import { codeBlock } from "../../../src/utilities/index";

const zeroWidthSpace = String.fromCharCode(8203);

describe("codeBlock", () => {
	test("GIVEN expression w/o length THEN returns wrapped ZeroWidthSpace", () => {
		expect(codeBlock("md", "")).toStrictEqual(`\`\`\`md

\`\`\``);
	});

	test("GIVEN expression w/ length THEN returns expressed wrapped in markdown", () => {
		expect(codeBlock("md", "# Header")).toStrictEqual(`\`\`\`md
# Header
\`\`\``);
	});

	test("GIVEN expression w/ length w/ inner code block THEN returns expressed wrapped in markdown", () => {
		expect<unknown>(
			codeBlock(
				"md",
				`
			# Header
			\`\`\`js
				if (isEnabled) return 'awesome!';
			\`\`\`
		`,
			),
		).toStrictEqual(
			`\`\`\`md

			# Header
			\`${zeroWidthSpace}\`\`js
				if (isEnabled) return 'awesome!';
			\`\`\`
		
\`\`\``,
		);
	});

	test("GIVEN expression w/ length w/ inner inline code block THEN returns expressed wrapped in markdown", () => {
		expect(
			codeBlock(
				"md",
				`
			# Header
			\`const isEnabled = true\`
		`,
			),
		).toStrictEqual(`\`\`\`md

			# Header
			\`const isEnabled = true\`
		
\`\`\``);
	});

	test("GIVEN expression of non-string type THEN returns wrapped expression", () => {
		// @ts-expect-error Checking for invalid input
		expect(codeBlock("md", 123456789)).toStrictEqual(`\`\`\`md
123456789
\`\`\``);
	});

	test("GIVEN expression of falsey type THEN returns wrapped expression", () => {
		// @ts-expect-error Checking for invalid input
		expect(codeBlock("md", false)).toStrictEqual(`\`\`\`md
false
\`\`\``);
	});
});
