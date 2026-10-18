import { writeEvent } from "../../core/logging/diagnostics";
import { container } from "../../core/modules/index";

export function bulkOverwriteError(error: unknown, guildId: string | null) {
	writeEvent(container.logger, "error", {
		component: "rest.registration",
		event: "bulk_overwrite_failed",
		message:
			"Discord rejected a bulk command replacement; inspect API access and command validation before repeating it.",
		context: { scope: guildId ? "guild" : "global", guildId },
		error,
	});
}

export function bulkOverwriteWarn(
	command: string,
	commandId: string,
	guildId?: string,
) {
	writeEvent(container.logger, "alert", {
		component: "rest.registration",
		event: "bulk_overwrite_warning",
		message:
			"Discord registered a command with no matching local handler; check module names and command types.",
		context: {
			command,
			commandId,
			scope: guildId ? "guild" : "global",
			guildId,
		},
	});
}

export function bulkOverwriteDebug(commands: number, guildId?: string) {
	writeEvent(container.logger, "debug", {
		component: "rest.registration",
		event: "bulk_overwrite_detail",
		message: "Replacing the full Discord command list for this scope.",
		context: { commands, scope: guildId ? "guild" : "global", guildId },
	});
}
