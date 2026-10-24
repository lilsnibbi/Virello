import {
	Collector,
	type VirelloClient,
	RadioGroupBuilder,
	CheckboxGroupBuilder,
	LabelBuilder,
} from "virello";
import type { $GatewayCommand, $RestFile } from "@virello/engine";

// Compile the public raw TypeScript dependency with noImplicitOverride enabled.
export function collector(client: VirelloClient): Collector<[{ id: string }]> {
	return new Collector(client);
}
export function send(
	client: VirelloClient,
	payload: $GatewayCommand,
): Promise<void> {
	return client.engine.sendGateway(payload, { deadlineMs: 30000 });
}
export const radio = new LabelBuilder().setRadioGroupComponent(
	new RadioGroupBuilder(),
);
export const checkbox = new LabelBuilder().setCheckboxGroupComponent(
	new CheckboxGroupBuilder(),
);

export function upload(
	client: VirelloClient,
	file: $RestFile,
): Promise<unknown> {
	return client.rest.request({
		method: "POST",
		path: "/guilds/1/stickers",
		form: { name: "Wave", description: "", tags: "wave" },
		files: [file],
	});
}
