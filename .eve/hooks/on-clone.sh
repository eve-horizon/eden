#!/usr/bin/env bash
set -euo pipefail

echo "[on-clone] Installing skills..."
eve skills install
echo "[on-clone] Complete"
