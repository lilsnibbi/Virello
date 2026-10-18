import { describe, expect, test } from "bun:test";
import { mergeObjects } from "../../../src/utilities/index";

describe("mergeObjects", () => {
	test("merges prototype-named JSON keys without changing prototypes", () => {
		const source = JSON.parse(
			'{"__proto__":{"virelloMergePolluted":true},"constructor":{"prototype":{"safe":true}}}',
		);
		const target = {};
		try {
			mergeObjects(target, source);
			expect(Object.hasOwn(Object.prototype, "virelloMergePolluted")).toBe(
				false,
			);
			expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
			expect(Object.hasOwn(target, "__proto__")).toBe(true);
			expect(target).toEqual(source);
		} finally {
			Reflect.deleteProperty(Object.prototype, "virelloMergePolluted");
		}
	});

	test("does not merge into inherited objects", () => {
		const inherited = { settings: { original: true } };
		const target = Object.create(inherited);
		mergeObjects(target, { settings: { added: true } });
		expect(inherited.settings).toEqual({ original: true });
		expect(target.settings).toEqual({ added: true });
	});

	test("GIVEN basic THEN returns expected", () => {
		const source = { a: 0, b: 1 };
		const target = {};
		expect(mergeObjects(target, source)).toEqual({ a: 0, b: 1 });
	});

	test("GIVEN mutation THEN returns expected", () => {
		expect.assertions(2);

		const source = { a: 0, b: 1 };
		const target = {};
		mergeObjects(target, source);

		expect(source).toEqual({ a: 0, b: 1 });
		expect(target).toEqual({ a: 0, b: 1 });
	});

	test("GIVEN clone THEN returns expected", () => {
		const source = { a: 0, b: 1 };
		const target = {};
		expect(mergeObjects(target, source)).toEqual({ a: 0, b: 1 });
	});

	test("GIVEN partial THEN returns expected", () => {
		const source = { a: 0, b: 1 };
		const target = { a: 2 };
		expect(mergeObjects(target, source)).toEqual({ a: 0, b: 1 });
	});

	test("GIVEN extended THEN returns expected", () => {
		const source = { a: 0, b: 1 };
		const target = { a: 2, i: 2 };
		expect(mergeObjects(target, source)).toEqual({ a: 0, i: 2, b: 1 });
	});

	test("GIVEN deep THEN returns expected", () => {
		const source = { a: 0 };
		const target = { b: { i: 4 } };
		expect(mergeObjects(target, source)).toEqual({ a: 0, b: { i: 4 } });
	});

	test("GIVEN deep-replace THEN returns expected", () => {
		const source = { a: { i: 4 } };
		const target = { a: 0 };
		expect<unknown>(mergeObjects(target, source)).toEqual({ a: { i: 4 } });
	});

	test("GIVEN deep-merge THEN returns expected", () => {
		const source = { a: { b: 1 } };
		const target = { a: { i: 1 } };
		expect(mergeObjects(target, source)).toEqual({ a: { b: 1, i: 1 } });
	});

	test("GIVEN deep-type-mismatch THEN returns expected", () => {
		const source = { a: 0 };
		const target = { a: { b: 1 } };
		expect<unknown>(mergeObjects(target, source)).toEqual({ a: { b: 1 } });
	});
});
