#!/usr/bin/env node
// Prints the codename for a version from the in-app changelog, or nothing if there is none.
// Used by .github/workflows/release-builds.yml to name releases, e.g. "Server Operator v2.3.0 (Locked Down)".
// Usage: node scripts/release-codename.js 2.3.0
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) process.exit(0);

const file = path.join(__dirname, '..', 'src', 'components', 'changelogData.ts');
const source = fs.readFileSync(file, 'utf8');
const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const match = source.match(new RegExp(`version:\\s*'${escaped}',\\s*codename:\\s*'([^']+)'`));
if (match) process.stdout.write(match[1]);
