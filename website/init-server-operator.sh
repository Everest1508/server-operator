#!/usr/bin/env sh
set -eu

TARGET_PATH="."
FORCE="0"

while [ $# -gt 0 ]; do
  case "$1" in
    --path)
      TARGET_PATH="${2:-.}"
      shift 2
      ;;
    --force)
      FORCE="1"
      shift 1
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: sh init-server-operator.sh [--path <dir>] [--force]"
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd "$TARGET_PATH" && pwd)"
SO_DIR="$ROOT_DIR/.server-operator"
mkdir -p "$SO_DIR"

write_file() {
  file="$1"
  content="$2"
  if [ -f "$file" ] && [ "$FORCE" != "1" ]; then
    echo "skip  $file (exists, use --force to overwrite)"
    return
  fi
  printf "%s" "$content" > "$file"
  echo "write $file"
}

DEPLOY_SEROP='[Deploy app]
git pull
docker compose up -d --build

[Restart api]
docker compose restart api

Quick logs = docker compose logs --tail=100 api
'

OPS_SEROP='[Health check]
docker compose ps
docker compose logs --tail=80

[Restart all]
docker compose restart
'

AI_CONTEXT='# Server Operator AI Context

This project uses Server Operator shortcuts in:

`.server-operator/*.serop`

## What agents should do

1. Keep reusable deploy and operations commands in `.serop` files.
2. Use section format:

```txt
[Name]
command step 1
command step 2
```

3. Commands inside one section run together with `&&` in Server Operator.
4. One-line shortcuts are allowed:

```txt
Quick logs = docker compose logs --tail=100 api
```
'

INSTALL_CONTEXT='# Installation Context

Fill this file with your own install/onboarding steps and environment details.
AI agents should use this as the source of truth for setup docs.
'

README_TEXT='# .server-operator

This folder stores project-level shortcuts for the Server Operator desktop app.

## How it works

- Put one or more `.serop` files in this folder.
- Open Server Operator -> Deploy tab.
- Select your project and `.serop` file.
- Click **Run** on a shortcut.
'

write_file "$SO_DIR/deploy.serop" "$DEPLOY_SEROP"
write_file "$SO_DIR/ops.serop" "$OPS_SEROP"
write_file "$SO_DIR/AI_CONTEXT.md" "$AI_CONTEXT"
write_file "$SO_DIR/INSTALLATION_CONTEXT.md" "$INSTALL_CONTEXT"
write_file "$SO_DIR/README.md" "$README_TEXT"

echo ""
echo "Done. Folder: $SO_DIR"
echo "Tip: run 'npx server-operator-init --interactive --path \"$ROOT_DIR\" --force' for questionnaire-based context."
