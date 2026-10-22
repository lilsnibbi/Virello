import { requiredEnv } from "../config";
import type { TicketConfig } from "./flow";

/** Read this application's ticket configuration when a handler needs it. */
export function ticketConfig(): TicketConfig {
	return {
		guildId: requiredEnv("TICKET_GUILD_ID"),
		categoryId: requiredEnv("TICKET_CATEGORY_ID"),
		panelChannelId: requiredEnv("TICKET_PANEL_CHANNEL_ID"),
		supportRoleId: requiredEnv("TICKET_SUPPORT_ROLE_ID"),
		transcriptChannelId: requiredEnv("TICKET_TRANSCRIPT_CHANNEL_ID"),
	};
}
