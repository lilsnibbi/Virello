import type { VirelloClient } from "../../core/client/VirelloClient";
import { ShardError } from "../types";
import { GatewayBlockedError } from "../../engine/gateway/GatewayShard";

/** Reconcile native gateway assignments while retaining modules, REST and application listeners. */
export class ManagedGateway {
	private assignment?: { shard: number | null; count: number };
	private revision = 0;
	private onlineRevision = -1;
	private token?: string;
	private closed = false;
	private running?: Promise<string>;
	private attempt?: Promise<unknown>;
	private changed?: () => void;
	public constructor(
		private readonly client: VirelloClient,
		private readonly waitForAssignment: () => Promise<void>,
		private readonly fail: (error: unknown) => void,
	) {}
	/** Revoke gateway authority immediately; keep the client available for a later assignment. */
	public suspend(): void {
		if (this.closed) return;
		this.revision++;
		this.changed?.();
		this.assignment = undefined;
		this.client.reassignGateway(null);
	}
	public async reconcile(shard: number | null, count: number): Promise<void> {
		if (
			this.closed ||
			(this.assignment?.shard === shard && this.assignment.count === count)
		)
			return;
		const revision = ++this.revision;
		this.changed?.();
		this.client.reassignGateway(shard === null ? null : [shard, count]);
		await this.client.waitForGatewayClose();
		await this.attempt?.catch(() => {});
		if (this.closed || revision !== this.revision) return;
		this.assignment = { shard, count };
	}
	public start(token?: string): Promise<string> {
		const value = token;
		if (!value || typeof value !== "string")
			return Promise.reject(
				new ShardError("CONFIG", "A Discord bot token is required."),
			);
		this.token = value.replace(/^(Bot|Bearer)\s*/i, "");
		return this.connect();
	}
	public resume(): void {
		if (this.token && !this.closed) void this.connect().catch(this.fail);
	}
	public stop(): void {
		this.closed = true;
		this.changed?.();
		this.revision++;
		this.client.reassignGateway(null);
	}
	private connect(): Promise<string> {
		return (this.running ??= this.open().finally(() => {
			this.running = undefined;
		}));
	}
	private async open(): Promise<string> {
		while (!this.closed) {
			const revision = this.revision;
			await this.waitForAssignment();
			if (this.closed) break;
			if (revision !== this.revision || this.assignment?.shard == null)
				continue;
			if (this.onlineRevision === this.revision) return this.token!;
			const attempt = this.client.openGateway(this.token);
			this.attempt = attempt;
			try {
				await attempt;
				if (revision === this.revision && !this.closed) {
					this.onlineRevision = revision;
					return this.token!;
				}
			} catch (error) {
				if (revision === this.revision && !this.closed) {
					if (!(error instanceof GatewayBlockedError)) throw error;
					// Keep managed startup pending and IPC live. Only explicit reassignment/replacement permits recovery.
					await new Promise<void>((resolve) => {
						this.changed = resolve;
					});
					this.changed = undefined;
				}
			} finally {
				if (this.attempt === attempt) this.attempt = undefined;
			}
		}
		throw new ShardError("CLOSED", "Managed gateway is closed.");
	}
}
