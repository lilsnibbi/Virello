import type { ChannelType } from "discord-api-types/v10";
import { isNullish } from "../../../utilities/index";
import { Command } from "../../Command";
import { CommandPreConditions } from "../../enums";
import type { CommandRunInUnion, CommandSpecificRunIn } from "../../types";
import type { PreconditionContainerArray } from "../containers/Group";

/** Appends the `RunIn` precondition based on the values passed, defaulting to `null`, which doesn't add a precondition. */
export function parseConstructorPreConditionsRunIn(
	runIn: CommandRunInUnion | CommandSpecificRunIn,
	resolveConstructorPreConditionsRunType: (
		types: CommandRunInUnion,
	) => readonly ChannelType[] | null,
	preconditionContainerArray: PreconditionContainerArray,
) {
	// Early return if there's no runIn option:
	if (isNullish(runIn)) return;

	if (Command.runInTypeIsSpecificsObject(runIn)) {
		const messageRunTypes = resolveConstructorPreConditionsRunType(
			runIn.messageRun,
		);
		const chatInputRunTypes = resolveConstructorPreConditionsRunType(
			runIn.chatInputRun,
		);
		const contextMenuRunTypes = resolveConstructorPreConditionsRunType(
			runIn.contextMenuRun,
		);

		if (
			messageRunTypes !== null ||
			chatInputRunTypes !== null ||
			contextMenuRunTypes !== null
		) {
			preconditionContainerArray.append({
				name: CommandPreConditions.RunIn,
				context: {
					types: {
						messageRun: messageRunTypes ?? [],
						chatInputRun: chatInputRunTypes ?? [],
						contextMenuRun: contextMenuRunTypes ?? [],
					},
				},
			});
		}
	} else {
		const types = resolveConstructorPreConditionsRunType(runIn);
		if (types !== null) {
			preconditionContainerArray.append({
				name: CommandPreConditions.RunIn,
				context: { types },
			});
		}
	}
}
