#!/usr/bin/env bash
# Publish every package to npm under the @poe2-toolkit scope, in dependency order.
#
# Prerequisites (one-time, manual):
#   1. Create the npm org "poe2-toolkit" at https://www.npmjs.com/org/create
#      (free for public packages).
#   2. Authenticate this machine:  npm login
#
# Then run:  bash scripts/publish-all.sh
#
# Each package already carries `publishConfig.access = public`, so no extra flag
# is needed. `prepack` rebuilds dist before each publish.
set -euo pipefail

cd "$(dirname "$0")/.."

# Dependency order: a package is published only after everything it depends on.
PACKAGES=(
  poe2-ggpk          # no internal deps
  poe2-tree-core     # no internal deps
  poe2-tree-react    # -> tree-core
  poe2-tree-extractor # -> ggpk
  poe2-item-extractor # -> ggpk
  poe2-gem-extractor  # -> ggpk
)

echo "Building all packages first..."
npm run build

for p in "${PACKAGES[@]}"; do
  echo "==> publishing packages/$p"
  npm publish -w "packages/$p"
done

echo "All packages published."
