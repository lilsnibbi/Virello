import { describe, expect, test } from "bun:test";
import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import {
	Permissions,
	type PermissionInput,
	type MessageContext as Message,
	type VirelloClient,
} from "virello";
import { message as nativeMessage } from "../../../fixtures/discord";
import { UserError } from "../../../../packages/core/src/core/index";
import {
	DecoratorIdentifiers,
	RequiresClientPermissions,
} from "../../../../packages/core/src/utilities/decorators/index";

function buildMessage(
	channelType: ChannelType,
	...givenPermissions: PermissionInput[]
): Message {
	const message = nativeMessage({ user: { id: "bot" } } as VirelloClient, {
		guild_id: channelType === ChannelType.DM ? undefined : "guild",
	});
	Object.defineProperty(message, "guildId", {
		value: channelType === ChannelType.DM ? null : "guild",
	});
	Object.defineProperty(message, "permissionsFor", {
		value: async (userId: string) => {
			expect(userId).toBe("bot");
			return new Permissions(givenPermissions);
		},
	});
	return message;
}

describe("RequiresClientPermissions", () => {
	describe("WITH DM-compatible permissions", () => {
		class Test {
			@RequiresClientPermissions(["SendMessages", "AttachFiles"])
			public getValue(_message: Message) {
				return Promise.resolve("Resolved");
			}
		}

		const instance = new Test();

		describe("WITH channel === GuildTest", () => {
			test("GIVEN has permission THEN returns resolved", async () => {
				const result = await instance.getValue(
					buildMessage(
						ChannelType.GuildText,
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AttachFiles,
					),
				);

				expect(result).toBe("Resolved");
			});

			test("GIVEN lacking 1 permission THEN throws UserError", async () => {
				const result = instance.getValue(
					buildMessage(ChannelType.GuildText, PermissionFlagsBits.SendMessages),
				);

				await expect(result).rejects.toThrowError(
					new UserError({
						identifier:
							DecoratorIdentifiers.RequiresClientPermissionsMissingPermissions,
						message: `Sorry, but I am not allowed to do that. I am missing the permissions: AttachFiles`,
						context: {
							missing: ["AttachFiles"],
						},
					}),
				);
			});

			test("GIVEN lacking 2 permissions THEN throws UserError", async () => {
				const result = instance.getValue(buildMessage(ChannelType.GuildText));

				await expect(result).rejects.toThrowError(
					new UserError({
						identifier:
							DecoratorIdentifiers.RequiresClientPermissionsMissingPermissions,
						message: `Sorry, but I am not allowed to do that. I am missing the permissions: SendMessages,AttachFiles`,
						context: {
							missing: ["SendMessages", "AttachFiles"],
						},
					}),
				);
			});
		});

		describe("WITH channel === DM", () => {
			test("GIVEN no additional permissions THEN resolves", async () => {
				const result = await instance.getValue(buildMessage(ChannelType.DM));

				expect(result).toBe("Resolved");
			});
		});
	});

	describe("WITH DM-incompatible permissions", () => {
		class Test {
			@RequiresClientPermissions([
				PermissionFlagsBits.ManageMessages,
				PermissionFlagsBits.AddReactions,
				PermissionFlagsBits.EmbedLinks,
			])
			public getValue(_message: Message) {
				return Promise.resolve("Resolved");
			}
		}

		const instance = new Test();

		describe("WITH channel === DM", () => {
			test("GIVEN no additional permissions THEN resolves", async () => {
				const result = instance.getValue(buildMessage(ChannelType.DM));

				await expect(result).rejects.toThrowError(
					new UserError({
						identifier: DecoratorIdentifiers.RequiresClientPermissionsGuildOnly,
						message:
							"Sorry, but that command can only be used in a server because I do not have sufficient permissions in DMs",
					}),
				);
			});
		});
	});
});
