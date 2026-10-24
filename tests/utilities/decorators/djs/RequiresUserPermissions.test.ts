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
	RequiresUserPermissions,
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
			expect(userId).toBe(message.author.id);
			return new Permissions(givenPermissions);
		},
	});
	return message;
}

describe("RequiresUserPermissions", () => {
	describe("WITH DM-compatible permissions", () => {
		class Test {
			@RequiresUserPermissions([
				PermissionFlagsBits.SendMessages,
				PermissionFlagsBits.AttachFiles,
			])
			public getValue(_message: Message) {
				return Promise.resolve("Resolved");
			}
		}

		const instance = new Test();

		describe("WITH channel === GuildText", () => {
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
							DecoratorIdentifiers.RequiresUserPermissionsMissingPermissions,
						message:
							"Sorry, but you are not allowed to do that. You are missing the permissions: AttachFiles",
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
							DecoratorIdentifiers.RequiresUserPermissionsMissingPermissions,
						message:
							"Sorry, but you are not allowed to do that. You are missing the permissions: SendMessages,AttachFiles",
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
			@RequiresUserPermissions([
				PermissionFlagsBits.ManageMessages,
				PermissionFlagsBits.AddReactions,
				PermissionFlagsBits.AddReactions,
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
						identifier: DecoratorIdentifiers.RequiresUserPermissionsGuildOnly,
						message:
							"Sorry, but that command can only be used in a server because you do not have sufficient permissions in DMs",
					}),
				);
			});
		});
	});
});
