import { expect, test } from "bun:test";
import { PaginatedFieldMessageEmbed } from "../../../src/utilities/discord/pagination/PaginatedFieldMessageEmbed";

test("field formatters carry transformed item types through the same paginator", () => {
	const original = new PaginatedFieldMessageEmbed<{ label: string }>()
		.setItems([{ label: "first" }, { label: "second" }])
		.setTitleField("Entries");
	const formatted = original
		.formatItems((item) => item.label)
		.formatItems((label) => label.toUpperCase())
		.make();

	expect<unknown>(formatted).toBe(original);
	expect(JSON.parse(JSON.stringify(formatted.pages[0]))).toMatchObject({
		embeds: [{ fields: [{ name: "Entries", value: "FIRST\nSECOND" }] }],
	});
});
