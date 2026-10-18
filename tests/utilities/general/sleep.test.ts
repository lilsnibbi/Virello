import { describe, expect, jest, test } from "bun:test";
import { sleep } from "../../../src/utilities/index";

describe("sleep", () => {
	test("GIVEN a number of ms THEN resolve the promise after that time", async () => {
		// Exercise Bun timers directly.
		const start = Date.now();
		const result = sleep(50);

		await expect<Promise<undefined>>(result).resolves.toBe(undefined);
		expect(Date.now() - start).toBeGreaterThanOrEqual(45);
		jest.setSystemTime();
	});

	test("GIVEN a number of ms and a value THEN resolve the promise after that time with the value", async () => {
		// Exercise Bun timers directly.
		const start = Date.now();
		const result = sleep(50, "test");

		await expect<Promise<string>>(result).resolves.toBe("test");
		expect(Date.now() - start).toBeGreaterThanOrEqual(45);
		jest.setSystemTime();
	});

	test("GIVEN an aborted signal THEN the promise rejects without a timeout", async () => {
		const signal = AbortSignal.abort();
		const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");
		const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");
		const promise = sleep(50, undefined, { signal });

		await expect(promise).rejects.toMatchObject({ name: "AbortError" });
		expect(setTimeoutSpy).toHaveBeenCalledTimes(0);
		expect(clearTimeoutSpy).toHaveBeenCalledTimes(0);
	});

	test("GIVEN an immediately aborted signal THEN the promise rejects", async () => {
		const controller = new AbortController();
		const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout");
		const clearTimeoutSpy = jest.spyOn(globalThis, "clearTimeout");
		const promise = sleep(50, undefined, { signal: controller.signal });
		controller.abort();

		await expect(promise).rejects.toMatchObject({ name: "AbortError" });
		expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
		expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
	});

	test("GIVEN an immediately aborted signal with a reason THEN reject the promise with the reason as cause", async () => {
		const controller = new AbortController();
		const promise = sleep(50, undefined, { signal: controller.signal });
		controller.abort("Too late!");
		await expect(promise).rejects.toStrictEqual("Too late!");
	});
});
