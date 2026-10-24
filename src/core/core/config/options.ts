import { type } from "arktype";

const cooldown = type({
	"delay?": "number >= 0",
	"limit?": "number.integer >= 0",
	"scope?": "number.integer >= 0",
	"filteredUsers?": "string[]",
	"filteredCommands?": "string[]",
});

/** Check framework options before starting a client. Discord validates its own options. */
export const clientOptionsSchema = type({
	"defaultPrefix?": "string | string[] | null",
	"caseInsensitiveCommands?": "boolean | null",
	"caseInsensitivePrefixes?": "boolean | null",
	"disableMentionPrefix?": "boolean",
	"typing?": "boolean",
	"messageCommands?": "boolean",
	"logErrors?": "boolean",
	"logRegistrations?": "boolean",
	"traceModules?": "boolean",
	"logging?": type({
		"format?": "'text' | 'json'",
		"stacks?": "'off' | 'short' | 'full'",
		"redact?": "string[]",
	}),
	"defaultCooldown?": cooldown,
	"preventFailedToFetchLogForGuilds?": "string[] | true",
});
