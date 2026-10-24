import { Events, Listener } from "virello/events";
import type { InteractionContext } from "virello/discord";
import { ticketConfig } from "../config";
import { handleTicketInteraction } from "../flow";

export default class TicketListener extends Listener<
	typeof Events.InteractionCreate
> {
	static override options: Listener.Options = {
		event: Events.InteractionCreate,
	};
	override async run(interaction: InteractionContext): Promise<void> {
		await handleTicketInteraction(interaction, ticketConfig());
	}
}
