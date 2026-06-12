#!/usr/bin/env bash
set -e

SANDBOX_PATH="/opt/Serop/chrome-sandbox"

if [ -f "$SANDBOX_PATH" ]; then
  chown root:root "$SANDBOX_PATH" || true
  chmod 4755 "$SANDBOX_PATH" || true
fi
