# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Server Operator ("Serop") is an Electron + React + TypeScript desktop app for managing remote Linux servers over SSH: file explorer (Monaco), Docker/Compose console, database client (MySQL/Postgres/Redis over SSH tunnel), git deploy pipelines, Nginx/systemd/firewall wizards, and terminal shells (xterm.js). Built with Vite + Tailwind.

## Commands

```bash
npm install               # also runs scripts/copy-monaco.js (postinstall) to vendor Monaco's editor worker assets into public/
npm run electron:dev      # vite dev server + electron pointed at it, live reload (primary way to run the app)
npm run dev                # vite only, no Electron shell (renderer has no window.serverOperator here — most features no-op)
tsc --noEmit -p tsconfig.json   # typecheck (no separate lint script exists)
npm run build              # tsc && vite build && electron-builder — full production build for the host OS
npm run electron:build:mac|:linux|:win   # platform-specific packaged builds, output to /release
```

There is no test suite and no lint config in this repo — don't invent `npm test`/`npm run lint` commands. Verify changes with `tsc --noEmit` and by running `electron:dev` and exercising the feature manually (most functionality requires a live SSH connection or the local "dummy" workspace, see below).

The `serop` and `server-operator-init` bin scripts (`scripts/serop.js`, `scripts/server-operator-init.js`) are the CLI companions installed alongside the app; they scaffold a project's `.server-operator/*.serop` shortcut files and don't touch the Electron app itself.

## Architecture

### Process split

- **`electron/main.js`** — single file, ~3.9k lines, is the entire backend: SSH/SFTP, Docker, database clients, git deploy pipeline, SQLite (deploy history + snippets), Cloudinary backups, window controls. Every capability is an `ipcMain.handle('namespace:action', ...)` handler.
- **`electron/preload.js`** — the only bridge between renderer and main. `contextBridge.exposeInMainWorld('serverOperator', {...})` whitelists each IPC channel as a method; push events (`shell-output`, `compose-logs-data`, etc.) are re-dispatched as `window` `CustomEvent`s.
- **`src/global.d.ts`** — TypeScript surface for `window.serverOperator` (`ServerOperatorAPI`).

Adding a new backend capability always touches three places together: an `ipcMain.handle` in `main.js`, an exposed method in `preload.js`, and a type entry in `global.d.ts`.

### Renderer

`src/App.tsx` is a large single root component that owns most cross-cutting state (server list, active view, proxy settings, notes, per-server repo/compose paths) and persists it directly to `localStorage` (there's no renderer-side store/reducer). It renders `Sidebar` + one view component from `src/components/` based on `ViewId`, with the active view mirrored into the URL hash (`viewFromHash`/`hashFromView`) rather than a router. Feature availability is gated by `FeatureFlagContext` (`src/contexts/FeatureFlagContext.tsx`), backed by `features:load`/`features:save` IPC; a few "core" flags can't be toggled off by the user.

Small pieces of view-local state (dropdown ordering, hidden items, etc.) are kept in the owning component and persisted under their own `localStorage` keys, namespaced by project/server path (e.g. `serop-file-order:<projectPath>`) rather than centralized — follow that pattern for similar per-view preferences instead of adding to `App.tsx`.

`src/components/Select.tsx` is the shared custom dropdown (portal-rendered, supports optional drag-reorder and per-item remove via opt-in props) used across views instead of a native `<select>`.

### Connection model (`src/types.ts` `ServerConnection`)

Four `connectionType`s share the same IPC handlers in `main.js`, so most file/command/docker/database code has to branch on connection type:
- **`ec2`** — SSH with a private key file (`privateKeyPath`).
- **`password`** — SSH with username/password (keyboard-interactive).
- **`cloudflare`** — SSH tunneled through a local `cloudflared access ssh` subprocess instead of a raw TCP socket.
- **`local`** — no SSH at all; commands run directly on the host machine via `child_process`, sandboxed under `connection.projectPath`/`cwd`. There's also an implicit **dummy** workspace (`connection.id === 'dummy'`) that runs the same local path but is sandboxed to a `dummy-root/` folder (see `getDummyRoot`/`resolveDummyPath` in `main.js`) — used for trying the app without any real server.

Any global Tor/SOCKS5 proxy setting (`ProxySettings`) is layered on top of `ec2`/`password` SSH connections (`useProxy()` in `main.js`); a server can opt out with `useProxy: false`.

SSH clients are pooled and reused per `serverId:proxy` key (`connectionPool`/`getOrCreateConnection` in `main.js`, 5 min idle timeout) so repeated file/command operations don't reconnect every time; commands against the same pooled connection are queued to run sequentially.

Because `local`/`dummy` connections run shell commands directly on whatever OS the app is running on (including Windows), command-construction code paths generally need a `process.platform === 'win32'` branch (`cmd.exe` / `/d /s /c`) alongside the POSIX one (`/bin/sh -c`) — see the Docker/Compose helpers in `main.js` for the pattern to follow when adding new local-exec features. Remote (SSH) paths, by contrast, are always POSIX and normalized with `src/utils/remotePath.ts` (`joinRemotePath`/`normalizeRemotePath`), which never touches the local `path` module.

### `.serop` deploy shortcuts

Projects can carry a `.server-operator/*.serop` folder (created by the CLI init scripts or the in-app "Write starter shortcuts" action) containing `[Section Name]` blocks of shell commands, or `Name = command` one-liners. `src/components/DeploySidebar.tsx` (`parseSeropShortcuts`) reads and parses these remotely; running a shortcut dispatches a `deploy-run-command` `CustomEvent` that `DeployView.tsx` picks up and pipes into the active terminal.

### Terminal/shell streaming

Interactive shells (`ProjectTerminal.tsx`, `Panel.tsx`) open a PTY-like SSH shell channel via `server:open-shell`, then stream bytes both ways: keystrokes go out via `shellWrite`, output arrives as `shell-output` events (re-dispatched by preload.js) and is fed into an `xterm.js` instance. The same `runCommand`-callback pattern (`onReady(runCommand, shellId)`) is used to let sibling components (e.g. a deploy shortcut button) inject a command into an already-open terminal instead of opening a new shell.
