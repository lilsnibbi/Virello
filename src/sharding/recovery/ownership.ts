import { Database, SQLiteError } from "bun:sqlite";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { identifier } from "../transport/protocol";
import { ShardError, type ShardStateOptions } from "../types";

export function validateState(options: ShardStateOptions): void {
	identifier.assert(options.deployment);
	if (typeof options.directory !== "string" || !options.directory.trim())
		throw new TypeError(
			"state.directory must name a dedicated local directory.",
		);
}

/** Only this marked directory's named runtime files may be reconstructed. */
export class StateDirectory {
	public readonly path: string;
	private readonly identity: string;
	private readonly inode: bigint;
	public constructor(
		options: ShardStateOptions,
		role: string,
		initialOwnership: Readonly<Record<string, string>> = {},
	) {
		validateState(options);
		const path = resolve(options.directory);
		mkdirSync(path, { recursive: true, mode: 0o700 });
		if (lstatSync(path).isSymbolicLink())
			throw new ShardError(
				"STATE_PATH",
				"State directories cannot be symlinks.",
			);
		this.path = realpathSync(path);
		this.inode = lstatSync(this.path, { bigint: true }).ino;
		const identity = { version: 1, deployment: options.deployment, role };
		this.identity = JSON.stringify({ ...identity, initialized: true });
		const initializing = JSON.stringify({ ...identity, initialized: false });
		const marker = this.file("virello-state.json");
		if (!existsSync(marker)) {
			if (readdirSync(this.path).length)
				throw new ShardError(
					"STATE_PATH",
					"Use an empty, dedicated Virello state directory.",
				);
			writeFileSync(marker, initializing, {
				flag: "wx",
				mode: 0o600,
				flush: true,
			});
		}
		const guards =
			role === "coordinator"
				? ["coordinator.sqlite"]
				: ["supervisor.sqlite", "children.sqlite"];
		if (readFileSync(marker, "utf8") === initializing) {
			// Interrupted first-time setup can finish, but never overwrite an existing interlock.
			for (const name of guards) {
				try {
					writeFileSync(this.file(name), "", {
						flag: "wx",
						mode: 0o600,
						flush: true,
					});
				} catch (error) {
					if (
						!(error instanceof Error) ||
						Reflect.get(error, "code") !== "EEXIST"
					)
						throw error;
				}
				const db = new Database(this.file(name), {
					create: false,
					strict: true,
				});
				try {
					db.exec(
						"PRAGMA busy_timeout=0; PRAGMA synchronous=FULL; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS ownership (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
					);
					for (const [key, value] of Object.entries(initialOwnership))
						db.query("INSERT OR IGNORE INTO ownership VALUES (?, ?)").run(
							key,
							value,
						);
					db.exec("COMMIT");
				} finally {
					db.close();
				}
			}
			const temporary = this.file(`marker-${crypto.randomUUID()}.tmp`);
			writeFileSync(temporary, this.identity, {
				flag: "wx",
				mode: 0o600,
				flush: true,
			});
			renameSync(temporary, marker);
		}
		this.assert();
		for (const name of guards)
			if (!existsSync(this.file(name)))
				throw new ShardError(
					"STATE_LOCK",
					"An ownership interlock is missing. Fence all previous processes before replacing the state directory.",
				);
	}
	public file(name: string): string {
		if (!/^[a-z][a-z0-9.-]*$/.test(name))
			throw new TypeError("Invalid state filename.");
		const path = join(this.path, name);
		const stat = lstatSync(path, { throwIfNoEntry: false });
		if (stat) {
			if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
				throw new ShardError(
					"STATE_PATH",
					"State files must be ordinary, unlinked local files.",
				);
		}
		return path;
	}
	public assert(): void {
		if (
			lstatSync(this.path, { bigint: true }).ino !== this.inode ||
			readFileSync(this.file("virello-state.json"), "utf8") !== this.identity
		)
			throw new ShardError(
				"STATE_IDENTITY",
				"State directory identity changed; fence the deployment before replacing it.",
			);
	}
}

export function isBusy(error: unknown): boolean {
	return error instanceof SQLiteError && [5, 6].includes(error.errno & 0xff);
}

/** A kernel-backed lock, not a timestamp lease. Never unlink or recreate it. */
export class OwnershipLock {
	public readonly db: Database;
	private readonly inode: bigint;
	public constructor(
		private readonly directory: StateDirectory,
		private readonly name: string,
	) {
		const path = directory.file(name);
		this.db = new Database(path, { create: false, strict: true });
		try {
			this.db.exec(
				"PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE",
			);
			// Keep EXCLUSIVE OS locks after COMMIT until close, including while this process is paused.
			this.db.query("SELECT key, value FROM ownership LIMIT 1").get();
			this.db.exec("COMMIT");
			const mode = this.db
				.query<{ journal_mode: string }, []>("PRAGMA journal_mode")
				.get();
			if (mode?.journal_mode !== "delete")
				throw new ShardError(
					"STATE_LOCK",
					"Ownership interlocks require SQLite's DELETE journal mode.",
				);
			this.inode = lstatSync(path, { bigint: true }).ino;
		} catch (error) {
			this.db.close();
			throw error;
		}
	}
	public assert(): void {
		this.directory.assert();
		if (
			lstatSync(this.directory.file(this.name), { bigint: true }).ino !==
			this.inode
		)
			throw new ShardError(
				"STATE_LOCK",
				"An ownership interlock was replaced; stop all deployment processes before repair.",
			);
	}
	public bind(key: string, value: string): void {
		this.assert();
		const row = this.db
			.query<{ value: string }, [string]>(
				"SELECT value FROM ownership WHERE key=?",
			)
			.get(key);
		if (!row || row.value !== value)
			throw new ShardError(
				"STATE_IDENTITY",
				"Ownership configuration changed. Fence removed hosts before changing the state directory.",
			);
	}
	public close(): void {
		this.db.close();
	}
}

export interface ChildOwnership {
	path: string;
	epoch: string;
}

/** A manager serializes all child generations through one stable read-lock gate. */
export class HostOwnership {
	private readonly lock: OwnershipLock;
	private child?: ChildOwnership;
	public constructor(private readonly directory: StateDirectory) {
		this.lock = new OwnershipLock(directory, "supervisor.sqlite");
	}
	public get childConfig(): ChildOwnership {
		this.lock.assert();
		if (!this.child)
			throw new ShardError(
				"RECOVERING",
				"Previous children have not been fenced.",
			);
		return this.child;
	}
	public async fence(signal: AbortSignal, waiting: () => void): Promise<void> {
		let delay = 250;
		let reported = false;
		for (;;) {
			signal.throwIfAborted();
			this.lock.assert();
			let gate: OwnershipLock | undefined;
			try {
				gate = new OwnershipLock(this.directory, "children.sqlite");
				const epoch = crypto.randomUUID();
				gate.db
					.query("INSERT OR REPLACE INTO ownership VALUES ('epoch', ?)")
					.run(epoch);
				this.child = { path: this.directory.file("children.sqlite"), epoch };
				return;
			} catch (error) {
				if (!isBusy(error)) throw error;
				if (!reported) {
					waiting();
					reported = true;
				}
			} finally {
				gate?.close();
			}
			await wait(delay, undefined, { signal });
			delay = Math.min(5000, delay * 2);
		}
	}
	public close(): void {
		this.lock.close();
	}
}

// Intentionally retained until OS process exit, including after client.destroy().
// A paused orphan keeps its shared lock; a late-starting orphan sees a revoked epoch.
let childGuard: { db: Database; config: ChildOwnership } | undefined;
export function holdChildOwnership(config: ChildOwnership): void {
	if (childGuard) {
		if (
			childGuard.config.path !== config.path ||
			childGuard.config.epoch !== config.epoch
		)
			throw new ShardError(
				"OWNERSHIP",
				"A managed process cannot change ownership gates.",
			);
		return;
	}
	const db = new Database(config.path, { readonly: true, strict: true });
	try {
		db.exec("PRAGMA busy_timeout=0; BEGIN");
		const row = db
			.query<{ value: string }, []>(
				"SELECT value FROM ownership WHERE key='epoch'",
			)
			.get();
		if (row?.value !== config.epoch)
			throw new ShardError(
				"OWNERSHIP",
				"This child belongs to a revoked supervisor generation.",
			);
		childGuard = { db, config };
	} catch (error) {
		db.close();
		throw error;
	}
}
