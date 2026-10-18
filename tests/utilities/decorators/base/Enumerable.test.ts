import { describe, expect, test } from "bun:test";
import { Enumerable } from "../../../../src/utilities/decorators/index";

describe("enumerable", () => {
	test("GIVEN enumerable=false THEN should not be enumerable", () => {
		class Sample {
			@Enumerable(false)
			public name = "name";
		}

		expect<unknown>(Sample.prototype).toEqual({});
	});

	test("GIVEN enumerable=true THEN should be enumerable", () => {
		class AnotherSample {
			@Enumerable(true)
			public name = "name";
		}

		expect<unknown>(AnotherSample.prototype).toEqual({ name: undefined });
	});
});
