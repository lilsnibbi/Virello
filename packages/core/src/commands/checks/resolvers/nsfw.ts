import { CommandPreConditions } from "../../enums";
import type { PreconditionContainerArray } from "../containers/Group";

/** Appends the `NSFW` precondition if {@link SubcommandMappingMethod.nsfw} is set to true. */
export function parseConstructorPreConditionsNsfw(
	nsfw: boolean | undefined,
	preconditionContainerArray: PreconditionContainerArray,
) {
	if (nsfw)
		preconditionContainerArray.append(CommandPreConditions.NotSafeForWork);
}
