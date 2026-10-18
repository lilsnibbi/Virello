import { describe, expect, jest, test } from "bun:test";
import { EventEmitter } from "node:events";
import { EventIterator } from "../../../../src/utilities/async/events/index";

describe("EventIterator cleanup", () => {
	test("ignores an event captured before another listener ended the iterator", async () => {
		const emitter = new EventEmitter();
		emitter.on("value", () => iterator.end());
		const iterator = new EventIterator<[number]>(emitter, "value");
		const pending = iterator.next();
		emitter.emit("value", 7);
		expect(await pending).toEqual({ done: true, value: undefined });
		expect(await iterator.next()).toEqual({ done: true, value: undefined });
	});

	test("ending resolves pending reads and removes every listener", async () => {
		const emitter = new EventEmitter();
		const iterator = new EventIterator<[number]>(emitter, "value");
		const pending = [iterator.next(), iterator.next()];
		iterator.end();
		expect(emitter.listenerCount("value")).toBe(0);
		expect(await Promise.all(pending)).toEqual([
			{ done: true, value: undefined },
			{ done: true, value: undefined },
		]);
	});

	test("idle expiry settles waiting reads and removes their listeners", async () => {
		jest.useFakeTimers();
		const emitter = new EventEmitter();
		const iterator = new EventIterator<[number]>(emitter, "value", {
			idle: 50,
		});
		const pending = iterator.next();
		jest.advanceTimersByTime(50);
		expect(emitter.listenerCount("value")).toBe(0);
		expect(await pending).toEqual({ done: true, value: undefined });
	});

	test("reaching the limit resolves other pending readers without reactivating the idle timer", async () => {
		jest.useFakeTimers();
		const emitter = new EventEmitter();
		const iterator = new EventIterator<[number]>(emitter, "value", {
			idle: 50,
			limit: 1,
		});
		const first = iterator.next();
		const second = iterator.next();
		emitter.emit("value", 7);
		expect(await first).toEqual({ done: false, value: [7] });
		expect(await second).toEqual({ done: true, value: undefined });
		expect(jest.getTimerCount()).toBe(0);
		expect(emitter.listenerCount("value")).toBe(0);
	});

	test("concurrent readers consume separate events and stop cleanly", async () => {
		const emitter = new EventEmitter();
		const iterator = new EventIterator<[number]>(emitter, "value");
		const first = iterator.next();
		const second = iterator.next();
		emitter.emit("value", 1);
		emitter.emit("value", 2);
		expect(await first).toEqual({ done: false, value: [1] });
		expect(await second).toEqual({ done: false, value: [2] });
		iterator.end();
		expect(emitter.listenerCount("value")).toBe(0);
	});
});
