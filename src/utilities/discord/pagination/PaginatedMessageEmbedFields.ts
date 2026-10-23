import { EmbedBuilder } from "@virello/builders";
import type {
	APIEmbed,
	APIEmbed as EmbedData,
	APIEmbedField as EmbedField,
} from "discord-api-types/v10";
import { isJSONEncodable } from "../../../discord/payloads";
import { isFunction, isNullishOrEmpty } from "../../index";
import { EmbedLimits } from "../constants/index";
import { PaginatedMessage } from "./PaginatedMessage";
import type { EmbedResolvable } from "./PaginatedMessageTypes";

/** This is a utility of {@link PaginatedMessage}, except it exclusively paginates the fields of an embed. */
export class PaginatedMessageEmbedFields extends PaginatedMessage {
	/** The `embedTemplate` field represents the template for the embed message. It is of type `APIEmbed`. It starts as an empty template and is validated after page content is added. */
	private embedTemplate: APIEmbed = {};

	/** The `totalPages` field represents the total number of pages in the paginated message. It is of type `number`. It is initialized to 0. */
	private totalPages: number = 0;

	/** The array of embed fields in the PaginatedMessageEmbedFields class. */
	private items: EmbedField[] = [];

	/** The `itemsPerPage` field represents the number of items to be displayed per page. It is of type `number`. It is initialized to 10. */
	private itemsPerPage: number = 10;

	/** Set the items to paginate. */
	public setItems(items: EmbedField[]): this {
		this.items = items;
		return this;
	}

	/** Set the amount of items that should be shown per page. */
	public setItemsPerPage(itemsPerPage: number): this {
		this.itemsPerPage = itemsPerPage;
		return this;
	}

	/** Set the template to be used to display the embed fields as pages. */
	public setTemplate(
		template: EmbedResolvable | ((embed: EmbedBuilder) => EmbedResolvable),
	): this {
		this.embedTemplate = this.resolveTemplate(template);
		return this;
	}

	/** Build the pages of the given array.  You must call the [[PaginatedMessageEmbedFields.make]] and [[PaginatedMessageEmbedFields.run]] methods last, in that order, for the pagination to work. */
	public make(): this {
		if (!this.items.length) throw new Error("The items array is empty.");
		if (this.itemsPerPage > EmbedLimits.MaximumFields)
			throw new Error(
				`Pages cannot contain more than ${EmbedLimits.MaximumFields} fields.`,
			);

		this.totalPages = Math.ceil(this.items.length / this.itemsPerPage);
		this.generatePages();
		return this;
	}

	/** Generates the pages for the paginated message. It clones the embed template, sets the fields, color, and adds the data to each page. */
	private generatePages(): void {
		const template = this.embedTemplate;
		for (let i = 0; i < this.totalPages; i++) {
			const clonedTemplate = new EmbedBuilder(template);
			const fieldsClone = isNullishOrEmpty(template.fields)
				? []
				: [...template.fields];
			if (fieldsClone.length > 0) clonedTemplate.setFields();

			if (template.color === undefined)
				clonedTemplate.setColor(Math.floor(Math.random() * 0x1000000));

			const data = this.paginateArray(
				this.items,
				i,
				this.itemsPerPage - fieldsClone.length,
			);
			this.addPage({
				embeds: [clonedTemplate.addFields(...data, ...fieldsClone)],
			});
		}
	}

	/** Paginates an array of EmbedFields. */
	private paginateArray(
		items: EmbedField[],
		currentPage: number,
		perPageItems: number,
	): EmbedField[] {
		const offset = currentPage * perPageItems;
		return items.slice(offset, offset + perPageItems);
	}

	/** Resolve the template for the PaginatedMessageEmbedFields. */
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
