import type { PreconditionContainerSingle } from "../../../src/commands/checks/containers/Entry";
import { describe, expect, test } from "bun:test";
import { PreconditionContainerArray } from "../../../src/commands/checks/containers/Group";
import { parseConstructorPreConditionsNsfw } from "../../../src/commands/checks/resolvers/nsfw";
import { CommandPreConditions } from "../../../src/commands/enums";

describe("parseConstructorPreConditionsNsfw", () => {
	test("GIVEN nsfw true THEN appends to preconditionContainerArray", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsNsfw(true, preconditionContainerArray);
		expect(preconditionContainerArray.entries.length).toBe(1);
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.name,
		).toBe(CommandPreConditions.NotSafeForWork);
	});

	test("GIVEN nsfw false THEN does not append to preconditionContainerArray", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsNsfw(false, preconditionContainerArray);
		expect(preconditionContainerArray.entries.length).toBe(0);
	});

	test("GIVEN nsfw undefined THEN does not append to preconditionContainerArray", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsNsfw(undefined, preconditionContainerArray);
		expect(preconditionContainerArray.entries.length).toBe(0);
	});
});
