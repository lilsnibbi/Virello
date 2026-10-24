# @virello/engine

Native Discord client combining REST, Gateway transport and entity caches for Bun.

```sh
bun add @virello/engine
```

Ships raw TypeScript for Bun >=1.4.2; no build step or Node runtime support.
This package owns its implementation and depends only on the smaller packages
listed in its manifest. It never depends on the aggregate `virello` package.
All public Virello packages use the same version.
