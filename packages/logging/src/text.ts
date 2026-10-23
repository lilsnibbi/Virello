const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Wrap prepared content by display cells, preserving native theme SGR sequences. */
export function wrapText(text: string, width: number): string[] {
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (line && Bun.stringWidth(`${line} ${word}`) <= width) {
			line += ` ${word}`;
			continue;
		}
		if (line) {
			lines.push(line);
			line = "";
		}
		if (Bun.stringWidth(word) <= width) {
			line = word;
			continue;
		}
		// eslint-disable-next-line no-control-regex -- native theme SGR sequences must remain atomic while wrapping
		for (const token of word.split(/(\x1b\[[\d;]*m)/).filter(Boolean)) {
			if (token.startsWith("\x1b[")) {
				line += token;
				continue;
			}
			for (const { segment } of segmenter.segment(token)) {
				if (line && Bun.stringWidth(line + segment) > width) {
					lines.push(line);
					line = "";
				}
				line += segment;
			}
		}
	}
	if (line || !lines.length) lines.push(line);
	return lines;
}

export function textWidth(value: unknown, fallback = 100): number {
	return typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 32 &&
		value <= 200
		? value
		: fallback;
}
