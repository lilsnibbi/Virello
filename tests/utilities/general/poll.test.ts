import { describe, expect, jest, test } from "bun:test";
import { poll } from "../../../src/utilities/index";

describe("poll", () => {
	const pass = "success!";
	const fail = "fail!";
	const cbRaw = () => pass;
	const cbConditionRaw = (result: string) => result === pass;

	test("GIVEN a poll with no retries THEN returns first attempt", async () => {
		const cb = jest.fn(() => pass);
		const cbCondition = jest.fn(cbConditionRaw);
		const result = poll(cb, cbCondition, { maximumRetries: 0 });

		await expect(result).resolves.toBe(pass);
		expect(cb).toBeCalledTimes(1);
		expect(cb).toHaveBeenCalledWith(undefined);
		expect(cbCondition).toBeCalledTimes(0);
	});

	test("GIVEN a function that fails twice then succeeds THEN calls that function thrice", async () => {
		const cb = jest
			.fn<() => string>() //
			.mockReturnValueOnce(fail)
			.mockReturnValueOnce(fail)
			.mockReturnValueOnce(pass);
		const cbCondition = jest.fn(cbConditionRaw);
		const result = poll(cb, cbCondition);

		await expect(result).resolves.toBe(pass);
		expect(cb).toBeCalledTimes(3);
		expect(cbCondition).toBeCalledTimes(3);
	});

	describe("signal", () => {
		test("GIVEN an AbortSignal that is aborted before the first call THEN throws", async () => {
			const cb = jest.fn(cbRaw);
			const cbCondition = jest.fn(cbConditionRaw);
			const result = poll(cb, cbCondition, { signal: AbortSignal.abort() });

			await expect(result).rejects.toMatchObject({ name: "AbortError" });
			expect(cb).toBeCalledTimes(0);
			expect(cbCondition).toBeCalledTimes(0);
		});

		test("GIVEN an AbortSignal that is aborted in the condition THEN throws without retry", async () => {
			const controller = new AbortController();
			const cb = jest.fn(() => fail);
			const cbCondition = jest.fn((result: string) => {
				controller.abort();
				return result === pass;
			});
			const result = poll(cb, cbCondition, { signal: controller.signal });

			await expect(result).rejects.toMatchObject({ name: "AbortError" });
			expect(cb).toBeCalledTimes(1);
			expect(cbCondition).toBeCalledTimes(1);
		});
	});

	describe("maximumRetries", () => {
		const cb = () => pass;

		test.each([undefined, null, 0, 5, Infinity])(
			"GIVEN %j THEN passes validation",
			async (maximumRetries) => {
				const result = poll(cb, cbConditionRaw, { maximumRetries });
				await expect(result).resolves.toBe(pass);
			},
		);

		test.each(["foo", true])(
			"GIVEN %j THEN throws TypeError",
			async (maximumRetries) => {
				// @ts-expect-error invalid type
				const result = poll(cb, cbConditionRaw, { maximumRetries });
				await expect(result).rejects.toStrictEqual(
					new TypeError("Expected maximumRetries to be a number"),
				);
			},
		);

		test.each([NaN, -NaN, -Infinity, -5])(
			"GIVEN %j THEN throws RangeError",
			async (maximumRetries) => {
				const result = poll(cb, cbConditionRaw, { maximumRetries });
				await expect(result).rejects.toStrictEqual(
					new RangeError("Expected maximumRetries to be a non-negative number"),
				);
			},
		);

		test("GIVEN a poll with only one retry and fails both THEN calls that function twice, but condition only once", async () => {
			const cb = jest
				.fn<() => string>() //
				.mockReturnValueOnce(fail)
				.mockReturnValueOnce(fail);
			const cbCondition = jest.fn((result: string) => result === pass);
			const result = poll(cb, cbCondition, { maximumRetries: 1 });

			await expect(result).resolves.toBe(fail);
			expect(cb).toBeCalledTimes(2);
			expect(cbCondition).toBeCalledTimes(1);
		});

		test("GIVEN a poll with two retries and succeeds first THEN calls that function and condition once", async () => {
			const cb = jest.fn(() => pass);
			const cbCondition = jest.fn((result: string) => result === pass);
			const result = poll(cb, cbCondition, { maximumRetries: 2 });

			await expect(result).resolves.toBe(pass);
			expect(cb).toBeCalledTimes(1);
			expect(cbCondition).toBeCalledTimes(1);
		});
	});

	describe("waitBetweenRetries", () => {
		test.each([undefined, null, 0, 5])(
			"GIVEN %j THEN passes validation",
			async (waitBetweenRetries) => {
				const cb = jest.fn(cbRaw);
				const cbCondition = jest.fn(cbConditionRaw);
				const result = poll(cb, cbCondition, { waitBetweenRetries });

				await expect(result).resolves.toBe(pass);
				expect(cb).toBeCalledTimes(1);
				expect(cbCondition).toBeCalledTimes(1);
			},
		);

		test.each(["foo", true])(
			"GIVEN %j THEN throws TypeError",
			async (waitBetweenRetries) => {
				const cb = jest.fn(cbRaw);
				const cbCondition = jest.fn(cbConditionRaw);
				const result = poll(cb, cbCondition, {
					waitBetweenRetries: waitBetweenRetries as unknown as number,
				});

				await expect(result).rejects.toStrictEqual(
					new TypeError("Expected waitBetweenRetries to be a number"),
				);
				expect(cb).toBeCalledTimes(0);
				expect(cbCondition).toBeCalledTimes(0);
			},
		);

		test.each([NaN, -NaN, -Infinity, -5, Infinity, 5.5])(
			"GIVEN %j THEN throws RangeError",
			async (waitBetweenRetries) => {
				const cb = jest.fn(cbRaw);
				const cbCondition = jest.fn(cbConditionRaw);
				const result = poll(cb, cbCondition, { waitBetweenRetries });

				await expect(result).rejects.toStrictEqual(
					new RangeError(
						"Expected waitBetweenRetries to be a positive safe integer",
					),
				);
				expect(cb).toBeCalledTimes(0);
				expect(cbCondition).toBeCalledTimes(0);
			},
		);

		test("GIVEN a poll with a wait of 5ms THEN waits 5ms between retries", async () => {
			const cb = jest
				.fn<() => string>() //
				.mockReturnValueOnce(fail)
				.mockReturnValueOnce(pass);
			const cbCondition = jest.fn(cbConditionRaw);

			const timeout = jest.spyOn(globalThis, "setTimeout");
			const result = poll(cb, cbCondition, { waitBetweenRetries: 5 });
			await expect(result).resolves.toBe(pass);
			expect(timeout).toBeCalledTimes(1);
			expect(timeout.mock.calls[0][1]).toBe(5);
		});

		test("GIVEN a poll with a wait of 5ms THEN waits 5ms between retries", async () => {
			const cb = jest
				.fn<() => string>() //
				.mockReturnValueOnce(fail)
				.mockReturnValueOnce(pass);
			const cbCondition = jest.fn(cbConditionRaw);

			// Exercise Bun timers directly.
			const signal = AbortSignal.timeout(5);
			const result = poll(cb, cbCondition, { signal, waitBetweenRetries: 10 });
			jest.setSystemTime();

			await expect(result).rejects.toMatchObject({ name: "TimeoutError" });
			expect(cb).toBeCalledTimes(1);
			expect(cb).toHaveBeenCalledWith(signal);
			expect(cbCondition).toBeCalledTimes(1);
			expect(cbCondition).toHaveBeenCalledWith(fail, signal);
		});
	});

	describe("verbose", () => {
		test("GIVEN verbose but no waitBetweenRetries THEN does not log", async () => {
			const cb = jest
				.fn<() => string>()
				.mockReturnValueOnce(fail)
				.mockReturnValueOnce(pass);
			const output = jest
				.spyOn(process.stdout, "write")
				.mockImplementation(() => true);
			const result = poll(cb, cbConditionRaw, { verbose: true });

			await expect(result).resolves.toBe(pass);
			expect(output).toHaveBeenCalledTimes(0);
		});

		test("GIVEN verbose and waitBetweenRetries THEN logs retry context to stdout", async () => {
			const cb = jest
				.fn<() => string>()
				.mockReturnValueOnce(fail)
				.mockReturnValueOnce(pass);
			const output = jest
				.spyOn(process.stdout, "write")
				.mockImplementation(() => true);
			const result = poll(cb, cbConditionRaw, {
				verbose: true,
				waitBetweenRetries: 5,
			});

			await expect(result).resolves.toBe(pass);
			expect(output).toHaveBeenCalledTimes(1);
			const line = String(output.mock.calls[0]?.[0]);
			expect(line).toContain("utilities.poll ›");
			expect(line).toContain("waiting");
			expect(line).toMatch(/delayMs=5\b/);
			expect(line).toMatch(/attempt=1\b/);
		});
	});
});
