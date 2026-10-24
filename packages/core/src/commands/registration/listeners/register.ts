import { container } from "../../../core/modules/index";
import { BulkOverwriteListener as CoreApplicationCommandRegistriesBulkOverwrite } from "./bulkOverwrite";
import { InitialisingListener as CoreApplicationCommandRegistriesInitialising } from "./initialising";
import { RegisteredListener as CoreApplicationCommandRegistriesRegistered } from "./registered";

export function registerStatusListeners() {
	const store = "listeners" as const;
	void container.modules.addModule({
		name: "CoreApplicationCommandRegistriesInitialising",
		module: CoreApplicationCommandRegistriesInitialising,
		store,
	});
	void container.modules.addModule({
		name: "CoreApplicationCommandRegistriesRegistered",
		module: CoreApplicationCommandRegistriesRegistered,
		store,
	});
	void container.modules.addModule({
		name: "CoreApplicationCommandRegistriesBulkOverwrite",
		module: CoreApplicationCommandRegistriesBulkOverwrite,
		store,
	});
}
