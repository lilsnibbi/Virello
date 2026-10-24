import { container } from "../../../core/modules/index";
import { MessageCommandAcceptedListener as CoreMessageCommandAccepted } from "./messageCommandAccepted";
import { MessageCommandTypingListener as CoreMessageCommandTyping } from "./messageCommandTyping";
import { MessageCreateListener as CoreMessageCreate } from "./messageCreate";
import { PrefixedMessageListener as CorePrefixedMessage } from "./prefixedMessage";
import { PreMessageCommandRunListener as CorePreMessageCommandRun } from "./preMessageCommandRun";
import { PreMessageParserListener as CorePreMessageParser } from "./preMessageParser";

export function messageCommands() {
	const store = "listeners" as const;
	void container.modules.addModule({
		name: "CoreMessageCommandAccepted",
		module: CoreMessageCommandAccepted,
		store,
	});
	void container.modules.addModule({
		name: "CoreMessageCommandTyping",
		module: CoreMessageCommandTyping,
		store,
	});
	void container.modules.addModule({
		name: "CoreMessageCreate",
		module: CoreMessageCreate,
		store,
	});
	void container.modules.addModule({
		name: "CorePrefixedMessage",
		module: CorePrefixedMessage,
		store,
	});
	void container.modules.addModule({
		name: "CorePreMessageCommandRun",
		module: CorePreMessageCommandRun,
		store,
	});
	void container.modules.addModule({
		name: "CorePreMessageParser",
		module: CorePreMessageParser,
		store,
	});
}
