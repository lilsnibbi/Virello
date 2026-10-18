import { describe, expect, test } from "bun:test";
import { EnumerableMethod } from "../../../../src/utilities/decorators/index";

describe("enumerable", () => {
	test("GIVEN enumerable=false THEN should not be enumerable", () => {
		class Sample {
			@EnumerableMethod(false)
			public getName() {
				return "name";
			}
		}

		expect<unknown>(Sample.prototype).toEqual({});
	});

	test("GIVEN enumerable=true THEN should be enumerable", () => {
		class AnotherSample {
			@EnumerableMethod(true)
			public getName() {
				return "name";
			}
		}

		expect(AnotherSample.prototype).toEqual({ getName: expect.any(Function) });
	});
});
