// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import type {
	ApplicationCommandType,
	RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { Mixin } from "ts-mixer";
import { CommandBuilder } from "../Command";
import { SharedName } from "../SharedName";
import { validate } from "../../../util/validation";
import { contextMenuCommandPredicate } from "./Assertions";

/**
 * The type a context menu command can be.
 */
export type ContextMenuCommandType =
	ApplicationCommandType.Message | ApplicationCommandType.User;

/**
 * A builder that creates API-compatible JSON data for context menu commands.
 *
 * @mixes {@link CommandBuilder}\<{@link discord-api-types/v10#(RESTPostAPIContextMenuApplicationCommandsJSONBody:interface)}\>
 * @mixes {@link SharedName}
 */
export class ContextMenuCommandBuilder extends Mixin(
	CommandBuilder<RESTPostAPIContextMenuApplicationCommandsJSONBody>,
	SharedName,
) {
	/**
	 * The API data associated with this context menu command.
	 *
	 * @internal
	 */
	protected override readonly data: Partial<RESTPostAPIContextMenuApplicationCommandsJSONBody>;

	/**
	 * Creates a new context menu command.
	 *
	 * @param data - The API data to create this context menu command with
	 */
	public constructor(
		data: Partial<RESTPostAPIContextMenuApplicationCommandsJSONBody> = {},
	) {
		super();
		this.data = structuredClone(data);
	}

	/**
	 * {@inheritDoc CommandBuilder.toJSON}
	 */
	public override toJSON(): RESTPostAPIContextMenuApplicationCommandsJSONBody {
		const data = structuredClone(this.data);
		validate(contextMenuCommandPredicate, data);
		return data as RESTPostAPIContextMenuApplicationCommandsJSONBody;
	}

	/** Choose a user or message context menu; required before serialization. */
	public setType(type: ContextMenuCommandType): this {
		this.data.type = type;
		return this;
	}
}
