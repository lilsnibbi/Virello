import { container } from "../../../core/modules/index";
import { ChatInputErrorListener as PluginChatInputSubcommandError } from "./chatInputError";
import { ChatInputNoMatchListener as PluginChatInputSubcommandNoMatch } from "./chatInputNoMatch";
import { MessageErrorListener as MessageSubcommandError } from "./messageError";
import { MessageNoMatchListener as MessageSubcommandNoMatch } from "./messageNoMatch";
import { MissingChatInputHandlerListener as SubcommandMappingIsMissingChatInputCommandHandler } from "./missingChatInputHandler";
import { MissingMessageHandlerListener as SubcommandMappingIsMissingMessageCommandHandler } from "./missingMessageHandler";

/** Register built-in subcommand error listeners with the shared module registry. */
export function loadListeners() {
	const store = "listeners" as const;
	void container.modules.addModule({
		name: "PluginChatInputSubcommandError",
		module: PluginChatInputSubcommandError,
		store,
	});
	void container.modules.addModule({
		name: "MessageSubcommandError",
		module: MessageSubcommandError,
		store,
	});
	void container.modules.addModule({
		name: "SubcommandMappingIsMissingChatInputCommandHandler",
		module: SubcommandMappingIsMissingChatInputCommandHandler,
		store,
	});
	void container.modules.addModule({
		name: "SubcommandMappingIsMissingMessageCommandHandler",
		module: SubcommandMappingIsMissingMessageCommandHandler,
		store,
	});
	void container.modules.addModule({
		name: "MessageSubcommandNoMatch",
		module: MessageSubcommandNoMatch,
		store,
	});
	void container.modules.addModule({
		name: "PluginChatInputSubcommandNoMatch",
		module: PluginChatInputSubcommandNoMatch,
		store,
	});
}
