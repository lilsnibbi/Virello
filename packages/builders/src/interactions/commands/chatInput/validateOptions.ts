import {
	ApplicationCommandOptionType,
	type APIApplicationCommandOption,
} from "discord-api-types/v10";

/** Check relationships that individual option schemas cannot express. */
export function validateOptions(
	options: readonly APIApplicationCommandOption[],
): void {
	const names = new Set<string>();
	let optionalSeen = false;
	for (const option of options) {
		if (names.has(option.name))
			throw new TypeError(`Duplicate command option: ${option.name}`);
		names.add(option.name);
		if (
			option.type === ApplicationCommandOptionType.Subcommand ||
			option.type === ApplicationCommandOptionType.SubcommandGroup
		) {
			validateOptions(option.options ?? []);
			continue;
		}
		if (option.required && optionalSeen)
			throw new TypeError(
				"Required command options must precede optional options.",
			);
		optionalSeen ||= !option.required;
		if (option.type === ApplicationCommandOptionType.String) {
			if ((option.min_length ?? 0) > (option.max_length ?? 6000))
				throw new RangeError("min_length must not exceed max_length.");
		} else if (
			option.type === ApplicationCommandOptionType.Integer ||
			option.type === ApplicationCommandOptionType.Number
		) {
			if (
				option.min_value !== undefined &&
				option.max_value !== undefined &&
				option.min_value > option.max_value
			)
				throw new RangeError("min_value must not exceed max_value.");
			if (
				option.type === ApplicationCommandOptionType.Integer &&
				option.choices?.some((choice) => !Number.isSafeInteger(choice.value))
			)
				throw new RangeError("Integer choices must be safe integers.");
		}
	}
}
