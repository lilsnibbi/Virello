import { describe, expect, test } from "bun:test";
import { mergeDefault } from "../../../src/utilities/index";

describe("mergeDefault", () => {
	test("applies prototype-named JSON defaults without changing prototypes", () => {
		const base = JSON.parse('{"__proto__":{"virelloDefaultPolluted":true}}');
		const overwrites = {};
		try {
			mergeDefault(base, overwrites);
			expect(Object.hasOwn(Object.prototype, "virelloDefaultPolluted")).toBe(
				false,
			);
			expect(Object.getPrototypeOf(overwrites)).toBe(Object.prototype);
			expect(Object.hasOwn(overwrites, "__proto__")).toBe(true);
			expect(overwrites).toEqual(base);
		} finally {
			Reflect.deleteProperty(Object.prototype, "virelloDefaultPolluted");
		}
	});

	test("does not treat inherited properties as supplied overrides", () => {
		const inherited = { settings: { original: true } };
		const overwrites = Object.create(inherited);
		mergeDefault({ settings: { added: true }, toString: "label" }, overwrites);
		expect(inherited.settings).toEqual({ original: true });
		expect(overwrites.settings).toEqual({ added: true });
		expect(overwrites.toString).toBe("label");
	});

	test("GIVEN empty overwrites THEN returns base", () => {
		const base = { a: 0, b: 1 };
		const overwrites = {};
		expect(mergeDefault(base, overwrites)).toStrictEqual(base);
	});

	test("GIVEN empty overwrites THEN returns mutates overwrites", () => {
		const base = { a: 0, b: 1 };
		const overwrites = {};

		mergeDefault(base, overwrites);

		expect(base).toStrictEqual({ a: 0, b: 1 });
		expect(overwrites).toStrictEqual({ a: 0, b: 1 });
	});

	test("GIVEN different key date values THEN returns same dates all keys", () => {
		interface TestObject {
			dateTime?: Date;
			timeDate?: Date;
		}

		const base: TestObject = { dateTime: new Date("1995-02-21T12:45:00.000Z") };
		const overwrites: TestObject = {
			timeDate: new Date("2002-03-30T15:28:00.000Z"),
		};

		mergeDefault(base, overwrites);

		expect(base).toStrictEqual({
			dateTime: new Date("1995-02-21T12:45:00.000Z"),
		});
		expect(overwrites).toStrictEqual({
			dateTime: new Date("1995-02-21T12:45:00.000Z"),
			timeDate: new Date("2002-03-30T15:28:00.000Z"),
		});
	});

	test("GIVEN undefined overwrites THEN returns clones base", () => {
		const base = { a: 0, b: 1 };
		expect(mergeDefault(base)).toStrictEqual({ a: 0, b: 1 });
	});

	test("GIVEN partial overwrites THEN returns merged object", () => {
		const base = { a: 0, b: 1 };
		const overwrites = { a: 2 };
		expect(mergeDefault(base, overwrites)).toStrictEqual({ a: 2, b: 1 });
	});

	test("GIVEN extended overwrites THEN returns merged object", () => {
		const base = { a: 0, b: 1 };
		const overwrites = { a: 2, i: 3 };
		expect(mergeDefault(base, overwrites)).toStrictEqual({ a: 2, i: 3, b: 1 });
	});

	test("GIVEN partial-null overwrites THEN returns null plus base keys", () => {
		interface Sample {
			a: null | number;
			b: number;
		}

		const base: Sample = { a: 0, b: 1 };
		const overwrites: Partial<Sample> = { a: null };
		expect<unknown>(mergeDefault(base, overwrites)).toStrictEqual({
			a: null,
			b: 1,
		});
	});

	test("GIVEN partial-undefined overwrites THEN returns base value plus base keys", () => {
		const base = { a: 0, b: 1 };
		const overwrites = { a: undefined };
		expect<unknown>(mergeDefault(base, overwrites)).toStrictEqual({
			a: 0,
			b: 1,
		});
	});

	test("GIVEN deep object THEN returns all keys", () => {
		const base = { a: { b: 1 } };
		const overwrites = { a: { b: 2 } };
		expect(mergeDefault(base, overwrites)).toStrictEqual({ a: { b: 2 } });
	});

	test("GIVEN partial-null base and provided overwrites THEN returns overwrites values", () => {
		interface Sample {
			a: null | { b: number };
		}

		const base: Sample = { a: null };
		const overwrites: Sample = { a: { b: 5 } };

		expect(mergeDefault(base, overwrites)).toStrictEqual({ a: { b: 5 } });
	});

	test("GIVEN defined base and provided overwrites THEN returns overwrites values", () => {
		interface Sample {
			a: number | { b: boolean };
		}

		const base: Sample = { a: 1 };
		const overwrites: Sample = { a: { b: true } };

		expect(mergeDefault(base, overwrites)).toStrictEqual({ a: { b: true } });
	});
});
