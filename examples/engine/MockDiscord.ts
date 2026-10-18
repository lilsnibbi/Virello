import type { ServerWebSocket } from "bun";
import type { APIMessage } from "discord-api-types/v10";

interface Connection {
	id: number;
}
function object(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** Loopback-only protocol harness with a tiny replay log. Never connects to Discord. */
export class MockDiscord {
	public readonly sentMessages: unknown[] = [];
	public readonly callbacks: unknown[] = [];
	public readonly packets: unknown[] = [];
	public connections = 0;
	private sequence = 0;
	private readonly sockets = new Set<ServerWebSocket<Connection>>();
	private history: { op: number; t: string; s: number; d: unknown }[] = [];
	private readonly server = Bun.serve<Connection>({
		hostname: "127.0.0.1",
		port: 0,
		fetch: async (request, server) => {
			const path = new URL(request.url).pathname;
			if (
				path === "/gateway" &&
				server.upgrade(request, { data: { id: ++this.connections } })
			)
				return;
			if (path === "/api/v10/gateway/bot")
				return Response.json({
					url: this.gatewayURL,
					shards: 1,
					session_start_limit: {
						total: 100,
						remaining: 100,
						reset_after: 86_400_000,
						max_concurrency: 1,
					},
				});
			if (
				path === "/api/v10/channels/20/messages" &&
				request.method === "POST"
			) {
				const body: unknown = await request.json();
				this.sentMessages.push(body);
				return Response.json(
					MockDiscord.message(
						"200",
						object(body) && typeof body.content === "string"
							? body.content
							: "",
					),
				);
			}
			if (/^\/api\/v10\/interactions\/[^/]+\/[^/]+\/callback$/.test(path)) {
				this.callbacks.push(await request.json());
				return new Response(null, { status: 204 });
			}
			return Response.json(
				{ message: "Local fixture route not found" },
				{ status: 404 },
			);
		},
		websocket: {
			open: (socket) => {
				this.sockets.add(socket);
				socket.send(
					JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }),
				);
			},
			message: (socket, raw) => {
				const packet: unknown = JSON.parse(
					typeof raw === "string" ? raw : raw.toString(),
				);
				if (!object(packet)) throw new Error("Invalid client frame.");
				this.packets.push(packet);
				if (packet.op === 1) socket.send(JSON.stringify({ op: 11, d: null }));
				if (packet.op === 2) {
					this.sequence = 0;
					this.history = [];
					this.dispatch("READY", {
						v: 10,
						user: {
							id: "99",
							username: "engine",
							discriminator: "0",
							avatar: null,
							global_name: null,
							bot: true,
							verified: true,
							mfa_enabled: false,
							email: null,
						},
						guilds: [],
						session_id: "local-session",
						resume_gateway_url: this.gatewayURL,
						application: { id: "99", flags: 0, flags_new: "0" },
					});
				}
				if (packet.op === 6) {
					const sequence =
						object(packet.d) && typeof packet.d.seq === "number"
							? packet.d.seq
							: -1;
					for (const saved of this.history)
						if (saved.s > sequence) socket.send(JSON.stringify(saved));
					this.dispatch("RESUMED", {});
				}
			},
			close: (socket) => {
				this.sockets.delete(socket);
			},
		},
	});
	public get baseURL(): string {
		return `http://127.0.0.1:${this.server.port}/api/v10`;
	}
	public get gatewayURL(): string {
		return `ws://127.0.0.1:${this.server.port}/gateway`;
	}
	public dispatch(t: string, d: unknown): void {
		const packet = { op: 0, t, d, s: ++this.sequence };
		this.history.push(packet);
		if (this.history.length > 128) this.history.shift();
		for (const socket of this.sockets) socket.send(JSON.stringify(packet));
	}
	public reconnect(): void {
		for (const socket of this.sockets)
			socket.send(JSON.stringify({ op: 7, d: null }));
	}
	public async stop(): Promise<void> {
		await this.server.stop(true);
	}
	public static message(id = "100", content = "!engine-ping"): APIMessage {
		return {
			id,
			channel_id: "20",
			author: {
				id: "1",
				username: "local-user",
				discriminator: "0",
				global_name: null,
				avatar: null,
			},
			content,
			timestamp: "2026-01-01T00:00:00.000Z",
			edited_timestamp: null,
			tts: false,
			mention_everyone: false,
			mentions: [],
			mention_roles: [],
			attachments: [],
			embeds: [],
			pinned: false,
			type: 0,
		};
	}
}
