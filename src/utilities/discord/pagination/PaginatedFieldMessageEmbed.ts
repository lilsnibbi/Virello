import { EmbedBuilder } from "../../../builders/messages/embed/Embed";
import type { APIEmbed, APIEmbed as EmbedData } from "discord-api-types/v10";
import { isJSONEncodable } from "../../../discord/payloads";
import { isFunction, isNullish, isNullishOrEmpty } from "../../index";
import { PaginatedMessage } from "./PaginatedMessage";
import type { EmbedResolvable } from "./PaginatedMessageTypes";

/** This is a utility of {@link PaginatedMessage}, except it exclusively adds pagination inside a field of an embed. */
export class PaginatedFieldMessageEmbed<T> extends PaginatedMessage {
	/** The `embedTemplate` field represents the template for the embed message. It is of type `APIEmbed`. It starts as an empty template and is validated after page content is added. */
	private embedTemplate: APIEmbed = {};

	/** The `totalPages` field represents the total number of pages in the paginated message. It is of type `number`. It is initialized to 0. */
	private totalPages: number = 0;

	/** The `items` field represents the items to be displayed in the paginated message. It is an array of type `T`. It is initialized to an empty array. */
	private items: T[] = [];

	/** The `itemsPerPage` field represents the number of items to be displayed per page. It is of type `number`. It is initialized to 10. */
	private itemsPerPage: number = 10;

	/** The `fieldTitle` field represents the title of the field in the embed message. It is of type `string`. It is initialized to an empty string. */
	private fieldTitle: string = "";

	/** Set the items to paginate. */
	public setItems(items: T[]) {
		this.items = items;
		return this;
	}

	/** Set the title of the embed field that will be used to paginate the items. */
	public setTitleField(title: string) {
		this.fieldTitle = title;
		return this;
	}

	/** Set the amount of items that should be shown per page. */
	public setItemsPerPage(itemsPerPage: number) {
		this.itemsPerPage = itemsPerPage;
		return this;
	}

	/** Set the template to be used to display the embed fields as pages. This template can either be set from a template {@link EmbedBuilder} instance or an object with embed options. */
	public setTemplate(
		template:
			EmbedData | EmbedResolvable | ((embed: EmbedBuilder) => EmbedResolvable),
	) {
		this.embedTemplate = this.resolveTemplate(template);
		return this;
	}

	/** Transform the stored items in place. Use the returned instance to retain the new item type when chaining calls. */
	public formatItems<R>(
		formatter: (item: T, index: number, array: T[]) => R,
	): PaginatedFieldMessageEmbed<R> {
		const items = this.items.map(formatter);
		// The fluent result carries the item type after this in-place transformation.
		const formatted = this as unknown as PaginatedFieldMessageEmbed<R>;
		formatted.items = items;
		return formatted;
	}

	/** Build the pages of the given array.  You must call the {@link PaginatedFieldMessageEmbed.make} and {@link PaginatedFieldMessageEmbed.run} methods last, in that order, for the pagination to work. */
	public make() {
		if (!this.fieldTitle.length)
			throw new Error("The title of the field to format must have a value.");
		if (!this.items.length) throw new Error("The items array is empty.");
		if (this.items.some((x) => !x))
			throw new Error("The format of the array items is incorrect.");

		this.totalPages = Math.ceil(this.items.length / this.itemsPerPage);
		this.generatePages();
		return this;
	}

	/** Generates the pages for the paginated field message embed. Each page contains a cloned template with modified fields and data. */
	private generatePages() {
		const template = this.embedTemplate;
		for (let i = 0; i < this.totalPages; i++) {
			const clonedTemplate = new EmbedBuilder(template);
			const fieldsClone = isNullishOrEmpty(template.fields)
				? []
				: [...template.fields];
			if (fieldsClone.length > 0) clonedTemplate.setFields();
			if (isNullish(template.color))
				clonedTemplate.setColor(Math.floor(Math.random() * 0x1000000));

			const data = this.paginateArray(this.items, i, this.itemsPerPage);
			this.addPage({
				embeds: [
					clonedTemplate.addFields(
						{ name: this.fieldTitle, value: data.join("\n"), inline: false },
						...fieldsClone,
					),
				],
			});
		}
	}

	/** Paginates an array of items.  @template T The type of items in the array. */
	private paginateArray(items: T[], currentPage: number, perPageItems: number) {
		const offset = currentPage * perPageItems;
		return items.slice(offset, offset + perPageItems);
	}

	/** Resolve the template for the embed. */
	private resolveTemplate(
		template:
			EmbedResolvable | EmbedData | ((embed: EmbedBuilder) => EmbedResolvable),
	): APIEmbed {
		if (isFunction(template)) template = template(new EmbedBuilder());
		return template instanceof EmbedBuilder
			? template.toData()
			: isJSONEncodable<APIEmbed>(template)
				? template.toJSON()
				: structuredClone(template);
	}
}
