#!/usr/bin/env bash
set -euo pipefail

# The validation runner is Ubuntu x64. Verify the pinned upstream release before executing it.
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/virello-actionlint.XXXXXX")"
trap 'rm -rf -- "$scratch"' EXIT
curl --fail --silent --show-error --location --retry 3 \
  https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  --output "$scratch/actionlint.tar.gz"
printf '%s  %s\n' \
  8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 \
  "$scratch/actionlint.tar.gz" | sha256sum --check --status
tar -xzf "$scratch/actionlint.tar.gz" -C "$scratch" actionlint
"$scratch/actionlint" "$root/.github/workflows/"*.yml
