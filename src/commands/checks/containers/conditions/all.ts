import { Result } from "../../../../utilities/result/index";
import type { IPreconditionCondition } from "./Condition";

/** An {@link IPreconditionCondition} which runs all containers similarly to doing (V0 && V1 [&& V2 [&& V3 ...]]). */
export const PreconditionConditionAnd: IPreconditionCondition = {
	/** Run message checks one at a time. Stop at the first Err. Return Ok if no check denies. Thrown checks reject. */
	async messageSequential(message, command, entries, context) {
		for (const child of entries) {
			const result = await child.messageRun(message, command, context);
			if (result.isErr()) return result;
		}

		return Result.ok();
	},
	/**
	 * Run message checks concurrently and await all. Select the first Err in entry order. Return Ok if no check denies.
	 * Thrown checks reject.
	 */
	async messageParallel(message, command, entries, context) {
		const results = await Promise.all(
			entries.map((entry) => entry.messageRun(message, command, context)),
		);
		// This is simplified compared to PreconditionContainerAny, because we're looking for the first error.
		// However, the base implementation short-circuits with the first Ok.
		return results.find((res) => res.isErr()) ?? Result.ok();
	},
	/** Run slash checks one at a time. Stop at the first Err. Return Ok if no check denies. Thrown checks reject. */
	async chatInputSequential(interaction, command, entries, context) {
		for (const child of entries) {
			const result = await child.chatInputRun(interaction, command, context);
			if (result.isErr()) return result;
		}

		return Result.ok();
	},
	/**
	 * Run slash checks concurrently and await all. Select the first Err in entry order. Return Ok if no check denies. Thrown
	 * checks reject.
	 */
	async chatInputParallel(interaction, command, entries, context) {
		const results = await Promise.all(
			entries.map((entry) => entry.chatInputRun(interaction, command, context)),
		);
		// This is simplified compared to PreconditionContainerAny, because we're looking for the first error.
		// However, the base implementation short-circuits with the first Ok.
		return results.find((res) => res.isErr()) ?? Result.ok();
	},
	/** Run context-menu checks one at a time. Stop at the first Err. Return Ok if no check denies. Thrown checks reject. */
	async contextMenuSequential(interaction, command, entries, context) {
		for (const child of entries) {
			const result = await child.contextMenuRun(interaction, command, context);
			if (result.isErr()) return result;
		}

		return Result.ok();
	},
	/**
	 * Run context-menu checks concurrently and await all. Select the first Err in entry order. Return Ok if no check denies.
	 * Thrown checks reject.
	 */
	async contextMenuParallel(interaction, command, entries, context) {
		const results = await Promise.all(
			entries.map((entry) =>
				entry.contextMenuRun(interaction, command, context),
			),
		);
		// This is simplified compared to PreconditionContainerAny, because we're looking for the first error.
		// However, the base implementation short-circuits with the first Ok.
		return results.find((res) => res.isErr()) ?? Result.ok();
	},
};
