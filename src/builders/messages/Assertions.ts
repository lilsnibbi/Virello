// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: native attachments and complete nested message validation.
// See src/builders/NOTICE and src/builders/LICENSE.
import { ComponentType, MessageFlags } from "discord-api-types/v10";
import { z } from "zod";
import { snowflakePredicate } from "../Assertions";
import { messageActionRowPredicate } from "../components/Assertions";
import {
	containerPredicate,
	filePredicate,
	mediaGalleryPredicate,
	sectionPredicate,
	separatorPredicate,
	textDisplayPredicate,
} from "../components/v2/Assertions";
import { embedLength } from "../util/embedLength";
import { embedPredicate } from "./embed/Assertions";

export const attachmentPredicate = z.object({
	id: z.union([snowflakePredicate, z.number().int().min(0)]),
	filename: z.string().min(1).max(1024).optional(),
	description: z.string().max(1024).optional(),
});

const componentPredicate = z.union([
	messageActionRowPredicate,
	containerPredicate,
	filePredicate,
	mediaGalleryPredicate,
	sectionPredicate,
	separatorPredicate,
	textDisplayPredicate,
]);

export const messagePredicate = z
	.object({
		content: z.string().max(2000).optional(),
		embeds: z.array(embedPredicate).max(10).optional(),
		components: z.array(componentPredicate).max(40).optional(),
		attachments: z.array(attachmentPredicate).max(10).optional(),
		flags: z.number().int().min(0).optional(),
		allowed_mentions: z
			.object({
				parse: z.array(z.enum(["users", "roles", "everyone"])).optional(),
				users: z.array(snowflakePredicate).max(100).optional(),
				roles: z.array(snowflakePredicate).max(100).optional(),
				replied_user: z.boolean().optional(),
			})
			.optional(),
	})
	.superRefine((data, ctx) => {
		const issue = (message: string) =>
			ctx.addIssue({ code: "custom", message });
		if (
			(data.embeds ?? []).reduce(
				(total, embed) => total + embedLength(embed),
				0,
			) > 6000
		)
			issue("Message embeds must not exceed 6000 characters combined.");
		const mentions = data.allowed_mentions;
		if (mentions?.parse?.includes("users") && mentions.users?.length)
			issue("Use either users or parse users in allowed_mentions.");
		if (mentions?.parse?.includes("roles") && mentions.roles?.length)
			issue("Use either roles or parse roles in allowed_mentions.");
		const v2 = Boolean((data.flags ?? 0) & MessageFlags.IsComponentsV2);
		if (v2 && (data.content !== undefined || data.embeds?.length))
			issue("Components V2 messages cannot contain content or embeds.");
		if (v2 && !data.components?.length)
			issue("Components V2 messages need at least one component.");
		if (!v2 && (data.components?.length ?? 0) > 5)
			issue("Legacy messages allow at most five action rows.");
		if (
			!v2 &&
			data.components?.some(
				(component) => component.type !== ComponentType.ActionRow,
			)
		)
			issue("Set MessageFlags.IsComponentsV2 to use Components V2.");
		if (
			!data.content &&
			!data.embeds?.length &&
			!data.components?.length &&
			!data.attachments?.length
		)
			issue("A message needs content, embeds, components or attachments.");
	});
