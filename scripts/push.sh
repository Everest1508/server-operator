#!/bin/bash
# Bump patch version in package.json, then commit & push.
# Usage: ./scripts/push.sh "commit message"
set -e

cd "$(git rev-parse --show-toplevel)"
MSG="${1:-$(git log -1 --pretty=%s 2>/dev/null || echo 'update')}"

CURRENT=$(node -e "const p=require('./package.json'); console.log(p.version)")
MAJOR=$(echo "$CURRENT" | cut -d. -f1)
MINOR=$(echo "$CURRENT" | cut -d. -f2)
PATCH=$(echo "$CURRENT" | cut -d. -f3)
NEW="$MAJOR.$MINOR.$((PATCH + 1))"

node -e "
  const p=require('./package.json');
  p.version='$NEW';
  require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2) + '\n');
"

git add package.json
git commit -m "bump v$CURRENT → v$NEW"
git push origin main
echo "🔖 Bumped $CURRENT → $NEW, pushed."
