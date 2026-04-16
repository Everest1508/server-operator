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
