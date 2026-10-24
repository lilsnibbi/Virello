import { container } from "../../core/modules/index";
import { AutocompleteErrorListener as CoreCommandAutocompleteInteractionError } from "./autocomplete";
import { ChatInputErrorListener as CoreChatInputCommandError } from "./chatInput";
import { ContextMenuErrorListener as CoreContextMenuCommandError } from "./contextMenu";
import { InteractionErrorListener as CoreInteractionHandlerError } from "./interaction";
import { InteractionParseErrorListener as CoreInteractionHandlerParseError } from "./interactionParse";
import { ListenerErrorListener as CoreListenerError } from "./listener";
import { MessageErrorListener as CoreMessageCommandError } from "./message";
import { RegistrationErrorListener as CoreCommandApplicationCommandRegistryError } from "./registration";

export function registerErrorListeners() {
	const store = "listeners" as const;
	void container.modules.addModule({
		name: "CoreChatInputCommandError",
		module: CoreChatInputCommandError,
		store,
	});
	void container.modules.addModule({
		name: "CoreCommandApplicationCommandRegistryError",
		module: CoreCommandApplicationCommandRegistryError,
		store,
	});
	void container.modules.addModule({
		name: "CoreCommandAutocompleteInteractionError",
		module: CoreCommandAutocompleteInteractionError,
		store,
	});
	void container.modules.addModule({
		name: "CoreContextMenuCommandError",
		module: CoreContextMenuCommandError,
		store,
	});
	void container.modules.addModule({
		name: "CoreInteractionHandlerError",
		module: CoreInteractionHandlerError,
		store,
	});
	void container.modules.addModule({
		name: "CoreInteractionHandlerParseError",
		module: CoreInteractionHandlerParseError,
		store,
	});
	void container.modules.addModule({
		name: "CoreListenerError",
		module: CoreListenerError,
		store,
	});
	void container.modules.addModule({
		name: "CoreMessageCommandError",
		module: CoreMessageCommandError,
		store,
	});
}
