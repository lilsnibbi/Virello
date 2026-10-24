import { container } from "../../../core/modules/index";
import { CommandAcceptedListener as PatternAccepted } from "./commandAccepted";
import { MessageParseListener as PatternMessageParse } from "./messageParse";
import { PreCommandRunListener as PatternBeforeRun } from "./preCommandRun";

export function loadListeners() {
	const store = "listeners" as const;
	void container.modules.addModule({
		name: "PatternAccepted",
		module: PatternAccepted,
		store,
	});
	void container.modules.addModule({
		name: "PatternMessageParse",
		module: PatternMessageParse,
		store,
	});
	void container.modules.addModule({
		name: "PatternBeforeRun",
		module: PatternBeforeRun,
		store,
	});
}
