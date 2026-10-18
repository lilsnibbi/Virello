import { describe, expect, test } from "bun:test";
import { ChannelType } from "discord-api-types/v10";
import type { PreconditionContainerSingle } from "../../../src/commands/checks/containers/Entry";
import { PreconditionContainerArray } from "../../../src/commands/checks/containers/Group";
import { parseConstructorPreConditionsRunIn } from "../../../src/commands/checks/resolvers/runIn";
import { CommandPreConditions } from "../../../src/commands/enums";
import type { CommandRunInUnion } from "../../../src/commands/types";
import { isNullish } from "../../../src/utilities/index";

describe("parseConstructorPreConditionsRunIn", () => {
	test("GIVEN runIn is null THEN returns undefined", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsRunIn(
			null,
			resolveConstructorPreConditionsRunType,
			preconditionContainerArray,
		);

		expect(preconditionContainerArray.entries.length).toBe(0);
	});

	test("GIVEN runIn is a specific object THEN returns the correct types", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsRunIn(
			{
				messageRun: ChannelType.GuildText,
				chatInputRun: ChannelType.DM,
				contextMenuRun: ChannelType.GuildForum,
			},
			resolveConstructorPreConditionsRunType,
			preconditionContainerArray,
		);
		expect(preconditionContainerArray.entries.length).toBe(1);
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.name,
		).toBe(CommandPreConditions.RunIn);
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.context,
		).toEqual({
			types: {
				messageRun: [ChannelType.GuildText],
				chatInputRun: [ChannelType.DM],
				contextMenuRun: [ChannelType.GuildForum],
			},
		});
	});

	test("GIVEN runIn is not a specific object THEN returns the correct types", () => {
		const preconditionContainerArray = new PreconditionContainerArray();
		parseConstructorPreConditionsRunIn(
			ChannelType.GuildVoice,
			resolveConstructorPreConditionsRunType,
			preconditionContainerArray,
		);
		expect(preconditionContainerArray.entries.length).toBe(1);
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.name,
		).toBe(CommandPreConditions.RunIn);
		expect(
			(preconditionContainerArray.entries[0] as PreconditionContainerSingle)
				.context,
		).toEqual({
			types: [ChannelType.GuildVoice],
		});
	});
});

// Copies of the same code in the Command class, extracted here for accessing them in tests without difficult mocking.
const ChannelTypes = Object.values(ChannelType).filter(
	(type) => typeof type === "number",
) as readonly ChannelType[];
const GuildChannelTypes = ChannelTypes.filter(
	(type) => type !== ChannelType.DM && type !== ChannelType.GroupDM,
) as readonly ChannelType[];
function resolveConstructorPreConditionsRunType(
	types: CommandRunInUnion,
): readonly ChannelType[] | null {
	if (isNullish(types)) return null;
	if (typeof types === "number") return [types];
	if (typeof types === "string") {
		switch (types) {
			case "DM":
				return [ChannelType.DM];
			case "GUILD_TEXT":
				return [ChannelType.GuildText];
			case "GUILD_VOICE":
				return [ChannelType.GuildVoice];
			case "GUILD_NEWS":
				return [ChannelType.GuildAnnouncement];
			case "GUILD_NEWS_THREAD":
				return [ChannelType.AnnouncementThread];
			case "GUILD_PUBLIC_THREAD":
				return [ChannelType.PublicThread];
			case "GUILD_PRIVATE_THREAD":
				return [ChannelType.PrivateThread];
			case "GUILD_ANY":
				return GuildChannelTypes;
			default:
				return null;
		}
	}

	// If there's no channel it can run on, throw an error:
	if (types.length === 0) {
		throw new Error(`"runIn" was specified as an empty array.`);
	}

	if (types.length === 1) {
		return resolveConstructorPreConditionsRunType(types[0]);
	}

	const resolved = new Set<ChannelType>();
	for (const typeResolvable of types) {
		for (const type of resolveConstructorPreConditionsRunType(typeResolvable) ??
			[])
			resolved.add(type);
	}

	// If all types were resolved, optimize to null:
	if (resolved.size === ChannelTypes.length) return null;

	// Return the resolved types in ascending order:
	return [...resolved].sort((a, b) => a - b);
}
