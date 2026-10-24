import type { ApplicationCommandOptionType } from "discord-api-types/v10";
import { type CommandDifference, optionTypeToPrettyName } from "../_shared";

export function* checkOptionType({
	key,
	expectedType,
	originalType,
}: {
	key: string;
	originalType: ApplicationCommandOptionType;
	expectedType: ApplicationCommandOptionType;
}): Generator<CommandDifference> {
	const expectedTypeString =
		optionTypeToPrettyName.get(expectedType) ??
		`unknown (${expectedType}); please contact Virello developers about this!`;

	if (originalType !== expectedType) {
		yield {
			key,
			original:
				optionTypeToPrettyName.get(originalType) ??
				`unknown (${originalType}); please contact Virello developers about this!`,
			expected: expectedTypeString,
		};
	}
}
