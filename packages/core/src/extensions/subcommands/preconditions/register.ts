import { container } from "../../../core/modules/index";
import { SubcommandCooldownCheck as SubcommandCooldown } from "./SubcommandCooldown";

/** Register the built-in SubcommandCooldown check with the shared module registry. */
export function loadPreconditions() {
	const store = "preconditions" as const;
	void container.modules.addModule({
		name: "SubcommandCooldown",
		module: SubcommandCooldown,
		store,
	});
}
