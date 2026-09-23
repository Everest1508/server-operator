# Agent Guide

Purpose
-------
This document describes how an AI coding agent should operate in the `server-operator` repository: available commands, permissions, and usage patterns. For architecture and code-structure details, see [CLAUDE.md](CLAUDE.md).

Quick start
-----------
- The agent helps with development tasks: running the app, building releases, and code changes across the Electron main process and React renderer.
- Invoke the agent with clear commands (e.g. "start dev", "build linux", "typecheck").

Available commands
-------------------
- `npm install` — install dependencies (postinstall copies Monaco editor assets).
- `npm run dev` — Vite dev server only (renderer, no Electron/IPC).
- `npm run electron:dev` — Vite + Electron together with live reload; the main dev loop.
- `npm run build` — `tsc` typecheck + Vite build + `electron-builder` (full package for the host OS).
- `npm run electron:build:linux` / `:mac` / `:win` — package for one platform only.
- `npx tsc --noEmit` — typecheck without a full build.
- `npm run serop:init:interactive -- --path <dir>` — scaffold a `.server-operator/` config folder inside another repo.

There is no test suite and no lint script configured in this repo — `tsc` is the only automated check.

Tools & permissions
--------------------
- The agent may run shell commands to install packages, start dev servers, or run builds.
- It will never perform destructive actions (delete files, force-push, `git reset --hard`, wipe the local SQLite deploy-history DB) without explicit user approval.
- Changes that touch `electron/main.js` path-building code should be checked against both POSIX and `win32` behavior — see the Windows note in [CLAUDE.md](CLAUDE.md).

Usage examples
--------------
- "start dev" — run `npm run electron:dev` and confirm the app launches.
- "typecheck" — run `npx tsc --noEmit` and report errors.
- "build linux" — run `npm run electron:build:linux` and report the artifact under `release/`.
- "create .env" — generate `.env` from `.env.example` after prompting for values.

Contributing
------------
If you want to add commands or change agent behavior, edit this file and include:
- command name
- description
- required permissions or side effects

Contact / Support
------------------
For questions about agent behavior, ask in the project chat or open an issue.
