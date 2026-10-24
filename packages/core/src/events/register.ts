import { AutocompleteListener as CorePossibleAutocompleteInteraction } from "../commands/execution/autocomplete";
import { AcceptedListener as CoreChatInputCommandAccepted } from "../commands/execution/chatInput/accepted";
import { BeforeRunListener as CorePreChatInputCommandRun } from "../commands/execution/chatInput/beforeRun";
import { ResolveListener as CorePossibleChatInputCommand } from "../commands/execution/chatInput/resolve";
import { AcceptedListener as CoreContextMenuCommandAccepted } from "../commands/execution/contextMenu/accepted";
import { BeforeRunListener as CorePreContextMenuCommandRun } from "../commands/execution/contextMenu/beforeRun";
import { ResolveListener as CorePossibleContextMenuCommand } from "../commands/execution/contextMenu/resolve";
import { container } from "../core/modules/index";
import { InteractionCreateListener as CoreInteractionCreate } from "./interactionCreate";
import { ReadyListener as CoreReady } from "./ready";

export function registerEvents(): void {
	void container.modules.addModule({
		name: "CoreChatInputCommandAccepted",
		module: CoreChatInputCommandAccepted,
		store: "listeners",
	});
	void container.modules.addModule({
		name: "CorePossibleChatInputCommand",
		module: CorePossibleChatInputCommand,
		store: "listeners",
	});
	void container.modules.addModule({
		name: "CorePreChatInputCommandRun",
		module: CorePreChatInputCommandRun,
		store: "listeners",
	});
	void container.modules.addModule({
		name: "CoreContextMenuCommandAccepted",
		module: CoreContextMenuCommandAccepted,
		store: "listeners",
	});
	void container.modules.addModule({
		name: "CorePossibleContextMenuCommand",
		module: CorePossibleContextMenuCommand,
		store: "listeners",
	});
	void container.modules.addModule({
		name: "CorePreContextMenuCommandRun",
		module: CorePreContextMenuCommandRun,
		store: "listeners",
	});
	void container.modules.addModule({
		name: "CorePossibleAutocompleteInteraction",
		module: CorePossibleAutocompleteInteraction,
		store: "listeners",
	});
	void container.modules.addModule({
		name: "CoreInteractionCreate",
		module: CoreInteractionCreate,
		store: "listeners",
	});
	void container.modules.addModule({
		name: "CoreReady",
		module: CoreReady,
		store: "listeners",
	});
}
