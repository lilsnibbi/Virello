// Each public entrypoint is loaded first in a fresh process to expose order-dependent cycles.
export {};

const opened: string[] = [];
const originalServe = Bun.serve;
const originalConnect = Bun.connect;
const originalListen = Bun.listen;
const originalSpawn = Bun.spawn;
const originalSpawnSync = Bun.spawnSync;
const originalRedis = Bun.RedisClient;
const originalFetch = globalThis.fetch;
const originalSocket = globalThis.WebSocket;
const originalTimeout = globalThis.setTimeout;
const originalInterval = globalThis.setInterval;
const forbidden =
	(name: string) =>
	(..._args: unknown[]): never => {
		opened.push(name);
		throw new Error(`Import opened a resource: ${name}`);
	};
Object.assign(Bun, {
	serve: forbidden("serve"),
	connect: forbidden("connect"),
	listen: forbidden("listen"),
	spawn: forbidden("spawn"),
	spawnSync: forbidden("spawnSync"),
	RedisClient: forbidden("RedisClient"),
});
Object.assign(globalThis, {
	fetch: forbidden("fetch"),
	WebSocket: forbidden("WebSocket"),
	setTimeout: forbidden("setTimeout"),
	setInterval: forbidden("setInterval"),
});
try {
	const path = process.argv[2]!;
	const first = await import(path);
	const root = await import("virello");
	const reference =
		path === "virello/engine" ? await import("virello/engine") : root;
	for (const [name, value] of Object.entries(first)) {
		if (value !== Reflect.get(reference, name))
			throw new Error(`Identity differs: ${path} ${name}`);
	}
	if (opened.length)
		throw new Error(`Import attempted resources: ${opened.join(", ")}`);
	if (
		root.container.client ||
		root.container.tasks ||
		root.container.services ||
		root.container.i18n
	)
		throw new Error("Import constructed client/extension state");
	if (
		root.container.modules.size ||
		root.ApplicationCommandRegistries.registries.size
	)
		throw new Error("Import registered modules or commands");
	console.log(`Cold import passed: ${path}`);
} finally {
	Object.assign(Bun, {
		serve: originalServe,
		connect: originalConnect,
		listen: originalListen,
		spawn: originalSpawn,
		spawnSync: originalSpawnSync,
		RedisClient: originalRedis,
	});
	Object.assign(globalThis, {
		fetch: originalFetch,
		WebSocket: originalSocket,
		setTimeout: originalTimeout,
		setInterval: originalInterval,
	});
}
