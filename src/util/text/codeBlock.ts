const zws = String.fromCharCode(8203);

/** Wrap content in a fenced Markdown code block, optionally with a language. Content is interpolated without escaping embedded fences. */
export function codeBlock<C extends string>(content: C): `\`\`\`\n${C}\n\`\`\``;

/** Wrap content in a fenced Markdown code block, optionally with a language. Content is interpolated without escaping embedded fences. */
export function codeBlock<L extends string, C extends string>(
	language: L,
	content: C,
): `\`\`\`${L}\n${C}\n\`\`\``;
/** Wrap content in a fenced Markdown code block, optionally with a language. Content is interpolated without escaping embedded fences. */
export function codeBlock(...args: [string, string?]): string {
	const [language, content] = args.length === 1 ? ["", args[0]] : args;
	return `\`\`\`${language}\n${String(content).replace(/```/, `\`${zws}\`\``).replace(/`$/g, `\`${zws}`)}\n\`\`\``;
}
