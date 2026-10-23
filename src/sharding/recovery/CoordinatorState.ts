import { Database } from "bun:sqlite";
import { existsSync, lstatSync, unlinkSync } from "node:fs";
import { OwnershipLock, StateDirectory } from "./ownership";
import {
	ShardError,
	type ShardStateOptions,
	type ShardStateStatus,
} from "../types";

/** Durable bookkeeping. Saved leases are evidence for diagnostics, never permission to start a child. */
export class CoordinatorState {
	private readonly directory: StateDirectory;
	private readonly lock: OwnershipLock;
	private db?: Database;
	private inode?: bigint;
	private revision = 0;
	public epoch = crypto.randomUUID();
	public phase: ShardStateStatus["phase"] = "draining";
	public reason = "startup";
	public readonly owners = new Map<string, string>();
	public constructor(
		options: ShardStateOptions,
		public readonly hosts: readonly string[],
	) {
		this.directory = new StateDirectory(options, "coordinator", {
			hosts: JSON.stringify([...hosts].sort()),
		});
		this.lock = new OwnershipLock(this.directory, "coordinator.sqlite");
		try {
			// A missing former host cannot acknowledge shutdown. Never silently shrink the fence set.
			this.lock.bind("hosts", JSON.stringify([...hosts].sort()));
		} catch (error) {
			this.lock.close();
			throw error;
		}
	}
	public get status(): ShardStateStatus {
		return {
			phase: this.phase,
			epoch: this.epoch,
			reason: this.reason,
			waitingForHosts: this.hosts.filter((host) => !this.owners.has(host)),
		};
	}
	public invalidate(reason: string): void {
		this.db?.close();
		this.db = undefined;
		this.epoch = crypto.randomUUID();
		this.phase = "draining";
		this.reason = reason;
		this.owners.clear();
	}
	/** Called only after every configured host has fenced previous children. */
	public rebuild(snapshot: object): void {
		this.lock.assert();
		if (this.hosts.some((host) => !this.owners.has(host)))
			throw new ShardError(
				"RECOVERING",
				"Every configured host must confirm its previous children have stopped.",
			);
		this.db?.close();
		this.db = undefined;
		// This cache has no authority. Its exact, marked files alone are disposable; interlocks are never removed.
		for (const name of [
			"runtime.sqlite-journal",
			"runtime.sqlite-wal",
			"runtime.sqlite-shm",
			"runtime.sqlite",
		])
			if (existsSync(this.directory.file(name)))
				unlinkSync(this.directory.file(name));
		const path = this.directory.file("runtime.sqlite");
		const db = new Database(path, { create: true, strict: true });
		try {
			db.exec(
				"PRAGMA synchronous=FULL; CREATE TABLE runtime (id INTEGER PRIMARY KEY CHECK(id=1), epoch TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL)",
			);
			db.query("INSERT INTO runtime VALUES (1, ?, 0, ?)").run(
				this.epoch,
				JSON.stringify(snapshot),
			);
			this.db = db;
			this.revision = 0;
			this.inode = lstatSync(path, { bigint: true }).ino;
		} catch (error) {
			db.close();
			throw error;
		}
	}
	public verify(): void {
		this.lock.assert();
		if (
			!this.db ||
			lstatSync(this.directory.file("runtime.sqlite"), { bigint: true }).ino !==
				this.inode
		)
			throw new ShardError(
				"STATE_ROLLBACK",
				"Runtime state disappeared or was replaced; ownership must be reconciled again.",
			);
		const row = this.db
			.query<{ epoch: string; revision: number }, []>(
				"SELECT epoch, revision FROM runtime WHERE id=1",
			)
			.get();
		if (row?.epoch !== this.epoch || row.revision !== this.revision)
			throw new ShardError(
				"STATE_ROLLBACK",
				"Runtime state epoch or revision changed; ownership must be reconciled again.",
			);
	}
	public write(snapshot: object): void {
		this.verify();
		const changes = this.db!.query(
			"UPDATE runtime SET revision=revision+1, snapshot=? WHERE id=1 AND epoch=? AND revision=?",
		).run(JSON.stringify(snapshot), this.epoch, this.revision).changes;
		if (changes !== 1)
			throw new ShardError(
				"STATE_ROLLBACK",
				"Runtime state epoch or revision changed; ownership must be reconciled again.",
			);
		this.revision++;
	}
	public close(): void {
		this.db?.close();
		this.db = undefined;
		this.lock.close();
	}
}
