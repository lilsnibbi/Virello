import {
	Routes,
	type APIApplicationCommand,
	type RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type { RestClient } from "../engine/rest/RestClient";

/** REST operations used by the framework registry. Results are native data in ordinary Maps. */
export class ApplicationCommands {
	constructor(
		private readonly rest: RestClient,
		readonly applicationId: string,
	) {}
	private path(guildId?: string): string {
		return guildId
			? Routes.applicationGuildCommands(this.applicationId, guildId)
			: Routes.applicationCommands(this.applicationId);
	}
	async fetch(
		options: { guildId?: string; withLocalizations?: boolean } = {},
	): Promise<Map<string, APIApplicationCommand>> {
		const commands = await this.rest.request<APIApplicationCommand[]>({
			method: "GET",
			path: `${this.path(options.guildId)}?with_localizations=${options.withLocalizations ?? true}`,
		});
		return new Map(commands.map((command) => [command.id, command]));
	}
	create(
		body: RESTPostAPIApplicationCommandsJSONBody,
		guildId?: string,
	): Promise<APIApplicationCommand> {
		return this.rest.request({
			method: "POST",
			path: this.path(guildId),
			body,
		});
	}
	edit(
		id: string,
		body: RESTPostAPIApplicationCommandsJSONBody,
		guildId?: string,
	): Promise<APIApplicationCommand> {
		return this.rest.request({
			method: "PATCH",
			path: `${this.path(guildId)}/${id}`,
			body,
		});
	}
	async set(
		body: readonly RESTPostAPIApplicationCommandsJSONBody[],
		guildId?: string,
	): Promise<Map<string, APIApplicationCommand>> {
		const commands = await this.rest.request<APIApplicationCommand[]>({
			method: "PUT",
			path: this.path(guildId),
			body,
		});
		return new Map(commands.map((command) => [command.id, command]));
	}
}
