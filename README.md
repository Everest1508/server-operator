# ⚡ Server Operator ⚡

<p align="center">
  <img src="public/logo.png" width="128" height="128" alt="Server Operator Logo" />
</p>

<p align="center">
  <strong>Forged by BeForth</strong><br />
  A premium, high-performance desktop server manager and deployment environment built on Electron, React, and TypeScript.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-blue" alt="Platforms" />
  <img src="https://img.shields.io/badge/Built%20With-Electron%20%2B%20Vite%20%2B%20Tailwind-61dafb" alt="Built With" />
</p>

---

## 🚀 Key Modules

Server Operator operates with a **disabled-by-default architecture**, allowing you to customize your workspace and keep memory consumption low. Enable the modules you need directly in **Feature Settings**:

*   🖥️ **Connection Manager**: Fast SSH connections supporting private key keys, password authentication, and integrated Tor SOCKS5 proxying.
*   📂 **Remote File System Explorer**: Visual folder tree navigation with built-in Monaco Editor support, file creation, uploads, and downloads.
*   🐳 **Docker Console**: Instantly list active Docker containers (`docker ps -a`), inspect service logs, and rebuild configurations.
*   📦 **Database Suite**: Run database queries directly over the secure SSH tunnel connection. Includes syntax highlights for MySQL/PostgreSQL and autocomplete.
*   🚀 **Git Deployment Pipeline**: Trigger remote project updates, run migrations, install pip/npm dependencies, and view execution histories.
*   ⚙️ **Systemd & Nginx Wizards**: Generate reverse proxy configurations and service files with automated wizards.
*   🧠 **AI Diagnostic Assistant**: Get immediate diagnostic suggestions, query explanations, and command generation directly in your workspace.
*   📋 **Persistent Snippets & Notes**: Create localized snippets with parameter placeholders (`{{port}}`) and maintain clean, auto-saving checklists.

---

## 🛠️ Tech Stack

*   **Runtime Framework**: Electron
*   **User Interface**: React + TypeScript (Vite bundler)
*   **Styling Engine**: Tailwind CSS
*   **Connection Protocols**: `node-ssh`, SOCKS5 Proxy client
*   **Text Editor**: Monaco Editor (VS Code core engine)
*   **Database Connectivity**: SQLite, node-postgres, mysql2

---

## 💻 Local Setup

Install dependencies:
```bash
npm install
```

### Development Mode
Boot the hot-reloading Vite dev environment with Electron concurrently:
```bash
npm run electron:dev
```

### Production Compilation
Build release targets for macOS, Windows, and Linux:
```bash
npm run electron:build
```
Find the output files inside the `release/` or `dist/` directory.

#### ⚠️ macOS "App is Damaged" Troubleshooting
Because local or unsigned macOS builds are not code-signed or notarized with an Apple Developer account, macOS Gatekeeper will block them, showing a warning that the app is "damaged and can't be opened".

To resolve this on your system:
1. Copy `Server Operator.app` to your `/Applications` folder.
2. Open your terminal and run:
   ```bash
   xattr -cr /Applications/Server\ Operator.app
   ```
This strips the quarantine attribute and allows the application to launch successfully.

For official distribution, configure code signing and notarization using Apple Developer certificates within `electron-builder`.

---

## 🔌 Project Bootstrap (CLI & Configuration)

Create standardized deploy settings inside any active project codebase:

```bash
# Interactive setup configuration
npm run serop:init:interactive -- --path /path/to/your/project
```

This creates a local `.server-operator/` configuration folder containing:
*   `deploy.serop`: Reusable terminal shortcuts.
*   `AI_CONTEXT.md`: System metadata for AI agents.
*   `INSTALLATION_CONTEXT.md`: Server operating dependencies.

---

## 📄 License & Copyright

Copyright © 2026 **BeForth**. All rights reserved.

Licensed under the **Apache License, Version 2.0** (the "License"). You may obtain a copy of the License at:
http://www.apache.org/licenses/LICENSE-2.0
