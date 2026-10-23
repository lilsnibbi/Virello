import { expect, test } from "bun:test";
import { IpcWindow } from "../../src/sharding/transport/IpcWindow";
import { decode, frame, limits } from "../../src/sharding/transport/protocol";

test("IPC credits bound native queued bytes and duplicate receipts cannot manufacture capacity", () => {
	const window = new IpcWindow(
		limits({ maxBytes: 1024, maxBufferedBytes: 1024 }),
	);
	const messages: string[] = [];
	const message = frame("reply", "result", {
		ok: true,
		value: "x".repeat(600),
	});
	window.send(message, (encoded) => messages.push(encoded));
	expect(() => window.send(message, () => {})).toThrow("receipt window");
	const sent = decode(messages[0], 1024, ["reply"]);
	const receipt = frame("receipt", undefined, { sequence: sent.sequence });
	expect(window.receive(receipt, () => {})).toBe(false);
	window.receive(receipt, () => {});
	window.send(message, () => {});
	expect(() => window.send(message, () => {})).toThrow("receipt window");
});
