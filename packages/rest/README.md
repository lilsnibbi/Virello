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

## Multipart requests

`files` accepts `$RestFile` entries: `{ name: string, data: Blob, key?: string }`.
`name` is the filename; `key` is the multipart field name. Omitting `key` retains
the `files[index]` default used by message attachments. Set a key such as `file`,
`files[42]` or `target_users_file` when the endpoint documents it. The Blob's MIME
type is retained through standalone and managed requests.

Two multipart layouts are supported:

- `body` with `files`: non-file parameters are encoded in `payload_json`.
- `form` with optional `files`: each string value becomes a separate multipart
  text field. Use `form: {}` for files without `payload_json`. `body` and `form`
  are mutually exclusive; booleans and numbers in `form` must be explicitly
  encoded as strings.

For example, guild sticker creation uses ordinary text fields and a `file` part:

```ts
await rest.request({
	method: "POST",
	path: `/guilds/${guildId}/stickers`,
	form: { name: "Wave", description: "", tags: "wave" },
	files: [{ key: "file", name: "wave.png", data: Bun.file("wave.png") }],
	reason: "Add welcome sticker",
});
```

An invite's target-user CSV uses `target_users_file`. Other invite parameters can
remain JSON:

```ts
await rest.request({
	method: "POST",
	path: `/channels/${channelId}/invites`,
	body: { max_age: 3600, unique: true },
	files: [
		{
			key: "target_users_file",
			name: "users.csv",
			data: new Blob(["user_id\n123456789012345678\n"], { type: "text/csv" }),
		},
	],
});
```

Multipart keys must be ASCII identifiers or `files[n]` names, at most 64
characters. Duplicate names across files and text fields, `payload_json`,
prototype-related names and file-index names used as text fields are rejected.
Filenames require 1–256 characters without control characters; MIME types are
limited to 1024 characters. Invalid forms reject before queueing or fleet
submission. Fields, filenames, file keys and JSON metadata are snapshotted at
submission so later mutation cannot change attribution.

Fleet forwarding preserves form fields, file keys, MIME types and bytes. These
values participate in mutation fingerprints, so reusing an `operationId` with
different multipart contents is rejected. Existing fleet upload byte limits,
rate limits, deadlines and mutation reconciliation continue to apply. Upgrade
workers and coordinator together before using the new multipart fields.

See Discord's [uploading files](https://docs.discord.com/developers/reference#uploading-files),
[sticker creation](https://docs.discord.com/developers/resources/sticker#create-guild-sticker)
and [invite parameters](https://docs.discord.com/developers/resources/channel#create-channel-invite).
