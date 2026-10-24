import { expectTypeOf } from "expect-type";
import type * as Root from "virello";
import type * as Client from "virello/client";
import type * as Commands from "virello/commands";
import type * as Discord from "virello/discord";
import type * as Events from "virello/events";
import type * as Extensions from "virello/extensions";
import type * as Localisation from "virello/localisation";
import type * as Modules from "virello/modules";
import type * as Scheduling from "virello/scheduling";
import type * as Services from "virello/services";
import type * as Sharding from "virello/sharding";
import type * as Time from "virello/time";
import type * as Utilities from "virello/utilities";
import type * as Validation from "virello/validation";

declare module "virello" {
	interface Container {
		fromRoot: boolean;
	}
	interface ModuleStores {
		rootStore: Modules.ModuleStore<Modules.Module, "rootStore">;
	}
	interface Preconditions {
		RootCheck: { root: boolean };
	}
	interface Tasks {
		rootJob: { id: number };
	}
	interface ShardRequests {
		rootRequest: { input: null; output: string };
	}
}
expectTypeOf<Client.VirelloClient>().toEqualTypeOf<Root.VirelloClient>();
expectTypeOf<Client.VirelloClientOptions>().toEqualTypeOf<Root.VirelloClientOptions>();
expectTypeOf<Commands.Command>().toEqualTypeOf<Root.Command>();
expectTypeOf<Discord.Pagination>().toEqualTypeOf<Root.Pagination>();
expectTypeOf<Events.Listener>().toEqualTypeOf<Root.Listener>();
expectTypeOf<Extensions.ExtensionOptions>().toEqualTypeOf<Root.ExtensionOptions>();
expectTypeOf<Localisation.InternationalizationOptions>().toEqualTypeOf<Root.InternationalizationOptions>();
expectTypeOf<Modules.Module>().toEqualTypeOf<Root.Module>();
expectTypeOf<Scheduling.TaskScheduler>().toEqualTypeOf<Root.TaskScheduler>();
expectTypeOf<Services.Service>().toEqualTypeOf<Root.Service>();
expectTypeOf<Sharding.ShardManager>().toEqualTypeOf<Root.ShardManager>();
expectTypeOf<Time.Duration>().toEqualTypeOf<Root.Duration>();
expectTypeOf<Utilities.Result<number, Error>>().toEqualTypeOf<
	Root.Result<number, Error>
>();
expectTypeOf<Validation.Type<string>>().toEqualTypeOf<Root.Type<string>>();
expectTypeOf<Client.Container["fromRoot"]>().toEqualTypeOf<boolean>();
expectTypeOf<Modules.ModuleOf<"rootStore">>().toEqualTypeOf<Root.Module>();
expectTypeOf<Commands.Preconditions["RootCheck"]>().toEqualTypeOf<{
	root: boolean;
}>();
expectTypeOf<Scheduling.TaskPayload<"rootJob">>().toEqualTypeOf<{
	id: number;
}>();

export function requestTypes(
	client: Client.VirelloClient,
	manager: Sharding.ShardManager,
) {
	expectTypeOf(client.sharding.request(0, "rootRequest", null)).toEqualTypeOf<
		Promise<string>
	>();
	expectTypeOf(manager.request(0, "rootRequest", null)).toEqualTypeOf<
		Promise<string>
	>();
	// @ts-expect-error Invalid root-augmented payload is rejected through the category.
	void client.sharding.request(0, "rootRequest", {});
	// @ts-expect-error Invalid root-augmented payload is rejected through the root type.
	const invalid: Root.TaskPayload<"rootJob"> = { id: "bad" };
	void invalid;
}

// @ts-expect-error Every public entrypoint uses named exports.
import defaultCommands from "virello/commands";

void defaultCommands;

// @ts-expect-error There are no arbitrary deep category paths.
import type { Command as DeepCommand } from "virello/commands/Command";
// @ts-expect-error Package metadata is not a public entrypoint.
import metadata from "virello/package.json";
// @ts-expect-error Client implementation files remain private.
import type { VirelloClient as PrivateClient } from "virello/src/core/client/VirelloClient";
// @ts-expect-error Category files are not additional supported subpaths.
import type { Command as PrivateCommand } from "virello/src/public/commands";
export type PrivatePaths = [PrivateClient, PrivateCommand, DeepCommand];
void metadata;
