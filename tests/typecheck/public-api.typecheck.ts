import { expectTypeOf } from "expect-type";
import {
	container,
	Module,
	type ModuleOf,
	type ModuleStore,
	type ModuleStores,
	type TaskPayload,
} from "virello";

declare module "virello" {
	interface Container {
		exampleService: { ready: boolean };
	}
	interface Tasks {
		exampleReminder: { id: string };
	}
	interface ModuleStores {
		exampleStore: ModuleStore<Module, "exampleStore">;
	}
}

// TypeScript checks this file; Bun's runtime test discovery does not execute it.
expectTypeOf(container.exampleService.ready).toEqualTypeOf<boolean>();
expectTypeOf<TaskPayload<"exampleReminder">>().toEqualTypeOf<{ id: string }>();
expectTypeOf(container.modules.require("exampleStore")).toEqualTypeOf<
	ModuleStores["exampleStore"]
>();
expectTypeOf<ModuleOf<"exampleStore">>().toEqualTypeOf<Module>();
class ExamplePiece extends Module {}
void container.modules.addModule({
	store: "exampleStore",
	name: "example",
	module: ExamplePiece,
});
