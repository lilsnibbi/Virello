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
	ModalSubmitInteraction,
	Client,
	DiscordAPI,
} from "virello";

const options = [
	{ label: "Account", value: "account" },
	{ label: "Billing", value: "billing" },
];

test("ticket controls serialize through labels and round-trip through the modal factory", () => {
	const radio = new RadioGroupBuilder()
		.setCustomId("topic")
		.setRequired(false)
		.addOptions(
			new RadioGroupOptionBuilder()
				.setLabel("Account")
				.setValue("account")
				.setDefault(true),
			new RadioGroupOptionBuilder(options[1]),
		);
	const checkbox = new CheckboxGroupBuilder()
		.setCustomId("details")
		.setRequired(false)
		.setMinValues(0)
		.setMaxValues(2)
		.addOptions(
			new CheckboxGroupOptionBuilder({ ...options[0] })
				.setDescription("Account help")
				.setDefault(true),
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

test("invalid ticket choices and selection limits are rejected before display", () => {
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

test("raw controls and explicitly copied inputs retain their API meaning", () => {
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
		component: structuredClone(data),
	});
	data.options[0].value = "changed";
	const first = structuredClone(label.toJSON());
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

test("modal fields preserve selected and optional empty group values with type checks", async () => {
	const client = new Client({ intents: [] });
	const fields = new ModalSubmitInteraction(client, {
		id: "123456789012345678",
		application_id: "123456789012345679",
		token: "test",
		version: 1,
		locale: "en-US",
		app_permissions: "0",
		entitlements: [],
		authorizing_integration_owners: {},
		user: {
			id: "123456789012345670",
			username: "tester",
			discriminator: "0",
			avatar: null,
		},
		type: DiscordAPI.InteractionType.ModalSubmit,
		data: {
			custom_id: "support",
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
	} as DiscordAPI.APIModalSubmitInteraction).fields;
	await client.destroy();
	expect(fields.getRadioGroup("topic")).toBe("billing");
	expect(fields.getRadioGroup("optional-topic")).toBeNull();
	expect(fields.getCheckboxGroup("details")).toEqual(["account", "billing"]);
	expect(fields.getCheckboxGroup("optional-details")).toEqual([]);
	expect(() => fields.getCheckboxGroup("topic")).toThrow();
	expect(() => fields.getRadioGroup("details")).toThrow();
	expect(() => fields.getRadioGroup("missing")).toThrow("not found");
});
