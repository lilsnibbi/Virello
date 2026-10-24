# Publish Virello to npm

[Development](development.md) / Releases

`virello` and every public `@virello/*` workspace share one version, changelog
and GitHub release tag. The ten public packages, in
[release-packages.json](../release-packages.json) dependency order, are:
`@virello/builders`, `@virello/logging`, `@virello/util`, `@virello/rest`,
`@virello/ws`, `@virello/cache`, `@virello/engine`, `@virello/sharding`,
`@virello/core`, then `virello`. See [package ownership](packages.md).
Even an unchanged package is published at the shared version.

Release Please keeps the root version, workspace versions and annotated Bun
lockfile versions together through `extra-files`. Keep `workspace:*` for internal
dependencies in source: **Bun packs them as the exact shared version**. Publish
those tarballs with npm; running `npm publish` directly in the checkout would
leave the workspace protocol unresolved. Packages remain raw TypeScript for Bun;
Node is used only for npm's publishing client. There is no build step.

## One-time laptop bootstrap (owner action)

Keep the repository variable `VIRELLO_RELEASES` unset or `false` until bootstrap
and trusted-publisher setup are complete. Do not merge a pending Release Please
PR during setup. Merge this infrastructure PR first, then use a clean checkout
of that merged `main` commit, **not the older `v0.1.2` tag**.

Use Node 24.22.1 (as in the workflow) and npm at least 11.5.1. Install the locked
Bun canary snapshot below for packing and publishing; development keeps following
`bun@canary`. This isolated release tool has its own npm integrity lockfile and
does not change project dependencies. Its install runs Bun's official binary
installer; application dependencies and package hooks remain disabled.

```sh
git switch main
git pull --ff-only
test -z "$(git status --porcelain)"
node --version
npm --version
npm ci --prefix scripts/release-tools --no-audit --no-fund
export PATH="$PWD/scripts/release-tools/node_modules/.bin:$PATH"
bun --revision
bun install --frozen-lockfile --ignore-scripts
bun release:check
bun release:pack
bun release:verify
git diff --exit-code

npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
version=$(bun -p 'require("./package.json").version')
for directory in $(node -p 'require("./release-packages.json").join(" ")'); do
  name=$(node -p "require('./$directory/package.json').name")
  npm view "$name@$version" version --registry=https://registry.npmjs.org
done
```

For **Windows PowerShell**, use this equivalent setup and validation block. Call
the locked Bun executable directly to avoid shell-shim and quoting differences;
do not skip either release check. Windows must also have `tar.exe` available;
check it with `tar --version`.

```powershell
git switch main
git pull --ff-only
if (git status --porcelain) { throw 'Use a clean checkout before bootstrap.' }
node --version
npm --version
npm ci --prefix scripts/release-tools --no-audit --no-fund
$releaseBun = (Resolve-Path '.\scripts\release-tools\node_modules\bun\bin\bun.exe').Path
& $releaseBun --revision
& $releaseBun install --frozen-lockfile --ignore-scripts
& $releaseBun scripts/release.ts check
if ($LASTEXITCODE -ne 0) { throw 'Release metadata validation failed.' }
& $releaseBun scripts/release.ts pack
if ($LASTEXITCODE -ne 0) { throw 'Package validation failed.' }
& $releaseBun scripts/release.ts verify
if ($LASTEXITCODE -ne 0) { throw 'Isolated package import validation failed.' }
git diff --exit-code
if ($LASTEXITCODE -ne 0) { throw 'Tracked files changed during validation.' }

npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
foreach ($directory in (Get-Content -Raw release-packages.json | ConvertFrom-Json)) {
  $manifest = Get-Content -Raw (Join-Path $directory 'package.json') | ConvertFrom-Json
  npm view "$($manifest.name)@$version" version --registry=https://registry.npmjs.org
}
```

Run validation commands in order and stop if any fails. Registry lookups can
return 404 for an unpublished version; inspect each result rather than treating
other failures as absence. Keep publishing on hold until the package split has
been reviewed, all validations pass and ownership is confirmed.

The owner reports creating the npm `virello` organization. Confirm the laptop
account owns `virello` and has permission to create all nine public packages
under `@virello` before publishing. The scope needs to belong to an npm account or
organization you control, with suitable package publishing permissions. A 404
does **not** establish availability or ownership; authentication and policy can
also hide packages. Other registry errors must be resolved before proceeding.

On 2026-10-23, an unauthenticated registry lookup returned `virello` latest
`0.1.1`, maintained by `lilsnibbi`, and 404 for `@virello/builders`. This does not
verify the laptop account's access to the scope or either package. The manifests
in this PR remain at `0.1.2`; no version or name has been reserved by this work.

Review all ten tarballs and perform safe npm dry-runs first. These loops use the
committed dependency order, including the aggregate last; a failed publish stops
rather than continuing with dependent packages. The shared `$version` comes
from the validated checkout above.

**Bash dry-run:**

```bash
for directory in $(node -p 'require("./release-packages.json").join(" ")'); do
  name=$(node -p "require('./$directory/package.json').name")
  filename="${name#@}"
  filename="${filename//\//-}-$version.tgz"
  npm publish "./.release/$filename" --dry-run --ignore-scripts --access public --registry=https://registry.npmjs.org || break
done
```

**PowerShell dry-run:**

```powershell
foreach ($directory in (Get-Content -Raw release-packages.json | ConvertFrom-Json)) {
  $manifest = Get-Content -Raw (Join-Path $directory 'package.json') | ConvertFrom-Json
  $filename = $manifest.name.TrimStart('@').Replace('/', '-') + "-$version.tgz"
  npm publish "./.release/$filename" --dry-run --ignore-scripts --access public --registry=https://registry.npmjs.org
  if ($LASTEXITCODE -ne 0) { throw "Dry-run failed for $($manifest.name)." }
}
```

Only after review, all validation, registry/ownership checks and successful
dry-runs, **the owner** may run the live bootstrap below. Complete interactive
login/2FA prompts locally. No automated fallback credentials are created.

**Bash owner publish:**

```bash
for directory in $(node -p 'require("./release-packages.json").join(" ")'); do
  name=$(node -p "require('./$directory/package.json').name")
  filename="${name#@}"
  filename="${filename//\//-}-$version.tgz"
  npm publish "./.release/$filename" --ignore-scripts --access public --tag latest --registry=https://registry.npmjs.org || break
  npm view "$name@$version" version --registry=https://registry.npmjs.org || break
done
```

**PowerShell owner publish:**

```powershell
foreach ($directory in (Get-Content -Raw release-packages.json | ConvertFrom-Json)) {
  $manifest = Get-Content -Raw (Join-Path $directory 'package.json') | ConvertFrom-Json
  $filename = $manifest.name.TrimStart('@').Replace('/', '-') + "-$version.tgz"
  npm publish "./.release/$filename" --ignore-scripts --access public --tag latest --registry=https://registry.npmjs.org
  if ($LASTEXITCODE -ne 0) { throw "Publishing stopped at $($manifest.name)." }
  npm view "$($manifest.name)@$version" version --registry=https://registry.npmjs.org
  if ($LASTEXITCODE -ne 0) { throw "Verify $($manifest.name) in npm before continuing." }
}
```

Never overwrite an existing version or publish just the root without its matching
dependencies. If a version already exists, compare its contents and integrity first;
use a new shared version if it differs. Laptop bootstrap has no GitHub OIDC
provenance. It creates no GitHub release or tag.

## Configure each npm package's trusted publishers (owner action)

After bootstrap, open **Settings → Trusted publishing** separately for each
of the ten packages listed above. Add these two GitHub Actions configurations
to **each package** (twenty configurations total):

| Field                | Automatic Release Please path | Release event / manual recovery path |
| -------------------- | ----------------------------- | ------------------------------------ |
| Organization or user | `lilsnibbi`                   | `lilsnibbi`                          |
| Repository           | `Virello`                     | `Virello`                            |
| Workflow filename    | `ci.yml`                      | `publish.yml`                        |
| Environment name     | `prod`                        | `prod`                               |
| Allowed actions      | Enable direct `npm publish`   | Enable direct `npm publish`          |

Use the exact case and filenames, without `.github/workflows/`. npm currently
validates the **calling** workflow for reusable workflow calls, so `ci.yml` is
needed when Checks calls `publish.yml`. Direct events and manual recovery use
`publish.yml`. No separate `npm dist-tag` permission is needed. Newly created
configurations also allow staged publishing by npm's default; this workflow uses
direct publishing. There is no npm token or token fallback in either workflow.

Verify the existing GitHub environment named `prod` permits these release jobs;
configure any desired reviewers and branch/tag restrictions there yourself. Jobs
must be able to run for `main` (automatic/recovery) and version tags (release
events). No live trust grants, environments, security settings or secrets are
changed by this PR.

Create the npm configurations close to the next release: current npm policy
expires a new configuration unless its first successful publish occurs within
two days. Recreate an expired configuration before retrying. Once ready, set
`VIRELLO_RELEASES=true` and allow the next normal reviewed release PR to proceed.
You may separately restrict token publishing in npm package settings; this PR
does not change that setting or create credentials.

## Subsequent releases and recovery

Conventional Commits feed the existing Release Please job in
[ci.yml](../.github/workflows/ci.yml). It maintains one ready-for-review release
PR. Review its shared version and changelog; merging that release PR allows the
existing automation to create the version tag/release and call
[publish.yml](../.github/workflows/publish.yml). Its permissions are limited to
`contents: read` and `id-token: write`, on a GitHub-hosted Ubuntu runner, in `prod`.
OIDC publication from this public repository automatically includes npm provenance.

Publishing checks that the stable release exists, is published and not a
prerelease, matches every package's version, and points to a commit reachable
from `main`. It installs frozen dependencies without lifecycle scripts, packs
with the locked Bun snapshot without pack hooks, and checks exports, source
files and exact internal versions before publishing. Packing uses a
temporary tree with file permissions normalized to `0644`, so laptop/runner
umasks do not change tarball integrity. Only stable `x.y.z` / `vx.y.z` releases are
supported; prereleases need an explicit dist-tag policy before being added.

Publishing multiple npm packages is not atomic. Every package is checked against
the registry before any publish; an existing version is skipped only when its
SHA-512 tarball integrity matches. Only an explicit npm `E404` is treated as
unpublished. Authentication, network and other errors stop the job. A mismatch
requires investigation and usually a new shared version, never overwriting npm.

For a partial failure, run **Publish to npm → Run workflow**, choose `main`, and
enter the original published release tag in `tag_name`. It packs that tag again,
verifies existing tarballs, and publishes the missing packages in dependency
order. Do not bump just one package. Packing and publishing require the exact
Bun revision recorded in `scripts/release-tools/package.json`; recovery installs
the original tag's locked release tools. If the pinned tool ever becomes
unavailable, stop rather than changing the toolchain for an already published
version. Review any intentional snapshot update as a release configuration change.

After dependency edits regenerate `bun.lock`, run `bun release:sync` to restore
the Release Please annotation and align workspace versions to the root version,
then commit the result. This does not resolve or upgrade dependencies. Run
`bun release:check`, `bun release:pack` and `bun release:verify` with the locked
release tools before
submitting release changes.
CI also runs those checks, and publishing rechecks even when ordinary CI is
skipped for Release Please's bot commits.

To add a public workspace, add its path to `release-packages.json` after its
dependencies and add its `package.json` to Release Please's root `extra-files`.
Set its version, repository URL, public `publishConfig`, Bun exports and file
allowlist; then run `bun release:sync`. A private workspace must use
`"private": true` and cannot be a dependency of a published package. Every new
public package needs its own laptop bootstrap and both trusted publishers.

## Official references

Checked 2026-10-23:

- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/): CLI and
  runner requirements, per-package configuration, caller workflow identity,
  expiry and automatic provenance.
- [GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc):
  job-scoped `id-token: write` and environment claims.
- [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/): tarball
  inputs, dry-runs, integrity and immutable package versions.
- [Bun pack](https://bun.com/docs/pm/cli/pm#pack): packing without lifecycle hooks.
- [Release Please extra-files](https://github.com/googleapis/release-please/blob/main/docs/customizing.md#updating-arbitrary-files):
  synchronized JSON versions and annotated JSONC lockfile versions.
