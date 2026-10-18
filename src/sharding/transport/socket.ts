// lib.dom shadows Bun's constructor overload. The runtime remains Bun's native WebSocket.
export type NativeSocket = WebSocket & { terminate(): void };
export const Socket = globalThis.WebSocket as unknown as {
	new (url: string, options: Bun.WebSocketOptions): NativeSocket;
};
