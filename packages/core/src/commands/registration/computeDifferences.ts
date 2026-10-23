import {
	ApplicationCommandType,
	type RESTPostAPIApplicationCommandsJSONBody,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	type RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import {
	type CommandDifference,
	contextMenuTypes,
} from "./computeDifferences/_shared";
import { checkInteractionContextTypes } from "./computeDifferences/contexts";
import { checkDefaultMemberPermissions } from "./computeDifferences/default_member_permissions";
import { checkDescription } from "./computeDifferences/description";
import { checkDMPermission } from "./computeDifferences/dm_permission";
import { checkIntegrationTypes } from "./computeDifferences/integration_types";
import { checkLocalizations } from "./computeDifferences/localizations";
import { checkName } from "./computeDifferences/name";
import { checkOptions } from "./computeDifferences/options";
import type { InternalAPICall } from "./Registry";

export function getCommandDifferencesFast(
	existingCommand: RESTPostAPIApplicationCommandsJSONBody,
	apiData: InternalAPICall["builtData"],
	guildCommand: boolean,
) {
	for (const _ of getCommandDifferences(
		existingCommand,
		apiData,
		guildCommand,
	)) {
		// Return immediately on first difference found (also means we skip all other checks)
		return true;
	}

	return false;
}

export function* getCommandDifferences(
	existingCommand: RESTPostAPIApplicationCommandsJSONBody,
	apiData: InternalAPICall["builtData"],
	guildCommand: boolean,
): Generator<CommandDifference> {
	if (
		existingCommand.type !== ApplicationCommandType.ChatInput &&
		existingCommand.type
	) {
		// Check context menus
		if (
			contextMenuTypes.includes(
				existingCommand.type ?? ApplicationCommandType.ChatInput,
			)
		) {
			const casted =
				apiData as RESTPostAPIContextMenuApplicationCommandsJSONBody;

			// Check name
			yield* checkName({ oldName: existingCommand.name, newName: casted.name });

			// Check dmPermission only for non-guild commands
			if (!guildCommand) {
				yield* checkDMPermission(
					existingCommand.dm_permission,
					casted.dm_permission,
				);
			}

			// Check defaultMemberPermissions
			yield* checkDefaultMemberPermissions(
				existingCommand.default_member_permissions,
				casted.default_member_permissions,
			);

			// Check localized names
			const originalLocalizedNames = existingCommand.name_localizations;
			const expectedLocalizedNames = casted.name_localizations;

			yield* checkLocalizations({
				localeMapName: "nameLocalizations",
				localePresentMessage: "localized names",
				localeMissingMessage: "no localized names",
				originalLocalizedDescriptions: originalLocalizedNames,
				expectedLocalizedDescriptions: expectedLocalizedNames,
			});

			// Check integration types
			yield* checkIntegrationTypes(
				existingCommand.integration_types,
				casted.integration_types,
			);

			// Check contexts
			yield* checkInteractionContextTypes(
				existingCommand.contexts,
				casted.contexts,
			);
		}

		return;
	}

	const casted = apiData as RESTPostAPIChatInputApplicationCommandsJSONBody;

	// Check name
	yield* checkName({
		oldName: existingCommand.name.toLowerCase(),
		newName: casted.name.toLowerCase(),
	});

	// Check localized names
	const originalLocalizedNames = existingCommand.name_localizations;
	const expectedLocalizedNames = casted.name_localizations;

	yield* checkLocalizations({
		localeMapName: "nameLocalizations",
		localePresentMessage: "localized names",
		localeMissingMessage: "no localized names",
		originalLocalizedDescriptions: originalLocalizedNames,
		expectedLocalizedDescriptions: expectedLocalizedNames,
	});

	// Check dmPermission
	if (!guildCommand) {
		yield* checkDMPermission(
			existingCommand.dm_permission,
			casted.dm_permission,
		);
	}

	// Check defaultMemberPermissions
	yield* checkDefaultMemberPermissions(
		existingCommand.default_member_permissions,
		casted.default_member_permissions,
	);

	// Check description
	yield* checkDescription({
		oldDescription: existingCommand.description,
		newDescription: casted.description,
	});

	// Check localized descriptions
	const originalLocalizedDescriptions =
		existingCommand.description_localizations;
	const expectedLocalizedDescriptions = casted.description_localizations;

	yield* checkLocalizations({
		localeMapName: "descriptionLocalizations",
		localePresentMessage: "localized descriptions",
		localeMissingMessage: "no localized descriptions",
		originalLocalizedDescriptions,
		expectedLocalizedDescriptions,
	});

	// Check integration types
	yield* checkIntegrationTypes(
		existingCommand.integration_types,
		casted.integration_types,
	);

	// Check contexts
	yield* checkInteractionContextTypes(
		existingCommand.contexts,
		casted.contexts,
	);

	yield* checkOptions(existingCommand.options, casted.options);
}
