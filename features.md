# Server Operator — Product Feature Guide

This guide describes the core capabilities, user-facing interactions, runtime systems, and state indicators of the **Server Operator** management suite.

---

## 1. SSH Server Connection Manager

The connection manager allows developers to register, manage, and monitor remote Unix hosts securely.

### Profile Registration
*   **Authentication Methods**: Supports secure private SSH keys (RSA, ED25519) or password authentication profiles.
*   **Tor Proxy Support**: Route network connections through active SOCKS5 Tor proxies (default `127.0.0.1:9050`) to support isolated network endpoints.
*   **VPC Forwarding compatibility**: Fully compatible with remote bastion hosts or VPN nodes.

### Real-Time Resource Monitoring
*   **Uptime & Memory Stats**: Periodically reads resource values (`free -m`, `cat /proc/uptime`) via non-interactive SSH shells to render live CPU, RAM, and disk utilization statistics.
*   **Visual Resource Toggles**: Dynamic radial gauge meters transition from Green (`success`) to Yellow (`warning`) and Red (`error`) based on load level thresholds.

---

## 2. Integrated File Explorer & Monaco Editor Workspace

Provides a fully integrated remote development environment mimicking professional IDE workspaces.

### Remote Directory Explorer
*   **Hierarchical Tree View**: Explores files recursively. Supports file uploads, folder expansions, creations, and file renaming operations directly over SFTP.
*   **Action Context Menus**: Right-clicking a node opens a context-specific action dropdown (New File, New Folder, Rename, Delete, Refresh).

### Monaco Editor Pane
*   **Multi-Tab Support**: Multiple files can be opened simultaneously. Unsaved changes are indicated by a warning dot indicator on each tab.
*   **Sudo Privilege Saving Mechanics**: If a file requires write protection adjustments (e.g. system configs), attempting to save triggers a secure sudo escalation sequence to write changes cleanly without permission rejections.

---

## 3. Git-Based Zero-Downtime Deployment Pipeline

Enables reliable, zero-downtime application updates directly from code repositories.

### Build and Deployment Logic
*   **Branch Ref Explorer**: Discovers active branch references on target repositories to allow developers to select deploy targets.
*   **Lifecycle Execution Scripts**: Runs custom build sequences based on local execution files (e.g., `pre-deploy.sh` and `post-deploy.sh` scripts) within the `.server-operator` workspace folder.
*   **Graceful Process Reloader**: Signals system supervisors (PM2 process managers or systemd) to execute reloads on modified codebases to keep application runtimes uninterrupted.
*   **Safety Build Lock**: Freezes adjacent screen menus during compiling processes to ensure that no concurrent scripts trigger overlap conflicts.

---

## 4. Local SQLite Audit Ledger & Commit Rollbacks

Every deployment is recorded locally to ensure operational safety and historical transparency.

### Local Audit Catalog
*   **SQLite Logging**: Saves audit lists (build times, targets, branches, commits) locally inside an `alerts.db` SQLite catalog.
*   **Console Output Capture**: Preserves complete terminal logs (stdout and stderr) for every build session.
*   **One-Click Git Rollbacks**: Reverting to a previous build extracts the healthy Git commit hash from SQLite, executes a remote `git checkout <commit_hash>` command, and re-triggers the reloader sequence.

---

## 5. SSH Tunnel Database Client

A secure database client that connects to remote database servers without exposing public database ports.

### Tunnel Architecture
*   **Local Port Forwarding Tunnels**: Creates an encrypted local TCP port forward on a randomized local port, routing all traffic safely inside the SSH stream.
*   **Database Engine Support**: Compatible with PostgreSQL, MySQL/MariaDB, and Redis.
*   **Schema Browser**: Automatically interrogates system databases to populate column keys and tables in the sidebar database tree.
*   **Autocompletion & Query Runner**: Integrates autocomplete keywords inside Monaco. Features a row spreadsheet viewer with quick local CSV exports.

---

## 6. Real-Time Streaming Docker Console

Enables containerized application supervision and operations.

### Container Supervision
*   **Visual Supervision**: Displays a lists of active and stopped containers, reporting container ID, state tags, and CPU/memory statistics.
*   **Container Action Bar**: Allows developers to Stop, Start, Restart, Pause, Kill, and Remove individual containers or entire Docker Compose stacks.
*   **Log Streams**: Dynamic stdout/stderr log channels are piped straight to the container view pane.
*   **Attached Shells**: Launches custom PTY shell sessions inside target containers using standard `docker exec -it` commands.

---

## 7. Integrated Server Configuration Assistants

Automates server setup workflows via interactive, template-driven tools.

### Nginx Server Blocks
*   **Template Generators**: Creates optimized server configuration blocks for static websites, Node.js, Python, or Go reverse proxies.
*   **Validation Mechanics**: Edits Nginx files directly within Monaco and runs validation checks (`nginx -t`) before restarting the Nginx daemon.

### Cron Scheduler
*   **Crontab Manager**: Reads, formats, and displays the user's crontab entries.
*   **Dynamic Writer**: Supports adding, disabling, or modifying scheduled cron jobs via a clean, form-based interface.

### Certbot SSL Installer
*   **Auto SSL Registration**: Automates Let's Encrypt SSL certificate generation and installation processes using Certbot scripts.
*   **Dry Run Support**: Tests SSL registration beforehand using Let's Encrypt dry run targets.

---

## 8. GitHub Update Banner System

An automatic version check system that keeps the application up to date.

### Startup Tag Evaluation
*   **Asynchronous Release Check**: On boot, the app fetches release tags from the GitHub Releases API to evaluate version differences using SemVer.
*   ** floating Toast Alerts**: Displays slide-in toast notifications when new versions are found, allowing users to load complete markdown release notes or dismiss the alert.
*   **Skip Preferences**: Dismissing a release version records the preference inside the local storage cache to prevent repetitive popups.

---
