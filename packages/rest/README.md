# @virello/rest

Independent Discord REST client with bounded queues, retries and rate limits for Bun.

```sh
bun add @virello/rest
```

Ships raw TypeScript for Bun >=1.4.2; no build step or Node runtime support.
This package owns its implementation and depends only on the smaller packages
listed in its manifest. It never depends on the aggregate `virello` package.
All public Virello packages use the same version. See the repository
[package guide](https://github.com/lilsnibbi/Virello/blob/main/docs/packages.md).
