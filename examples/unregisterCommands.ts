import { Routes } from "discord-api-types/v10";
import { RestClient } from "virello/engine";
import type { RESTGetCurrentApplicationResult } from "discord-api-types/v10";
import { developmentGuild, requiredEnv } from "./config";

const guildId = developmentGuild();
const rest = new RestClient(requiredEnv("DISCORD_TOKEN"));
const application = await rest.request<RESTGetCurrentApplicationResult>({
	method: "GET",
	path: Routes.currentApplication(),
});

await rest.request({
	method: "PUT",
	path: Routes.applicationCommands(application.id),
	body: [],
});
console.log("Cleared all global application commands.");

if (guildId) {
	await rest.request({
		method: "PUT",
		path: Routes.applicationGuildCommands(application.id, guildId),
		body: [],
	});
	console.log(`Cleared all application commands in dev guild ${guildId}.`);
} else {
	console.log("DEV_GUILD_ID is blank; skipped guild commands.");
}
rest.close();
