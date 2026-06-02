# Server Operator — Feature Analysis

This document provides a comprehensive functional analysis of the **Server Operator** application. It details the underlying system architecture, data flows, state machine behaviors, and operational logic by tracing process boundaries, Electron IPC hooks, SQLite schemas, and React component bindings.

---

## 1. SSH Connection Lifecycle

Server Operator operates as a hybrid desktop client, using Node.js `ssh2` bindings inside the Electron main process to establish cryptographically secure connections to remote Unix platforms.

```
       REACT FRONTEND                               ELECTRON MAIN PROCESS
┌──────────────────────────┐                      ┌──────────────────────────┐
│                          │                      │  getOrCreateConnection() │
│  User clicks "Connect"   │ ── ipcRenderer.invoke ─► │            │             │
│  or triggers remote action│                      │  [Matches Pool Key?]     │
│                          │                      │    ├── YES: Return Conn  │
└──────────────────────────┘                      │    └── NO:  connectSSH() │
                                                  └────────────┬─────────────┘
                                                               │
                                         ┌─────────────────────┴─────────────────────┐
                                         ▼                                           ▼
                              [Standard TCP Clearnet]                    [Cloudflare Access SSH]
                                 ssh2.connect(opts)                       spawn("cloudflared")
                                         │                                           │
                                         ▼                                           ▼
                                 [SOCKS5 / Tor Proxy]                       Pipe Cloudflare PTY
                              SocksClient.createConnection()                   Duplex stream to
                                         │                                    ssh2 sock config
                                         ▼                                           │
                                  Connect SSH socket                                 ▼
                                                                           Established Tunnel PTY
```

### 1.1 Connection Methods
The application supports three discrete transport modes to initiate remote execution contexts:
1. **Password Authentication:** Transmits credentials securely. Handles interactive server requests by binding to the `keyboard-interactive` event on the SSH client (`conn.on('keyboard-interactive', ...)`), ensuring multi-factor challenge-response or standard password entry prompts are handled.
2. **Private Key (EC2 / Standard Key):** Resolves paths using a helper `resolveKeyPath` (locating relative keys within the application path or current working directory to support development environments). Reads raw key content in UTF-8 (`fs.readFileSync(keyPath, 'utf8')`) and injects it directly into the `ssh2` configuration payload.
3. **Cloudflare Tunnel (`cloudflared`):** Acts as a custom proxy command. Spawns `cloudflared access ssh --hostname <host>` using `child_process.spawn`. It hooks the child process's stdout/stdin stream into a custom `stream.Transform` duplex instance passed to `ssh2` as the `sock` connection parameter. Standard SSH authorization (keys or passwords) is then negotiated on top of this secure Cloudflare wrapper.

### 1.2 Tor SOCKS Proxy Integration
When the SOCKS proxy config is active, the app intercepts clearnet TCP resolution. It routes traffic through a SOCKS5 tunnel using the `socks` library:
- **Startup:** Connects to the local SOCKS client (typically `127.0.0.1:9050` or `127.0.0.1:9150`).
- **Timing:** Tor latency is high; the SSH connection timeout is automatically escalated from **25 seconds** to **150 seconds** (`readyTimeout: 150000`) to prevent handshake drops.
- **Port Detection:** The system automatically analyzes error signatures and provides detailed user hints (e.g., distinguishing System Tor port `9050` from Tor Browser port `9150`).

### 1.3 Lifecycle State Machine & Reconnects
Connection states map between React and the main Electron process via IPC:
- **`idle`**: The state before selection.
- **`connecting`**: Initiated by `handleSelectServer` in `App.tsx` or manual "Connect" actions in `NoServerView.tsx`. React sets `connectingTo = server.id`.
- **`connected`**: The main process successfully receives the `'ready'` event from the SSH client. React saves `currentServer` in state, prompting transition to the active dashboard.
- **`error` / `disconnected`**: Failures trigger validation catch blocks, setting React's `connectionError` state and returning helpful notifications to the client interface.

### 1.4 Connection Pooling and Idle Timeout
To keep resource footprint low and prevent server load, the main process operates an **SSH connection pool**:
- **Reusability:** Single connections are pooled via `getOrCreateConnection(connection, proxy)` mapping to a compound pool key: `ssh:${connection.id}:${proxyEnabled ? proxyAddress : 'direct'}`.
- **Garbage Collection:** Cached connections operate a 5-minute inactivity timer (`SSH_POOL_IDLE_MS = 300000`). If inactive, connections close silently (`conn.end()`) and are dropped from `connectionPool`.

---

## 2. Server Management Features

Server Operator uses a client-only data storage mechanism, prioritizing privacy and lightweight execution.

### 2.1 Profile Storage and Security
- **Data Store:** All server definitions, username, hostnames, private key paths, proxy flags, and passwords are saved directly inside Chromium's client `localStorage` under `server-operator:servers`.
- **Security:** Profile configurations are stored in **plaintext JSON** under the origin sandbox. Password storage is visible in plain text inside this local sandbox.

### 2.2 Adding and Mutating Profiles
- **Add Flow:** Completed in `NoServerView.tsx`. Inputs are collected in a standard React form. The form uses a desaturated dynamic warning banner and prevents native HTML5 tooltip bubbles via `noValidate`. Custom validations mark empty required fields in red. Saving invokes `onAddServer` which pushes the server payload to `localStorage`.
- **Edit/Delete Flow:** Triggered from the profile table. Clicking "Edit" places the row in interactive edit mode (`editingId === s.id`). Changes trigger `onUpdateServer` which saves updates to local storage. Delete sweeps clear the server ID from matching database histories.

---

## 3. Remote File Explorer & Editor

The file management panel uses standard SSH shell execution and base64 string streams, rather than demanding SFTP configurations for basic actions.

```
  REACT EDITOR                                     ELECTRON MAIN PROCESS
┌────────────────────────┐                        ┌────────────────────────┐
│                        │ ── ipcRenderer.invoke ─►  Run remote shell touch/  │
│  User saves changes or │                        │  cat pipeline via SSH  │
│  navigates folders     │ ◄─── Return Output ────│                        │
└────────────────────────┘                        └────────────────────────┘
```

### 3.1 Folder Navigation
- **Fetching Directory listings:** Handled via `server:list-dir`. Employs standard shell utility execution `ls -la "<path>"`. 
- **Parsing Directory listing stdout:** The React frontend parses raw shell printouts via a custom tokenizer helper (`parseLs.ts`), extracting permission matrices, owners, group names, file sizes, and modification timestamps.

### 3.2 File Operations
- **File Reading:** Triggers `server:read-file` which executes `cat "${filePath}"`. Files with elevated permissions automatically route through passwordless sudo: `sudo -n cat "${filePath}"`.
- **File Writing:** Accomplished using `server:write-file` via a robust base64 touch-and-tee strategy:
  1. Frontend sends text content as raw string.
  2. Main process converts string to base64: `Buffer.from(content, 'utf8').toString('base64')`.
  3. Transmits base64 data to a temporary remote file: `cat > /tmp/so-write.b64 << 'DELIM'\n${b64}\nDELIM`.
  4. Decodes the base64 string directly into target file path: `base64 -d /tmp/so-write.b64 > '${filePath}'`.
  5. Sudo edits escalate securely using `base64 -d /tmp/so-write.b64 | sudo -n tee '${filePath}'`.
  6. Temporary files are deleted using `rm -f /tmp/so-write.b64`.

### 3.3 Multiple Tab Management
- **State Array:** Managed inside `EditorArea.tsx` using `openTabs` state array containing absolute path pointers.
- **Unsaved Dirty Tracking:** Tracks modifications by maintaining a `savedContentByPath` map alongside the active `contentByPath` workspace. If values diverge, a visual indicator designates a modified state.

---

## 4. Git-Based Deployment Pipeline

Server Operator includes a structured git deployment orchestrator, tracking changes through local SQLite tables.

### 4.1 Deployment Execution Flow
Triggering a deploy initiates `server:run-deploy-pipeline` in the main process, firing a chained sequence of commands:

```
┌────────────────────────────────────────────────────────┐
│              1. Git Pull Origin target-branch           │
└───────────────────────────┬────────────────────────────┘
                            │ (Success)
                            ▼
┌────────────────────────────────────────────────────────┐
│              2. Resolve Dependencies                  │
│       (npm install / pip install requirements.txt)     │
└───────────────────────────┬────────────────────────────┘
                            │ (Success)
                            ▼
┌────────────────────────────────────────────────────────┐
│              3. Execute Migrations                     │
│    (npm run migrate / python manage.py migrate / auto) │
└───────────────────────────┬────────────────────────────┘
                            │ (Success)
                            ▼
┌────────────────────────────────────────────────────────┐
│              4. Reload Application Process             │
│        (pm2 restart service / systemd restart)         │
└───────────────────────────┬────────────────────────────┘
```

- **Output Redirection:** Output stdout/stderr lines are captured in real-time and pushed immediately to the frontend using the `shell-output` event channel, printing them within the active terminal stream.
- **History Logging:** Regardless of whether the build succeeded or failed, execution outputs, triggering commit hashes, status flags, and timestamps are recorded in the local SQLite `deployment_history` table.

### 4.2 Deployment History SQLite Schema
```sql
CREATE TABLE IF NOT EXISTS deployment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serverId TEXT NOT NULL,
  serverName TEXT NOT NULL,
  projectDir TEXT NOT NULL,
  branch TEXT NOT NULL,
  commitHash TEXT,
  triggeredCommand TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success' | 'failure'
  output TEXT,
  timestamp TEXT NOT NULL
);
```

### 4.3 Rollback Mechanism
- **Process:** The user selects a target deployment item from the pipeline history log.
- **Command Chaining:** Emits a `server:rollback-deploy` command, executing `git checkout "<commitHash>"` followed by the user's selected application reload command (`pm2` or `systemd`).

---

## 5. Database Client Architecture

The built-in database viewer allows queries without exposing database ports (`3306`, `5432`, `6379`) to the public internet.

```
┌───────────────────────┐          Local Loopback           ┌───────────────────────┐
│  React DB Dashboard   ├──────────────────────────────────►│  Local TCP Server     │
│  (Pg/MySQL/Redis)     │     (e.g., 127.0.0.1:51294)       │  (net.createServer)   │
└───────────────────────┘                                   └───────────┬───────────┘
                                                                        │
                                                                 SSH Forwarding
                                                                (sshConn.forwardOut)
                                                                        │
                                                                        ▼
                                                            ┌───────────────────────┐
                                                            │  Target DB Daemon     │
                                                            │  (e.g., 127.0.0.1:5432)│
                                                            └───────────────────────┘
```

### 5.1 Dynamic SSH Port Forwarding Tunnel
1. The app invokes `database:connect`.
2. The Electron main process initializes a local TCP loopback server using Node.js `net.createServer()` listening on port `0` (which directs the host OS to allocate an available random local port).
3. The local TCP port is saved in the active connections map (`activeDbConnections`).
4. Every incoming TCP packet to the local server is piped into the SSH connection stream via `sshConn.forwardOut()`, routing it directly to the remote server's loopback database port (e.g., PostgreSQL `5432`).
5. Client connection drivers (such as `pg` or `mysql2/promise`) are instantiated locally and pointed at `127.0.0.1:<allocated_local_port>`.

### 5.2 Schema Browsing & Query Parsing
- **Schema Mapping:**
  - **MySQL:** Executes `SHOW TABLES`.
  - **PostgreSQL:** Queries `information_schema.tables` where `table_schema = 'public'`.
  - **Redis:** Invokes `KEYS *`.
- **Query Parser (Redis):** Queries are tokenized using space-based splits, mapping the first token as the command and subsequent tokens as command parameters: `dbClient.call(tokens[0], ...tokens.slice(1))`.

---

## 6. Docker & Docker Compose Management

The Docker suite operates by executing command-line utilities and parsing raw JSON strings.

### 6.1 Container Listing & Extraction
- **Listing:** The system invokes `docker ps -a --format "{{json .}}"` via SSH.
- **Parsing:** Captures output lines, splits them by line breaks, and decodes each JSON string into an array of container metadata objects.

### 6.2 Docker Command Prefix & Sudo Escalation
- **Permission Checking:** Prior to execution, the main process runs a cached permission query using `docker info` and `sudo -n docker info`.
- **Escalation Cache:**
  - If direct execution fails with "permission denied" but `sudo -n` succeeds, it writes `sudo -n docker` to a local prefix cache (`dockerPrefixCache`) for a 60-second TTL.
  - If a command fails and requires interactive sudo passwords, the system intercepts the error and returns a descriptive helper message (e.g., suggesting adding the SSH user to the local `docker` group).

### 6.3 Compose Integration
- **Service Enumeration:** Resolves services using `docker compose config --services` (or pointing directly to custom Compose configs with `-f`).
- **Interactive Log Streaming:** Spawns a dedicated SSH connection executing `docker compose logs -f --tail=<count>`, redirecting output in real-time to the React client using Electron's `compose-logs-data` IPC channel.

---

## 7. Server Tools (Nginx, Cron, Certbot)

Server Tools provide structured dashboards for configuring essential server services.

### 7.1 Nginx Config Editor
- **Discovery:** Scans directories using `find /etc/nginx -type f -name '*.conf'`.
- **Validation:** Edits are checked prior to reload by executing `sudo nginx -t`.
- **Reloading:** Triggers standard service managers (`sudo systemctl restart nginx`).

### 7.2 Crontab Task Scheduler
- **Parsing:** Fetches existing schedules using `crontab -l`.
- **Upserting:** New tasks are appended and loaded into crontab: `(crontab -l 2>/dev/null; echo '${job}') | crontab -`.

### 7.3 Certbot SSL Pipeline
- **Validation:** Probes binary paths: `command -v certbot` or checking snap paths `test -x /snap/bin/certbot`.
- **Installation:** Performs snap-based installations: `sudo snap install --classic certbot && sudo ln -sf /snap/bin/certbot /usr/local/bin/certbot`.
- **Certificate Parsing:** Executes `sudo certbot certificates` and parses the stdout to extract domain lists, paths, and remaining valid days.

---

## 8. Terminal and Panels

Interactive terminals operate using a direct PTY stream, rather than relying on WebSockets or network proxies.

```
  XTERM.JS (RENDERER)                             PTY STREAM (ELECTRON)
┌──────────────────────┐    ipcRenderer.send      ┌──────────────────────┐
│  captures keystrokes │ ────────────────────────►│  writes raw input    │
│  and resize actions  │                          │  via s.stream.write  │
└──────────────────────┘                          └──────────┬───────────┘
           ▲                                                 │
           │                                          Electron IPC
     Keystroke write                                  shell-output
           │                                                 │
           └─────────────────────────────────────────────────┘
```

- **Keystroke Capture:** Xterm.js intercepts user keyboard inputs and sends raw characters using the `server:shell-write` IPC channel.
- **Output Feed:** The PTY stream’s standard output events are captured and sent to the focused browser window using the `shell-output` IPC event.
- **Bottom Panel Tabs:** The React frontend manages an array of `TerminalTab` records. Switching tabs focuses the matching container, adjusting Xterm's terminal geometry via a `ResizeObserver` layout wrapper.

---

## 9. Settings and Automatic Updates

- **Configuration Storage:** Application options are persisted in the user data directory inside `features.json`.
- **Automatic Updates:**
  - **Polling:** Checks for new releases every 4 hours (`4 * 60 * 60 * 1000`) by querying `https://api.github.com/repos/everest1508/server-operator/releases/latest`.
  - **Comparison:** Version checks use a semantic versioning parser (`isNewer`), splitting version tags (e.g., `v1.2.3`) into major, minor, and patch integer components.
  - **Action:** If a newer release is discovered, a notification toast is displayed, prompting the user to open the release download page.

---

## 10. State Management & Data Flow

```
┌────────────────────────────────────────────────────────┐
│                     React Frontend                     │
│   (App State, Tooltip / Select, Environment Context)   │
└───────────┬────────────────────────────────────▲───────┘
            │                                    │
    IPC Invoke Requests                  IPC Event Broadcasts
  (Database, Docker, Files)             (Uptime Status, Shell)
            │                                    │
┌───────────▼────────────────────────────────────┴───────┐
│                  Electron Main Process                 │
│  (SSH Connection Pool, Local TCP Tunnels, SQLite DB)   │
└────────────────────────────────────────────────────────┘
```

- **Global Store:** The system uses standard React component state lifting in `App.tsx` combined with a React Context provider for feature flags (`FeatureFlagContext`).
- **Telemetry Polling:** The main process runs a 60-second timer to monitor server resources (CPU, RAM, disk) and service statuses, broadcasting updates using the `monitored-servers-status-updated` event.
- **Persistent Telemetry Schema:**
```sql
CREATE TABLE IF NOT EXISTS historical_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serverId TEXT,
  cpu REAL,
  ram REAL,
  disk REAL,
  timestamp TEXT
);
```

---

## 11. Error Handling and Edge Cases

- **Timeout Interception:** Tor connection attempts are wrapped in a `Promise.race` timeout wrapper (escalated to 120 seconds), returning helper tips if SOCKS configurations appear unreachable.
- **Long-Running Process States:** Long-running pipeline commands (such as builds, git pulls, or migrations) disable dashboard tabs, displaying animated spinner indicators until the command execution completes.
- **Uncaught Exception Logging:** Global error hooks (`uncaughtException` and `unhandledRejection`) write crash metrics directly to `alerts.db` and log files in the application directory.
