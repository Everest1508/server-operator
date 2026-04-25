# Server Operator

A premium Electron app to manage servers, view Docker containers, browse files (Dockerfile, docker-compose), view Docker Compose logs, and deploy code — with a VS Code–inspired UI and Tailwind CSS.

## Features

- **Servers**: Add servers via SSH (host, username, private key path, optional project path).
- **Files**: Browse project directory on the server and open files (e.g. Dockerfile, docker-compose.yml).
- **Docker**: List all Docker containers (from `docker ps -a`) for the selected server.
- **Logs**: View Docker Compose logs in the bottom panel (optional service filter, tail lines).
- **Deploy**: Run deploy commands (e.g. `git pull && docker compose up -d --build`) with presets.

## Tech

- Electron + React + TypeScript
- Vite + Tailwind CSS v4
- `node-ssh` for SSH and remote commands

## Setup

```bash
npm install
```

## Run (dev)

Start the app with Vite dev server + Electron:

```bash
npm run electron:dev
```

Or run the web UI only:

```bash
npm run dev
```

## Build

```bash
npm run electron:build
```

Output is in `release/`.

## Usage

1. Click **+** in the Servers sidebar and add a server (host, user, SSH key path, optional project path).
2. Select the server in the sidebar.
3. Use the activity bar: **Files** (browse and open files), **Docker** (containers), **Deploy** (run commands).
4. Open the bottom **Logs** tab to see Docker Compose logs; use the optional service name and refresh as needed.

## Project Shortcut Files (`.serop`)

You can keep reusable deploy shortcuts in each project under:

`<project-path>/.server-operator/*.serop`

In the **Deploy** tab, choose the project and `.serop` file, then click **Run** on any shortcut.

Example file: `.server-operator/deploy.serop`

```txt
[Deploy app]
git pull
docker compose up -d --build

[Restart api]
docker compose restart api

Quick logs = docker compose logs --tail=100 api
```

Notes:
- `[Name]` starts a shortcut section; the lines below it are command steps.
- Commands in the same section run together with `&&`.
- `Name = command` (or `Name: command`) creates a one-line shortcut.

## Bootstrap in Any Project (AI-Friendly)

Server Operator now includes a project initializer you can use in any codebase.

It creates:

- `.server-operator/deploy.serop`
- `.server-operator/ops.serop`
- `.server-operator/custom.serop`
- `.server-operator/AI_CONTEXT.md`
- `.server-operator/INSTALLATION_CONTEXT.md`
- `.server-operator/README.md`

### Run initializer

From this repository:

```bash
npm run serop:init -- --path /path/to/your/project
```

Interactive mode (asks Docker/Nginx/services/install-command questions):

```bash
npm run serop:init:interactive -- --path /path/to/your/project
```

If you install this package in another project (or publish the CLI), run:

```bash
npx server-operator-init --path .
```

Optional flags:

- `--force` overwrite existing files
- `--dry-run` preview without writing files
- `--interactive` ask setup questions and generate context

### Website bootstrap scripts

If you host the `website/` folder on your domain, you can provide one-liners:

macOS/Linux:

```bash
curl -fsSL https://server-operator-zeta.vercel.app/init-server-operator.sh | sh
```

Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr https://server-operator-zeta.vercel.app/init-server-operator.ps1 -UseBasicParsing | iex"
```

### How AI agents should use it

In projects that use Server Operator, agents should read `.server-operator/AI_CONTEXT.md` and `.server-operator/INSTALLATION_CONTEXT.md`, then maintain `.serop` files inside `.server-operator/`.
