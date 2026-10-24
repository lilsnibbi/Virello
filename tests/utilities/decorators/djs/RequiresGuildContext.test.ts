import { describe, expect, test } from "bun:test";
import { RequiresGuildContext } from "../../../../packages/core/src/utilities/decorators/index";

describe("RequiresGuildContext", () => {
	interface Message {
		guildId: string | null;
		guild: { name: string } | null;
	}

	test("GIVEN no guild THEN returns fallback", async () => {
		class Test {
			@RequiresGuildContext(() => "Fallback!")
			public getValue(message: Message) {
				return Promise.resolve(message.guild?.name);
			}
		}

		const instance = new Test();
		const result = await instance.getValue({ guildId: null, guild: null });
		expect(result).toBe("Fallback!");
	});

	test("GIVEN guild THEN returns guild name", async () => {
		class Test {
			@RequiresGuildContext(() => "Default")
			public getValue(message: Message) {
				return Promise.resolve(message.guild?.name);
			}
		}

		const instance = new Test();
		const result = await instance.getValue({
			guildId: "guild",
			guild: { name: "World!" },
		});
		expect(result).toBe("World!");
	});

	test("GIVEN no fallback AND no guild THEN returns undefined", async () => {
		class Test {
			@RequiresGuildContext()
			public getValue(message: Message) {
				return Promise.resolve(message.guild?.name);
			}
		}

		const instance = new Test();
		const result = await instance.getValue({ guildId: null, guild: null });
		expect(result).toBeUndefined();
	});
});
