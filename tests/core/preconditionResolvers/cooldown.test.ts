import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PreconditionContainerSingle } from "../../../src/commands/checks/containers/Entry";
import { PreconditionContainerArray } from "../../../src/commands/checks/containers/Group";
import { parseConstructorPreConditionsCooldown } from "../../../src/commands/checks/resolvers/cooldown";
import { BucketScope } from "../../../src/commands/enums";
import type { CooldownOptions } from "../../../src/core/client/VirelloClient";
import { container } from "../../../src/core/modules/index";

describe("parseConstructorPreConditionsCooldown", () => {
	const originalClient = container.client;
	beforeAll(() => {
		container.client = {
			options: {
				defaultCooldown: {
					limit: 1,
					delay: 2,
					scope: BucketScope.User,
				} as CooldownOptions,
			},
		} as typeof container.client;
	});
	afterAll(() => {
		container.client = originalClient;
	});

	test("when limit and delay are undefined, sets limit to default limit and delay to default delay", () => {
		const preconditionContainerArray = new PreconditionContainerArray();

		parseConstructorPreConditionsCooldown(
			{ name: "test" } as Parameters<
				typeof parseConstructorPreConditionsCooldown
			>[0],
			undefined,
			undefined,
			undefined,
			undefined,
			preconditionContainerArray,
		);

		expect(preconditionContainerArray.entries.length).toBe(1);
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.name,
		).toBe("Cooldown");
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.context,
		).toMatchObject({
			scope: BucketScope.User,
			limit: 1,
			delay: 2,
			filteredUsers: undefined,
		});
	});

	test("when limit and delay are defined, sets limit to passed limit and delay to passed delay", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsCooldown(
			{ name: "test" } as Parameters<
				typeof parseConstructorPreConditionsCooldown
			>[0],
			5,
			10,
			undefined,
			undefined,
			preconditionContainerArray,
		);

		expect(preconditionContainerArray.entries.length).toBe(1);
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.name,
		).toBe("Cooldown");
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.context,
		).toMatchObject({
			scope: BucketScope.User,
			limit: 5,
			delay: 10,
			filteredUsers: undefined,
		});
	});

	test("when scope, filteredUsers, limit, and delay are defined, sets all values to passed values", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsCooldown(
			{ name: "test" } as Parameters<
				typeof parseConstructorPreConditionsCooldown
			>[0],
			5,
			10,
			BucketScope.Guild,
			["user1", "user2"],
			preconditionContainerArray,
		);

		expect(preconditionContainerArray.entries.length).toBe(1);
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.name,
		).toBe("Cooldown");
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.context,
		).toMatchObject({
			scope: BucketScope.Guild,
			limit: 5,
			delay: 10,
			filteredUsers: ["user1", "user2"],
		});
	});
});
