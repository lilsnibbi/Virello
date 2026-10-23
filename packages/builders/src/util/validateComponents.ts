import {
	ComponentType,
	type APIMessageTopLevelComponent,
} from "discord-api-types/v10";

/** Validate aggregate limits and component ids across the complete message tree. */
export function validateMessageComponents(
	components: readonly APIMessageTopLevelComponent[],
): void {
	let count = 0;
	const ids = new Set<number>();
	const customIds = new Set<string>();
	function visit(component: { type: number; id?: number }): void {
		count++;
		if (component.id) {
			if (ids.has(component.id))
				throw new TypeError("Component ids must be unique within a message.");
			ids.add(component.id);
		}
		if ("custom_id" in component && typeof component.custom_id === "string") {
			if (customIds.has(component.custom_id))
				throw new TypeError(
					"Interactive custom ids must be unique within a message.",
				);
			customIds.add(component.custom_id);
		}
		if ("components" in component && Array.isArray(component.components))
			for (const child of component.components) visit(child);
		if (
			component.type === ComponentType.Section &&
			"accessory" in component &&
			component.accessory
		)
			visit(component.accessory as { type: number; id?: number });
	}
	for (const component of components) visit(component);
	if (count > 40)
		throw new RangeError("A message supports at most 40 total components.");
}
