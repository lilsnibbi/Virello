import { endpoint, record } from "../common";
import type { $GatewayPacket } from "./types";

/** Validate the wire envelope before trusting Discord's versioned payload types. */
export function decodeFrame(data: unknown, maximum: number): $GatewayPacket {
	let text: string;
	if (typeof data === "string") {
		if (
			data.length > maximum ||
			new TextEncoder().encode(data).byteLength > maximum
		)
			throw new Error("Gateway frame exceeds maxFrameBytes.");
		text = data;
	} else if (data instanceof ArrayBuffer) {
		if (data.byteLength > maximum)
			throw new Error("Gateway frame exceeds maxFrameBytes.");
		text = new TextDecoder("utf-8", { fatal: true }).decode(data);
	} else throw new Error("Expected uncompressed JSON text or ArrayBuffer.");
	const packet: unknown = JSON.parse(text);
	if (!record(packet) || !Number.isInteger(packet.op))
		throw new Error("Invalid gateway envelope.");
	if (packet.op === 0) {
		if (
			!Number.isSafeInteger(packet.s) ||
			Number(packet.s) < 0 ||
			typeof packet.t !== "string" ||
			!record(packet.d)
		)
			throw new Error("Invalid gateway dispatch envelope.");
		if (
			packet.t === "READY" &&
			(typeof packet.d.session_id !== "string" ||
				!packet.d.session_id ||
				typeof packet.d.resume_gateway_url !== "string" ||
				!Array.isArray(packet.d.guilds))
		)
			throw new Error("Invalid READY session.");
	} else if (packet.op === 10) {
		if (
			!record(packet.d) ||
			typeof packet.d.heartbeat_interval !== "number" ||
			!Number.isFinite(packet.d.heartbeat_interval) ||
			packet.d.heartbeat_interval <= 0 ||
			packet.d.heartbeat_interval > 120_000
		)
			throw new Error("Invalid HELLO heartbeat interval.");
	} else if (packet.op === 9 && typeof packet.d !== "boolean")
		throw new Error("Invalid session resumability.");
	else if (![1, 7, 9, 11].includes(Number(packet.op)))
		throw new Error("Unexpected gateway opcode.");
	return packet as unknown as $GatewayPacket;
}

export function gatewayURL(value: string): string {
	const url = endpoint(value, true);
	url.searchParams.set("v", "10");
	url.searchParams.set("encoding", "json");
	url.searchParams.delete("compress");
	return url.href;
}
