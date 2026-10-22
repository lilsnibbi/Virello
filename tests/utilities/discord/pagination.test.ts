import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	type ModalBuilder,
	EmbedBuilder,
	SeparatorBuilder,
} from "virello/builders";
import {
	type APIContainerComponent,
	type APIActionRowComponent,
	type APIButtonComponentWithCustomId,
	type APIEmbed,
	ButtonStyle,
	ComponentType,
	InteractionType,
	MessageFlags,
} from "discord-api-types/v10";
import {
	type ButtonInteraction,
	type MessageContext as Message,
	type ModalSubmitInteraction,
	type InteractionCollectorOptions,
	VirelloClient as Client,
	Events,
	InteractionCollector,
} from "virello";
import { RestError } from "../../../src/engine/rest/RestError";
import { container, Pagination, type PaginationTarget } from "virello";

type Snapshot = {
	components: (
		| APIContainerComponent
		| APIActionRowComponent<APIButtonComponentWithCustomId>
	)[];
	embeds: APIEmbed[];
	content?: string;
	flags?: number;
	allowed_mentions?: { parse?: string[]; replied_user?: boolean };
};

const paginations: Pagination[] = [];
const clients: Client[] = [];
afterEach(async () => {
	await Promise.all(paginations.splice(0).map((p) => p.stop()));
	await Promise.all(clients.splice(0).map((c) => c.destroy()));
});
const tick = () => Bun.sleep(5);
function track(p: Pagination): Pagination {
	paginations.push(p);
	return p;
}
function harness(interaction = false) {
	const client =
		clients[0] ??
		new Client({
			intents: [],
			logger: { debug() {}, notif() {}, alert() {}, error() {} },
		});
	if (!clients.includes(client)) clients.push(client);
	const payloads: Snapshot[] = [];
	const collectors: InteractionCollector<ButtonInteraction>[] = [];
	const messageBase = {
		id: crypto.randomUUID(),
		channelId: "channel",
		guildId: null,
		client,
	};
	const save = (payload: unknown): Message => {
		payloads.push(JSON.parse(JSON.stringify(payload)));
		return message as unknown as Message;
	};
	const message = {
		...messageBase,
		edit: mock(async (payload: unknown) => save(payload)),
		createMessageComponentCollector: mock(
			(options: InteractionCollectorOptions<ButtonInteraction>) => {
				const collector = new InteractionCollector<ButtonInteraction>(client, {
					...options,
					message: messageBase as unknown as Message,
				});
				collectors.push(collector);
				return collector;
			},
		),
	};
	const rawTarget = {
		user: { id: "owner" },
		client,
		deferred: false,
		replied: false,
		deferReply: mock(async (_options?: unknown) => {
			rawTarget.deferred = true;
		}),
		editReply: mock(async (payload: unknown) => save(payload)),
		reply: mock(async (payload: unknown) => save(payload)),
	};
	const target = interaction
		? rawTarget
		: { client, author: { id: "owner" }, reply: rawTarget.reply };
	const buttons = () => {
		const latest = payloads.at(-1);
		if (!latest) throw new Error("No pagination payload was sent.");
		const components =
			latest.components[0]?.type === ComponentType.Container
				? latest.components[0].components
				: latest.components;
		return components
			.filter((component) => component.type === ComponentType.ActionRow)
			.flatMap((row) => row.components)
			.filter(
				(component): component is APIButtonComponentWithCustomId =>
					component.type === ComponentType.Button && "custom_id" in component,
			);
	};
	const button = (
		action: string,
		user = "owner",
		messageId: string = message.id,
	) => {
		const customId =
			buttons().find((b) => b.custom_id.endsWith(`:${action}`))?.custom_id ??
			action;
		const entry = {
			id: crypto.randomUUID(),
			customId,
			user: { id: user },
			message: { id: messageId },
			channelId: "channel",
			guildId: null,
			client,
			type: InteractionType.MessageComponent,
			data: { data: { component_type: ComponentType.Button } },
			isMessageComponent: () => true,
			deferUpdate: mock(async () => {}),
			showModal: mock(async (_modal: ModalBuilder) => {}),
			isModalSubmit: () => false,
		};
		return entry as typeof entry & ButtonInteraction;
	};
	const click = async (
		action: string,
		user = "owner",
		messageId: string = message.id,
	) => {
		const entry = button(action, user, messageId);
		client.emit(Events.InteractionCreate, entry);
		await tick();
		return entry as typeof entry & ButtonInteraction;
	};
	return {
		client,
		target: target as unknown as PaginationTarget,
		rawTarget,
		message,
		payloads,
		buttons,
		button,
		click,
		collectors,
		text(index: number) {
			const component = payloads.at(-1)?.components[0];
			if (component?.type !== ComponentType.Container)
				throw new Error("Expected a container.");
			const child = component.components[index];
			if (child?.type !== ComponentType.TextDisplay)
				throw new Error("Expected text.");
			return child.content;
		},
	};
}

describe("list pagination interactions", () => {
	test("fills an unfinished color-only template before validating the final embed", async () => {
		const h = harness();
		const template = new EmbedBuilder().setColor(0);
		const pagination = track(
			new Pagination(["Ticket details"], { type: "embed", embed: template }),
		);
		await pagination.send(h.target);
		expect(h.payloads.at(-1)!.embeds[0]).toMatchObject({
			color: 0,
			description: "Ticket details",
		});
		expect(template.toData().description).toBeUndefined();
		expect(() => template.toJSON()).toThrow();
	});
	test("embed navigation clamps boundaries, uses unique controls, and preserves supplied templates", async () => {
		const h = harness();
		const embed = new EmbedBuilder()
			.setTitle("Entries")
			.setFooter({ text: "App footer" });
		const list = ["a", "b", "c"];
		const p = track(
			new Pagination(list, {
				type: "embed",
				embed,
				entriesPerPage: 1,
				showSkipButtons: true,
			}),
		);
		list.push("changed");
		await p.send(h.target);
		expect(p.pageCount).toBe(3);
		expect(h.buttons()[0].disabled).toBe(true);
		await h.click("next");
		expect(p.page).toBe(2);
		expect(h.payloads.at(-1)!.embeds[0].description).toBe("b");
		await h.click("last");
		await h.click("next");
		expect(p.page).toBe(3);
		expect(h.buttons().at(-1)!.disabled).toBe(true);
		await h.click("first");
		await h.click("back");
		expect(p.page).toBe(1);
		expect(embed.toJSON().description).toBeUndefined();
		expect(h.payloads.at(-1)!.embeds[0].footer?.text).toBe("App footer");
		const other = harness();
		await track(
			new Pagination(["a", "b"], { type: "embed", entriesPerPage: 1 }),
		).send(other.target);
		expect(other.buttons()[0].custom_id).not.toBe(h.buttons()[1].custom_id);
	});
	test("the real Discord collector scopes message, owner and exact action IDs", async () => {
		const h = harness();
		const p = track(
			new Pagination(["a", "b"], { type: "embed", entriesPerPage: 1 }),
		);
		await p.send(h.target);
		const unauthorized = await h.click("next", "someone-else");
		expect(unauthorized.deferUpdate).toHaveBeenCalledTimes(1);
		expect(p.page).toBe(1);
		const unrelated = await h.click("a-static-layout-button");
		expect(unrelated.deferUpdate).not.toHaveBeenCalled();
		const otherMessage = await h.click("next", "owner", "other-message");
		expect(otherMessage.deferUpdate).not.toHaveBeenCalled();
		expect(p.page).toBe(1);
		const accepted = await h.click("next");
		expect(accepted.deferUpdate).toHaveBeenCalledTimes(1);
		expect(p.page).toBe(2);
	});
	test("V2 layout, replacements, mention safety and ephemeral defer work together", async () => {
		const h = harness(true);
		const p = track(
			new Pagination(["@everyone {{name}}", "second"], {
				type: "container",
				entriesPerPage: 1,
				ephemeral: true,
				replacements: { "{{name}}": "$& literal" },
				accentColor: 0x5865f2,
				layout: [
					"# Title",
					new SeparatorBuilder(),
					Pagination.DATA,
					Pagination.BUTTONS,
				],
				buttons: { next: { label: "More", style: ButtonStyle.Success } },
			}),
		);
		await p.send(h.target);
		expect(h.rawTarget.deferReply).toHaveBeenCalledWith({
			flags: MessageFlags.Ephemeral,
		});
		expect(h.payloads[0].flags).toBe(MessageFlags.IsComponentsV2);
		expect(h.payloads[0].allowed_mentions).toEqual({
			parse: [],
			replied_user: false,
		});
		expect(h.text(2)).toBe("@everyone $& literal");
		expect(h.buttons().at(-1)!.label).toBe("More");
		await h.click("next");
		expect(h.text(2)).toBe("second");
	});
	test("already-deferred interactions edit the existing reply without another acknowledgement", async () => {
		const h = harness(true);
		h.rawTarget.deferred = true;
		await track(new Pagination(["single"], { type: "embed" })).send(h.target);
		expect(h.rawTarget.deferReply).not.toHaveBeenCalled();
		expect(h.rawTarget.editReply).toHaveBeenCalled();
		expect(h.collectors).toHaveLength(0);
	});
	test("modal jumps check both the unique ID and owner, then validate the full number", async () => {
		const h = harness();
		const p = track(
			new Pagination(["a", "b", "c"], { type: "embed", entriesPerPage: 1 }),
		);
		await p.send(h.target);
		const jump = await h.click("jump");
		const modal = jump.showModal.mock.calls[0][0].toJSON();
		const submission = (
			value: string,
			user = "owner",
			id = modal.custom_id,
		) => ({
			id: crypto.randomUUID(),
			type: InteractionType.ModalSubmit,
			customId: id,
			user: { id: user },
			isModalSubmit: () => true,
			isMessageComponent: () => false,
			fields: { getTextInput: () => value },
			deferUpdate: mock(async () => {}),
			reply: mock(async () => {}),
		});
		const wrong = submission("3", "intruder");
		h.client.emit(
			Events.InteractionCreate,
			wrong as unknown as ModalSubmitInteraction,
		);
		await tick();
		expect(wrong.deferUpdate).not.toHaveBeenCalled();
		const invalid = submission("2e0");
		h.client.emit(
			Events.InteractionCreate,
			invalid as unknown as ModalSubmitInteraction,
		);
		await tick();
		expect(invalid.reply).toHaveBeenCalled();
		expect(p.page).toBe(1);
		const again = await h.click("jump");
		const secondId = again.showModal.mock.calls[0][0].toJSON().custom_id;
		expect(secondId).not.toBe(modal.custom_id);
		const valid = submission("3", "owner", secondId);
		h.client.emit(
			Events.InteractionCreate,
			valid as unknown as ModalSubmitInteraction,
		);
		await tick();
		expect(valid.deferUpdate).toHaveBeenCalledTimes(1);
		expect(p.page).toBe(3);
	});
	test("idle timeout disables controls and releases pending modals exactly once", async () => {
		const h = harness();
		const ended = mock(() => {});
		const p = track(
			new Pagination(["a", "b"], {
				type: "embed",
				entriesPerPage: 1,
				idleTimeout: 50,
				modalTimeout: 1000,
				onEnd: ended,
			}),
		);
		const initial = h.client.listenerCount(Events.InteractionCreate);
		await p.send(h.target);
		await h.click("jump");
		expect(h.client.listenerCount(Events.InteractionCreate)).toBeGreaterThan(
			initial,
		);
		await Bun.sleep(85);
		expect(p.stopped).toBe(true);
		expect(h.buttons().every((button) => button.disabled)).toBe(true);
		expect(h.client.listenerCount(Events.InteractionCreate)).toBe(initial);
		expect(ended).toHaveBeenCalledTimes(1);
		await p.stop();
		expect(ended).toHaveBeenCalledTimes(1);
	});
	test("idle is reset by authorised activity, not by other users", async () => {
		const h = harness();
		const p = track(
			new Pagination(["a", "b"], {
				type: "embed",
				entriesPerPage: 1,
				idleTimeout: 80,
			}),
		);
		await p.send(h.target);
		await Bun.sleep(45);
		await h.click("next");
		await Bun.sleep(45);
		expect(p.stopped).toBe(false);
		await h.click("back", "intruder");
		await Bun.sleep(55);
		expect(p.stopped).toBe(true);
	});
	test("queued rendering cannot overwrite the final disabled controls", async () => {
		const h = harness();
		const p = track(
			new Pagination(["a", "b", "c"], { type: "embed", entriesPerPage: 1 }),
		);
		await p.send(h.target);
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		let editing = false;
		h.message.edit.mockImplementationOnce(async (payload: unknown) => {
			editing = true;
			await gate;
			h.payloads.push(JSON.parse(JSON.stringify(payload)));
			return h.message as unknown as Message;
		});
		await h.click("next");
		expect(editing).toBe(true);
		await h.click("next");
		const stopped = p.stop();
		release();
		await stopped;
		expect(h.buttons().every((button) => button.disabled)).toBe(true);
		expect(p.page).toBe(2);
	});
	test("deleted messages and edit failures stop collecting without unhandled rejections", async () => {
		const h = harness();
		const errors: unknown[] = [];
		const p = track(
			new Pagination(["a", "b"], {
				type: "embed",
				entriesPerPage: 1,
				onError: (error) => errors.push(error),
			}),
		);
		await p.send(h.target);
		h.message.edit.mockRejectedValue(new RestError(404, { code: 10008 }));
		await h.click("next");
		await tick();
		expect(p.stopped).toBe(true);
		expect(errors).toEqual([]);
		expect(h.collectors[0].ended).toBe(true);
		const other = harness();
		const second = track(
			new Pagination(["a", "b"], {
				type: "embed",
				entriesPerPage: 1,
				onError: (error) => errors.push(error),
			}),
		);
		await second.send(other.target);
		other.message.edit.mockRejectedValueOnce(new Error("Missing permissions"));
		await other.click("next");
		await tick();
		expect(second.stopped).toBe(true);
		expect(errors).toHaveLength(1);
	});
	test("empty lists have a placeholder and no collector, and send failures are visible", async () => {
		const h = harness();
		const p = track(new Pagination([], { type: "container" }));
		await p.send(h.target);
		expect(h.text(0)).toBe("No data to show");
		expect(h.buttons()).toEqual([]);
		expect(h.collectors).toEqual([]);
		await expect(p.send(h.target)).rejects.toThrow("once");
		const broken = harness();
		broken.rawTarget.reply.mockRejectedValue(new Error("send failed"));
		const bad = track(new Pagination(["x"], { type: "embed" }));
		await expect(bad.send(broken.target)).rejects.toThrow("send failed");
		expect(bad.stopped).toBe(true);
	});
	test("a rejected error callback still closes collectors and reports its cause", async () => {
		const h = harness();
		const previousLogger = container.logger;
		const logged = mock((_value: unknown) => {});
		container.logger = {
			debug: mock(() => {}),
			notif: mock(() => {}),
			alert: mock(() => {}),
			error: logged,
		};
		try {
			const p = track(
				new Pagination(["a", "b"], {
					type: "embed",
					entriesPerPage: 1,
					onError: async () => {
						throw new Error("callback failed");
					},
				}),
			);
			await p.send(h.target);
			h.message.edit.mockRejectedValueOnce(new Error("edit failed"));
			await h.click("next");
			await tick();
			expect(p.stopped).toBe(true);
			expect(h.collectors[0].ended).toBe(true);
			expect(logged).toHaveBeenCalled();
		} finally {
			container.logger = previousLogger;
		}
	});
	test("invalid page sizes, oversized entries and missing layout controls fail early", () => {
		expect(
			() => new Pagination(["a"], { type: "embed", entriesPerPage: 0 }),
		).toThrow("positive integer");
		expect(() => new Pagination(["x".repeat(4097)], { type: "embed" })).toThrow(
			"text limit",
		);
		expect(
			() =>
				new Pagination(["a"], { type: "container", layout: [Pagination.DATA] }),
		).toThrow("exactly one");
	});
});
