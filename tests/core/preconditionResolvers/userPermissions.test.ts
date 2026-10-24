import { describe, expect, test } from "bun:test";
import { PermissionFlagsBits } from "discord-api-types/v10";
import type { PermissionPreconditionContext } from "../../../packages/core/src/commands/checks/builtins/ClientPermissions";
import type { PreconditionContainerSingle } from "../../../packages/core/src/commands/checks/containers/Entry";
import { PreconditionContainerArray } from "../../../packages/core/src/commands/checks/containers/Group";
import { parseConstructorPreConditionsRequiredUserPermissions } from "../../../packages/core/src/commands/checks/resolvers/userPermissions";
import { CommandPreConditions } from "../../../packages/core/src/commands/enums";

describe("parseConstructorPreConditionsRequiredUserPermissions", () => {
	test("GIVEN valid permissions THEN appends to preconditionContainerArray", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsRequiredUserPermissions(
			PermissionFlagsBits.Administrator,
			preconditionContainerArray,
		);
		expect(preconditionContainerArray.entries.length).toBe(1);
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.name,
		).toBe(CommandPreConditions.UserPermissions);
		expect(
			(
				(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
					.context as PermissionPreconditionContext
			).permissions?.has(PermissionFlagsBits.Administrator),
		).toBe(true);
	});

	test("GIVEN no permissions THEN does not append to preconditionContainerArray", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsRequiredUserPermissions(
			undefined,
			preconditionContainerArray,
		);
		expect(preconditionContainerArray.entries.length).toBe(0);
	});
});
