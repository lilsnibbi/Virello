import { container } from "../../core/modules/index";
import { ClientPermissionsCheck as ClientPermissions } from "./builtins/ClientPermissions";
import { CooldownCheck as Cooldown } from "./builtins/Cooldown";
import { DMOnlyCheck as DMOnly } from "./builtins/DMOnly";
import { EnabledCheck as Enabled } from "./builtins/Enabled";
import { GuildNewsOnlyCheck as GuildNewsOnly } from "./builtins/GuildNewsOnly";
import { GuildNewsThreadOnlyCheck as GuildNewsThreadOnly } from "./builtins/GuildNewsThreadOnly";
import { GuildOnlyCheck as GuildOnly } from "./builtins/GuildOnly";
import { GuildPrivateThreadOnlyCheck as GuildPrivateThreadOnly } from "./builtins/GuildPrivateThreadOnly";
import { GuildPublicThreadOnlyCheck as GuildPublicThreadOnly } from "./builtins/GuildPublicThreadOnly";
import { GuildTextOnlyCheck as GuildTextOnly } from "./builtins/GuildTextOnly";
import { GuildThreadOnlyCheck as GuildThreadOnly } from "./builtins/GuildThreadOnly";
import { GuildVoiceOnlyCheck as GuildVoiceOnly } from "./builtins/GuildVoiceOnly";
import { NSFWCheck as NSFW } from "./builtins/NSFW";
import { RunInCheck as RunIn } from "./builtins/RunIn";
import { UserPermissionsCheck as UserPermissions } from "./builtins/UserPermissions";

export function loadPreconditions(): void {
	void container.modules.addModule({
		name: "ClientPermissions",
		module: ClientPermissions,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "Cooldown",
		module: Cooldown,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "DMOnly",
		module: DMOnly,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "Enabled",
		module: Enabled,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "GuildNewsOnly",
		module: GuildNewsOnly,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "GuildNewsThreadOnly",
		module: GuildNewsThreadOnly,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "GuildOnly",
		module: GuildOnly,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "GuildPrivateThreadOnly",
		module: GuildPrivateThreadOnly,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "GuildPublicThreadOnly",
		module: GuildPublicThreadOnly,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "GuildTextOnly",
		module: GuildTextOnly,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "GuildThreadOnly",
		module: GuildThreadOnly,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "GuildVoiceOnly",
		module: GuildVoiceOnly,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "NSFW",
		module: NSFW,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "RunIn",
		module: RunIn,
		store: "preconditions",
	});
	void container.modules.addModule({
		name: "UserPermissions",
		module: UserPermissions,
		store: "preconditions",
	});
}
