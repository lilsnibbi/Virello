import { describe, expect, test } from "bun:test";
import {
	ActionRowBuilder,
	BuilderValidationError,
	ComponentType,
	FileUploadBuilder,
	LabelBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from "virello/builders";
import { ticketModal } from "../../examples/tickets/flow";

describe("modal label and upload builders", () => {
	test("serializes the ticket modal with labels and an optional upload", () => {
		const modal = ticketModal("123", "456").toJSON();
		expect(modal.custom_id).toBe("tickets:create:123:456");
		expect(modal.components).toHaveLength(3);
		expect(modal.components[0]).toMatchObject({
			type: ComponentType.Label,
			label: "Subject",
			component: {
				type: ComponentType.TextInput,
				custom_id: "subject",
				required: true,
			},
		});
		expect(modal.components[2]).toMatchObject({
			type: ComponentType.Label,
			component: {
				type: ComponentType.FileUpload,
				custom_id: "evidence",
				min_values: 0,
				max_values: 3,
				required: false,
			},
		});
		expect(new ModalBuilder(modal).toJSON()).toEqual(modal);
	});

	test("validates upload bounds inside labels for native data and builders", () => {
		const upload = new FileUploadBuilder()
			.setCustomId("evidence")
			.setMinValues(3)
			.setMaxValues(2);
		const modal = new ModalBuilder()
			.setCustomId("ticket")
			.setTitle("Ticket")
			.addLabelComponents(
				new LabelBuilder().setLabel("Evidence").setFileUploadComponent(upload),
			);
		expect(() => modal.toJSON()).toThrow(BuilderValidationError);
		upload.setMinValues(0);
		expect(() => modal.toJSON()).toThrow(BuilderValidationError);
		upload.setRequired(false);
		const native = modal.toJSON();
		const label = native.components[0];
		if (
			label.type !== ComponentType.Label ||
			label.component.type !== ComponentType.FileUpload
		)
			throw new Error("Expected an upload label.");
		label.component.max_values = 0;
		expect(() => new ModalBuilder(native).toJSON()).toThrow(
			BuilderValidationError,
		);
	});

	test("preserves legacy text-input rows and validates their children", () => {
		const input = new TextInputBuilder()
			.setCustomId("subject")
			.setLabel("Subject")
			.setStyle(TextInputStyle.Short);
		const modal = new ModalBuilder()
			.setCustomId("ticket")
			.setTitle("Ticket")
			.addActionRowComponents(
				new ActionRowBuilder<TextInputBuilder>().addComponents(input),
			);
		expect(modal.toJSON().components[0]).toMatchObject({
			type: ComponentType.ActionRow,
			components: [{ label: "Subject" }],
		});
		input.setMinLength(10).setMaxLength(5);
		expect(() => modal.toJSON()).toThrow(BuilderValidationError);
	});
});
