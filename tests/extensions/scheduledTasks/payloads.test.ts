import { expect, test } from "bun:test";
import { clonePayload } from "../../../src/extensions/scheduledTasks/timing";

test("task payloads reject object and array accessors without invoking them", () => {
	let reads = 0;
	const getter = () => {
		reads++;
		return reads === 1 ? 1 : Number.NaN;
	};
	const object = Object.defineProperty({}, "value", {
		enumerable: true,
		get: getter,
	});
	const array = Object.defineProperty([0], "0", {
		enumerable: true,
		get: getter,
	});
	expect(() => clonePayload(object)).toThrow("JSON");
	expect(() => clonePayload(array)).toThrow("JSON");
	expect(reads).toBe(0);
});

test("task payloads reject fields that JSON serialization would discard", () => {
	const symbol = { [Symbol("hidden")]: "lost" };
	const hidden = Object.defineProperty({}, "hidden", { value: "lost" });
	const array = Object.assign([1], { label: "lost" });
	for (const value of [symbol, hidden, array])
		expect(() => clonePayload(value)).toThrow("JSON");
});

test("task payloads preserve nested JSON, shared values and null-prototype data without sharing references", () => {
	const shared = { empty: [], value: 3 };
	const payload = Object.assign(Object.create(null), {
		a: shared,
		b: shared,
		values: [null, true, "text"],
	});
	const copy = clonePayload(payload);
	expect(copy).toEqual(JSON.parse(JSON.stringify(payload)));
	expect(copy.a).not.toBe(shared);
	expect(copy.b).not.toBe(copy.a);
	expect(clonePayload(undefined)).toBeUndefined();
});
