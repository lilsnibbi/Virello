# @virello/rest

Independent Discord REST client with bounded queues, retries and rate limits for Bun.

```sh
bun add @virello/rest
```

Ships raw TypeScript for Bun >=1.4.2; no build step or Node runtime support.
This package owns its implementation and depends only on the smaller packages
listed in its manifest. It never depends on the aggregate `virello` package.
All public Virello packages use the same version.

## Audit-log reasons

Pass an unencoded `reason` to `RestClient.request()` for endpoints that support
Discord audit logs. The client validates 1–512 Unicode characters and URL-encodes
the reason once as `X-Audit-Log-Reason`, including on retries and multipart uploads.

```ts
await rest.request({
	method: "PUT",
	path: `/guilds/${guildId}/bans/${userId}`,
	body: { delete_message_seconds: 0 },
	reason: "Case 42: repeated spam",
});
```

The same field is available through `client.rest.request()` in Virello. Managed
shards forward it through the fleet REST scheduler, where it is part of the
operation fingerprint. Reusing an `operationId` with a different reason is rejected.
Update workers and their coordinator together before using this field. Queue
limits, rate limits, deadlines and mutation reconciliation still apply.
