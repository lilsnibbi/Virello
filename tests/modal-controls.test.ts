import { expect, test } from "bun:test";
import {
	CheckboxGroupBuilder,
	CheckboxGroupOptionBuilder,
	RadioGroupBuilder,
	RadioGroupOptionBuilder,
	LabelBuilder,
	ModalBuilder,
	ComponentType,
	createComponentBuilder,
	InteractionContext,
	type VirelloClient,
	DiscordAPI,
} from "virello";
import { EngineInteraction } from "@virello/engine/client";
import { RestClient } from "../packages/rest/src/index";

const options = [
	{ label: "Account", value: "account" },
	{ label: "Billing", value: "billing" },
];

test("ticket controls serialize through labels and round-trip through the modal factory", () => {
	const radio = new RadioGroupBuilder()
		.setCustomId("topic")
		.setRequired(false)
		.addOptions(
			(builder) => builder.setLabel("Account").setValue("account").setDefault(),
			new RadioGroupOptionBuilder(options[1]),
		);
	const checkbox = new CheckboxGroupBuilder()
		.setCustomId("details")
		.setRequired(false)
		.setMinValues(0)
		.setMaxValues(2)
		.addOptions(
			new CheckboxGroupOptionBuilder(options[0])
				.setDescription("Account help")
				.setDefault(),
			options[1],
		);
	const modal = new ModalBuilder()
		.setCustomId("support")
		.setTitle("Support")
		.addLabelComponents(
			(label) => label.setLabel("Topic").setRadioGroupComponent(radio),
			new LabelBuilder()
				.setLabel("Details")
				.setCheckboxGroupComponent(checkbox),
		)
		.toJSON();
	const [topic, details] = modal.components;
	expect(topic).toMatchObject({
		type: ComponentType.Label,
		component: {
			type: 21,
			custom_id: "topic",
			required: false,
			options: [{ ...options[0], default: true }, options[1]],
		},
	});
	expect(details).toMatchObject({
		type: ComponentType.Label,
		component: {
			type: 22,
			custom_id: "details",
			min_values: 0,
			max_values: 2,
			required: false,
		},
	});
	expect(new ModalBuilder(modal).toJSON()).toEqual(modal);
	expect(createComponentBuilder(radio.toJSON())).toBeInstanceOf(
		RadioGroupBuilder,
	);
	expect(createComponentBuilder(checkbox.toJSON())).toBeInstanceOf(
		CheckboxGroupBuilder,
	);
});

test("invalid ticket choices and inconsistent requiredness are rejected before display", () => {
	const invalid = [
		new RadioGroupBuilder({ custom_id: "topic", options: [options[0]] }),
		new RadioGroupBuilder({
			custom_id: "topic",
			options: [options[0], options[0]],
		}),
		new RadioGroupBuilder({
			custom_id: "topic",
			options: options.map((option) => ({ ...option, default: true })),
		}),
		new RadioGroupBuilder({
			custom_id: "topic",
			options: options.map((option) => ({ ...option, label: "x".repeat(101) })),
		}),
		new CheckboxGroupBuilder({ custom_id: "details", options, min_values: 0 }),
		new CheckboxGroupBuilder({
			custom_id: "details",
			options,
			min_values: 2,
			max_values: 1,
		}),
		new CheckboxGroupBuilder({ custom_id: "details", options, max_values: 3 }),
		new CheckboxGroupBuilder({
			custom_id: "details",
			options: [options[0], options[0]],
		}),
		new CheckboxGroupBuilder({
			custom_id: "details",
			options: options.map((option) => ({ ...option, default: true })),
			max_values: 1,
		}),
		new CheckboxGroupBuilder({ custom_id: "details", options: [] }),
	];
	for (const group of invalid) {
		const label = new LabelBuilder().setLabel("Choose");
		if (group instanceof RadioGroupBuilder) label.setRadioGroupComponent(group);
		else label.setCheckboxGroupComponent(group);
		expect(() =>
			new ModalBuilder()
				.setCustomId("support")
				.setTitle("Support")
				.addLabelComponents(label)
				.toJSON(),
		).toThrow();
	}
});

test("raw controls, optional selection limits and option snapshots retain their API meaning", () => {
	const data = {
		type: ComponentType.CheckboxGroup as const,
		custom_id: "details",
		options: structuredClone(options),
		required: false,
		min_values: 0,
		max_values: 2,
	};
	const label = new LabelBuilder({
		label: "Details",
		type: ComponentType.Label,
		component: data,
	});
	data.options[0].value = "changed";
	const first = label.toJSON();
	expect(first.component).toMatchObject({
		options,
		required: false,
		min_values: 0,
		max_values: 2,
	});
	if (!("options" in first.component)) throw new Error("test options");
	first.component.options[0].value = "mutated result";
	expect(label.toJSON().component).toMatchObject({ options });
	expect(
		new RadioGroupBuilder({ custom_id: "topic", options }).toJSON().required,
	).toBeUndefined();
});

test("modal fields preserve selected and optional empty group values with type checks", () => {
	const rest = new RestClient("test-token");
	const fields = new InteractionContext(
		{} as VirelloClient,
		new EngineInteraction(
			{
				type: DiscordAPI.InteractionType.ModalSubmit,
				data: {
					components: [
						{
							type: ComponentType.Label,
							id: 1,
							component: {
								type: ComponentType.RadioGroup,
								id: 2,
								custom_id: "topic",
								value: "billing",
							},
						},
						{
							type: ComponentType.Label,
							id: 3,
							component: {
								type: ComponentType.RadioGroup,
								id: 4,
								custom_id: "optional-topic",
								value: null,
							},
						},
						{
							type: ComponentType.Label,
							id: 5,
							component: {
								type: ComponentType.CheckboxGroup,
								id: 6,
								custom_id: "details",
								values: ["account", "billing"],
							},
						},
						{
							type: ComponentType.Label,
							id: 7,
							component: {
								type: ComponentType.CheckboxGroup,
								id: 8,
								custom_id: "optional-details",
								values: [],
							},
						},
					],
				},
			} as DiscordAPI.APIModalSubmitInteraction,
			rest,
		),
	).fields;
	rest.close();
	expect(fields.getRadioGroupValue("topic")).toBe("billing");
	expect(fields.getRadioGroupValue("optional-topic")).toBeNull();
	expect(fields.getCheckboxGroupValues("details")).toEqual([
		"account",
		"billing",
	]);
	expect(fields.getCheckboxGroupValues("optional-details")).toEqual([]);
	expect(() => fields.getCheckboxGroupValues("topic")).toThrow("allowed type");
	expect(() => fields.getRadioGroupValue("details")).toThrow("allowed type");
	expect(() => fields.getRadioGroupValue("missing")).toThrow("not found");
});
