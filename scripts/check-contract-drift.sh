#!/usr/bin/env bash
# Regenerate changeset contract artifacts and fail if they differ from committed versions.
# Intended for CI: ensures generated artifacts stay in sync with the contract module.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Regenerating contract artifacts..."
npx tsx scripts/generate-changeset-contract.ts

if ! git diff --quiet contracts/ skills/_references/; then
  echo ""
  echo "ERROR: Generated contract artifacts are out of date."
  echo "Run 'npx tsx scripts/generate-changeset-contract.ts' and commit the results."
  echo ""
  git diff --stat contracts/ skills/_references/
  exit 1
fi

echo "Contract artifacts are up to date."
