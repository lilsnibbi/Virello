import { describe, expect, test } from "bun:test";
import { LocaleManager } from "../../../src/extensions/localisation/index";
import { isClass } from "../../../src/utilities/index";

function structureTest(i18n: LocaleManager) {
	expect(i18n.languagesLoaded).toBe(false);
	expect(i18n.languages).toBeDefined();
}

describe("LocaleManager", () => {
	test("LocaleManager should be a class", () => {
		expect(isClass(LocaleManager)).toBe(true);
	});

	test("Empty Constructor", () => {
		const i18n = new LocaleManager();
		structureTest(i18n);
	});

	test("Empty Object Constructor", () => {
		const i18n = new LocaleManager({});
		structureTest(i18n);
	});
});
