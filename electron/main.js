const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { startUpdateChecker, runUpdateCheck } = require('./updateChecker');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

/**
 * Logs + app state live under Electron userData (Linux: usually ~/.config/server-operator).
 * That path is outside the .deb payload (/opt/Server Operator/…). Reinstalling or upgrading
 * the package only replaces files under /opt and the /usr/bin wrapper; it does not remove
 * userData, so saved servers, proxy settings, and dummy-root files persist.
 */
function getLogPath() {
  try {
    const dir = app.getPath('userData');
    return path.join(dir, 'server-operator.log');
  } catch (_) {
    return path.join(process.cwd(), 'server-operator.log');
  }
}

function log(message, detail) {
  const ts = new Date().toISOString();
  const line = detail != null ? `${ts} ${message} ${JSON.stringify(detail)}` : `${ts} ${message}`;
  console.error('[server-operator]', line);
  try {
    fs.appendFileSync(getLogPath(), line + '\n');
  } catch (e) {
    console.error('[server-operator] log write failed', e);
  }
}

// Log crashes so .deb installs can be debugged (e.g. ~/.config/server-operator/server-operator.log)
function setupCrashLogging() {
  const crashLog = (label, err) => {
    try {
      const p = getLogPath();
      const line = `${new Date().toISOString()} ${label} ${err && (err.stack || err.message || err)}\n`;
      fs.appendFileSync(p, line);
    } catch (_) {}
    console.error('[server-operator]', label, err);
  };
  process.on('uncaughtException', (err) => {
    crashLog('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    crashLog('unhandledRejection', { reason, promise: String(promise) });
  });
}
setupCrashLogging();

// ----- Initialize SQLite Database for Alert History -----
let db;
try {
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(app.getPath('userData'), 'alerts.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      log('SQLite connection error', { error: err.message });
    } else {
      log('SQLite database opened successfully', { path: dbPath });
    }
  });

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serverId TEXT,
        serverName TEXT,
        metricType TEXT,
        metricValue REAL,
        thresholdValue REAL,
        message TEXT,
        timestamp TEXT
      )
    `, (err) => {
      if (err) {
        log('SQLite table create error', { error: err.message });
      } else {
        log('SQLite alerts table initialized');
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS historical_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serverId TEXT,
        cpu REAL,
        ram REAL,
        disk REAL,
        timestamp TEXT
      )
    `, (err) => {
      if (err) {
        log('SQLite table historical_metrics create error', { error: err.message });
      } else {
        log('SQLite historical_metrics table initialized');
      }
    });

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_historical_metrics_server_time 
      ON historical_metrics (serverId, timestamp)
    `, (err) => {
      if (err) {
        log('SQLite index creation error', { error: err.message });
      } else {
        log('SQLite historical_metrics index initialized');
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS deployment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serverId TEXT NOT NULL,
        serverName TEXT NOT NULL,
        projectDir TEXT NOT NULL,
        branch TEXT NOT NULL,
        commitHash TEXT,
        triggeredCommand TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT,
        timestamp TEXT NOT NULL
      )
    `, (err) => {
      if (err) {
        log('SQLite deployment_history table create error', { error: err.message });
      } else {
        log('SQLite deployment_history table initialized');
      }
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS terminal_snippets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        command TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `, (err) => {
      if (err) {
        log('SQLite terminal_snippets table create error', { error: err.message });
      } else {
        log('SQLite terminal_snippets table initialized');
        db.get('SELECT COUNT(*) as count FROM terminal_snippets', (err, row) => {
          if (!err && row && row.count === 0) {
            const defaultSnippets = [
              {
                title: 'Docker Logs',
                description: 'Tail the last 100 lines of logs for a compose service',
                command: 'docker compose logs -f --tail=100 {{service_name}}'
              },
              {
                title: 'Reload Nginx Service',
                description: 'Safely test and reload Nginx configurations',
                command: 'sudo nginx -t && sudo systemctl reload nginx'
              },
              {
                title: 'Check Disk Space',
                description: 'Show mounted filesystems disk space usage',
                command: 'df -h'
              },
              {
                title: 'Process Check by Port',
                description: 'Find processes listening on a specific port',
                command: 'sudo netstat -tulpn | grep {{port}}'
              },
              {
                title: 'Memory Usage Info',
                description: 'Show system memory (RAM) usage in human-readable format',
                command: 'free -h'
              },
              {
                title: 'Docker System Prune',
                description: 'Remove all unused containers, networks, and images',
                command: 'docker system prune -a --volumes -f'
              }
            ];
            const stmt = db.prepare('INSERT INTO terminal_snippets (title, description, command, timestamp) VALUES (?, ?, ?, ?)');
            const ts = new Date().toISOString();
            defaultSnippets.forEach(s => {
              stmt.run(s.title, s.description, s.command, ts);
            });
            stmt.finalize();
            log('Seeded terminal snippets table with defaults');
          }
        });
      }
    });
  });
} catch (e) {
  log('SQLite module load error', { error: String(e) });
}

// Allow running on Linux without SUID chrome-sandbox (e.g. when not installed as root)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
  // Avoid GPU crashes on some Linux setups (e.g. headless, VMs, older drivers)
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

const isDev = process.env.ELECTRON_DEV === '1';

let mainWindow;

// Use a Chrome-like user agent so Web Speech API (voice input) has a better chance to reach Google's service.
// In many Electron setups speech still fails; then use the app in Chrome (e.g. http://localhost:5173) for voice.
const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function getAppIconPath() {
  if (process.platform !== 'linux' && process.platform !== 'win32') return null;
  const candidates = [
    path.join(process.cwd(), 'build/icons/256x256.png'),
    path.join(app.getAppPath(), 'build/icons/256x256.png'),
    path.join(__dirname, '../build/icons/256x256.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function installApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : [
          {
            label: 'File',
            submenu: [{ role: 'quit' }],
          },
        ]),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [{ role: 'pasteAndMatchStyle' }] : []),
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ],
    },
    ...(isMac
      ? [{ role: 'windowMenu' }]
      : [
          {
            label: 'View',
            submenu: [{ role: 'togglefullscreen' }],
          },
          {
            label: 'Window',
            submenu: [{ role: 'minimize' }, { role: 'close' }],
          },
        ]),
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          click: () => runUpdateCheck(() => mainWindow, true),
        },
        { type: 'separator' },
        {
          label: 'View on GitHub',
          click: () => shell.openExternal('https://github.com/everest1508/server-operator'),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const appIconPath = getAppIconPath();
  const isMac = process.platform === 'darwin';
  const windowOpts = {
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: isMac,
    titleBarStyle: isMac ? 'hidden' : undefined,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: appIconPath || undefined,
    show: false,
  };
  mainWindow = new BrowserWindow(windowOpts);

  if (!isMac) {
    mainWindow.setMenuBarVisibility(false);
  }

  // Set Chrome user agent before load to improve chance of Web Speech API (mic) working
  mainWindow.webContents.setUserAgent(CHROME_UA);

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || `http://localhost:${process.env.PORT || 5173}`;
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  log('started', { logFile: getLogPath() });

  // Set macOS Dock icon (works in both dev and packaged)
  if (process.platform === 'darwin' && app.dock) {
    const iconCandidates = [
      path.join(process.cwd(), 'build/icons/512x512.png'),
      path.join(process.cwd(), 'build/icons/256x256.png'),
      path.join(app.getAppPath(), 'build/icons/512x512.png'),
      path.join(__dirname, '../build/icons/512x512.png'),
    ];
    for (const candidate of iconCandidates) {
      if (fs.existsSync(candidate)) {
        try { app.dock.setIcon(candidate); } catch (_) {}
        break;
      }
    }
  }

  installApplicationMenu();
  createWindow();
  registerShellHandlers();
  startUpdateChecker(() => mainWindow);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Use Tor/SOCKS proxy when proxy is enabled globally. Per-server "Use proxy" can opt out (false = direct).
// When enabled, missing host/port are defaulted to 127.0.0.1:9050 in the Socks client.
function useProxy(connection, proxy) {
  if (!proxy || !proxy.enabled) return false;
  if (connection.useProxy === false) return false;
  return true;
}

// ----- Dummy (local) server: use local dummy-root folder, no SSH -----
function isDummy(connection) {
  return connection && (connection.id === 'dummy' || (connection.host && String(connection.host).trim() === 'dummy'));
}

function getDummyRoot() {
  const base = isDev ? process.cwd() : app.getPath('userData');
  return path.join(base, 'dummy-root');
}

function resolveDummyPath(connection, fileOrDirPath) {
  const base = getDummyRoot();
  let p = (fileOrDirPath || '.').trim().replace(/^\.\/?/, '') || '.';
  // Remove any leading prefix that equals dummy-root (full path or segment) so we never double the path
  const realBase = path.resolve(base);
  const normalizedInput = path.normalize(p);
  if (normalizedInput === realBase || normalizedInput.startsWith(realBase + path.sep)) {
    p = normalizedInput === realBase ? '.' : normalizedInput.slice(realBase.length + 1);
  } else if (p.startsWith(realBase)) {
    p = p.slice(realBase.length).replace(/^\/+/, '') || '.';
  } else {
    const dummyRootName = path.sep + 'dummy-root' + path.sep;
    const idx = p.indexOf(dummyRootName);
    if (idx !== -1) p = p.slice(idx + dummyRootName.length) || '.';
  }
  const resolved = path.join(base, p);
  if (path.resolve(resolved).indexOf(realBase) !== 0) return realBase; // prevent escape
  return resolved;
}

function ensureDummyRoot() {
  const root = getDummyRoot();
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    const compose = `version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    restart: unless-stopped
  app:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - .:/app
    command: sh -c "npm install && npm start"
    restart: unless-stopped
`;
    fs.writeFileSync(path.join(root, 'docker-compose.yml'), compose, 'utf8');
    fs.writeFileSync(path.join(root, 'README.md'), '# Dummy root\n\nUse this folder to simulate a server. Add files and run `docker compose up` from here.\n', 'utf8');
    fs.writeFileSync(path.join(root, '.env.example'), 'NODE_ENV=development\nPORT=3000\n', 'utf8');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"dummy-app","version":"1.0.0","scripts":{"start":"node index.js"}}\n', 'utf8');
    fs.writeFileSync(path.join(root, 'index.js'), "console.log('Hello from dummy root');\n", 'utf8');
    log('dummy-root created', { root });
  }
}

function formatLsLine(name, stat) {
  const isDir = stat.isDirectory();
  const mode = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
  const size = stat.size || 0;
  const mtime = stat.mtime;
  const month = mtime ? mtime.toLocaleString('en-US', { month: 'short' }) : 'Jan';
  const day = mtime ? mtime.getDate() : 1;
  const time = mtime ? mtime.toTimeString().slice(0, 5) : '00:00';
  return `${mode} 1 user group ${String(size).padStart(8)} ${month} ${day} ${time} ${name}`;
}

function listDirDummy(connection, dirPath) {
  ensureDummyRoot();
  const resolved = resolveDummyPath(connection, dirPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return { ok: false, error: 'No such file or directory' };
  }
  const names = fs.readdirSync(resolved);
  const lines = names
    .filter((n) => n !== '.' && n !== '..')
    .map((name) => {
      const full = path.join(resolved, name);
      const stat = fs.statSync(full);
      return formatLsLine(name, stat);
    })
    .sort((a, b) => a.localeCompare(b));
  return { ok: true, stdout: lines.join('\n'), stderr: '' };
}

function errMsg(e) {
  if (e && typeof e === 'object' && 'message' in e) return String(e.message);
  return String(e != null ? e : 'Unknown error');
}

// Resolve key path: relative paths try app path first, then cwd (so "creds" works with npm run electron:dev)
function resolveKeyPath(relativeOrAbsolutePath) {
  const p = String(relativeOrAbsolutePath).trim();
  if (!p) return p;
  if (path.isAbsolute(p)) return p;
  const fromApp = path.join(app.getAppPath(), p);
  if (fs.existsSync(fromApp)) return fromApp;
  const fromCwd = path.join(process.cwd(), p);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return fromApp; // prefer app path for error message
}

function connectSSH(connection, proxy) {
  return new Promise((resolve, reject) => {
    if (!connection || typeof connection !== 'object') {
      reject(new Error('No connection config'));
      return;
    }
    const host = connection.host && String(connection.host).trim();
    if (!host) {
      reject(new Error('Server host is required'));
      return;
    }
    const username = connection.username && String(connection.username).trim();
    if (!username) {
      reject(new Error('SSH username is required'));
      return;
    }
    const { Client } = require('ssh2');
    const conn = new Client();

    // ── Cloudflare Tunnel SSH ──────────────────────────────────────────────
    if (connection.connectionType === 'cloudflare') {
      const { spawn } = require('child_process');
      // cloudflared access ssh --hostname <host> acts exactly like ProxyCommand
      log('Cloudflare Tunnel connect', { host });
      const cf = spawn('cloudflared', ['access', 'ssh', '--hostname', host], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      cf.on('error', (e) => {
        const msg = errMsg(e);
        log('cloudflared spawn error', { host, error: msg });
        const hint = /ENOENT/.test(msg)
          ? ' Make sure cloudflared is installed and in PATH (brew install cloudflare/cloudflare/cloudflared).'
          : '';
        reject(new Error('cloudflared: ' + msg + hint));
      });
      cf.stderr.on('data', (data) => {
        log('cloudflared stderr', { host, data: String(data).trim() });
      });

      const config = {
        username,
        port: 22,
        readyTimeout: 30000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        // Use the cloudflared subprocess as the transport socket.
        sock: (() => {
          const duplex = new (require('stream').Transform)({
            transform(chunk, _enc, cb) { cb(null, chunk); },
          });
          duplex.pipe = (dest) => { cf.stdout.pipe(dest); return dest; };
          duplex.write = (chunk, enc, cb) => cf.stdin.write(chunk, enc, cb);
          duplex.end = (chunk, enc, cb) => cf.stdin.end(chunk, enc, cb);
          cf.stdout.on('data', (d) => duplex.push(d));
          cf.stdout.on('end', () => duplex.push(null));
          cf.on('close', (code) => {
            if (code !== 0 && code !== null) {
              duplex.destroy(new Error(`cloudflared exited with code ${code}`));
            }
          });
          return duplex;
        })(),
      };
      // SSH auth layer on top of the cloudflared tunnel: password takes priority, then SSH key.
      if (connection.password && connection.password.length > 0) {
        config.password = connection.password;
        config.tryKeyboard = true;
      } else if (connection.privateKeyPath) {
        try {
          const keyPath = resolveKeyPath(connection.privateKeyPath);
          if (fs.existsSync(keyPath)) config.privateKey = fs.readFileSync(keyPath, 'utf8');
        } catch (_) {}
      }
      conn.on('ready', () => {
        log('SSH (Cloudflare Tunnel) connected', { host });
        resolve(conn);
      }).on('error', (e) => {
        const msg = errMsg(e);
        log('SSH (Cloudflare Tunnel) error', { host, error: msg });
        try { cf.kill(); } catch (_) {}
        reject(new Error(msg));
      });
      if (connection.password && connection.password.length > 0) {
        conn.on('keyboard-interactive', (_name, _inst, _lang, prompts, finish) => {
          finish([connection.password]);
        });
      }
      conn.connect(config);
      return;
    }


    // ── Standard SSH (password / EC2 key) ─────────────────────────────────
    const usePassword = (connection.connectionType === 'password' || connection.password) && typeof connection.password === 'string' && connection.password.length > 0;
    const viaProxy = useProxy(connection, proxy);
    const config = {
      username,
      port: 22,
      // Tor adds high latency; allow up to 2.5 min for handshake when via proxy
      readyTimeout: viaProxy ? 150000 : 20000,
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
    };
    if (usePassword) {
      config.password = connection.password;
      config.tryKeyboard = true;
    } else if (connection.privateKeyPath) {
      try {
        const keyPath = resolveKeyPath(connection.privateKeyPath);
        log('SSH key path', { original: connection.privateKeyPath, resolved: keyPath });
        if (!fs.existsSync(keyPath)) {
          reject(new Error(`SSH key file not found: ${keyPath}`));
          return;
        }
        config.privateKey = fs.readFileSync(keyPath, 'utf8');
      } catch (e) {
        reject(new Error('Invalid key path: ' + errMsg(e)));
        return;
      }
    } else {
      reject(new Error('No password or SSH key path configured for this server'));
      return;
    }
    conn.on('ready', () => {
      log('SSH connected', { host: connection.host, viaProxy });
      resolve(conn);
    }).on('error', (e) => {
      const msg = errMsg(e);
      log('SSH error', { host: connection.host, viaProxy, error: msg });
      reject(new Error(msg));
    });
    if (usePassword) {
      conn.on('keyboard-interactive', (_name, _inst, _lang, prompts, finish) => {
        finish([connection.password]);
      });
    }
    log('SSH connect attempt', { host: connection.host, viaProxy, proxy: viaProxy ? { host: proxy.host, port: proxy.port } : null });
    if (viaProxy) {
      const { SocksClient } = require('socks');
      const proxyHost = String(proxy.host || '').trim() || '127.0.0.1';
      const proxyPort = Number(proxy.port) || 9050;
      SocksClient.createConnection({
        proxy: { host: proxyHost, port: proxyPort, type: 5 },
        command: 'connect',
        destination: { host, port: 22 },
        timeout: 90000, // Tor can be very slow to establish the tunnel
      }).then(({ socket }) => {
        log('SOCKS tunnel established', { host });
        conn.connect({ ...config, sock: socket });
      }).catch((e) => {
        const msg = errMsg(e);
        log('SOCKS proxy error', { host, proxy: { host: proxy.host, port: proxy.port }, error: msg });
        let hint = '';
        if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(msg)) {
          hint = ' Is the proxy (e.g. Tor) running on ' + (proxy.host || '127.0.0.1') + ':' + (proxy.port ?? 9050) + '?';
        } else if (/rejected|Failure/i.test(msg)) {
          hint = ' Check that Tor (or your SOCKS5 proxy) is running. System Tor uses port 9050; Tor Browser uses 9150. If the server is a clearnet IP, try connecting without proxy.';
        }
        reject(new Error('Proxy: ' + msg + hint));
      });
    } else {
      conn.connect({ ...config, host });
    }
  });
}

// Reuse one SSH connection per server+proxy so folder clicks don't reconnect every time.
const SSH_POOL_IDLE_MS = 5 * 60 * 1000; // 5 min idle then close
const connectionPool = new Map(); // key -> { conn, lastUsed }
const connectionInFlight = new Map(); // key -> Promise<Client>

function poolKey(connection, proxy) {
  if (!connection || !connection.id) return null;
  const p = proxy && proxy.enabled ? `${String(proxy.host || '').trim() || '127.0.0.1'}:${Number(proxy.port) || 9050}` : 'direct';
  return `ssh:${connection.id}:${p}`;
}

async function getOrCreateConnection(connection, proxy) {
  const key = poolKey(connection, proxy);
  if (!key) return connectSSH(connection, proxy);

  const entry = connectionPool.get(key);
  if (entry && entry.conn) {
    if (Date.now() - entry.lastUsed > SSH_POOL_IDLE_MS) {
      try { entry.conn.end(); } catch (_) {}
      connectionPool.delete(key);
      connectionQueues.delete(key);
    } else {
      entry.lastUsed = Date.now();
      return entry.conn;
    }
  }

  let promise = connectionInFlight.get(key);
  if (promise) return promise;

  promise = connectSSH(connection, proxy).then((conn) => {
    connectionInFlight.delete(key);
    conn.on('close', () => {
      connectionPool.delete(key);
      connectionQueues.delete(key);
    });
    conn.on('error', () => {
      connectionPool.delete(key);
      connectionQueues.delete(key);
    });
    connectionPool.set(key, { conn, lastUsed: Date.now() });
    return conn;
  });
  connectionInFlight.set(key, promise);
  return promise;
}

// Queue of execution promises per connection key to enforce sequential command runs
const connectionQueues = new Map(); // key -> Promise

function findPoolKey(conn) {
  for (const [key, entry] of connectionPool.entries()) {
    if (entry.conn === conn) return key;
  }
  return null;
}

function execCommandRaw(conn, command, cwd) {
  return new Promise((resolve, reject) => {
    const fullCmd = cwd ? `cd "${String(cwd).replace(/"/g, '\\"')}" && ${command}` : command;
    conn.exec(fullCmd, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      let stdout = '';
      let stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
      stream.on('close', (code) => {
        resolve({ stdout, stderr, code: code ?? null });
      });
    });
  });
}

function execCommand(conn, command, cwd) {
  const key = findPoolKey(conn);
  if (!key) {
    return execCommandRaw(conn, command, cwd);
  }

  // Get current queue chain or start with resolved Promise
  let currentQueue = connectionQueues.get(key) || Promise.resolve();

  // Chain the next command execution sequentially
  const nextQueue = currentQueue.then(() => {
    return execCommandRaw(conn, command, cwd);
  }).catch((err) => {
    // Propagate the rejection but do not block the queue
    return Promise.reject(err);
  });

  // Keep the queue state healthy without unhandled promise rejections on map reference
  connectionQueues.set(key, nextQueue.catch(() => {}));

  return nextQueue;
}

const DOCKER_PREFIX_CACHE_TTL_MS = 60 * 1000;
const dockerPrefixCache = new Map(); // key -> { prefix, checkedAt }

function dockerPrefixCacheKey(connection, proxy) {
  const key = poolKey(connection, proxy);
  if (key) return key;
  const host = connection && connection.host ? String(connection.host).trim() : '';
  const user = connection && connection.username ? String(connection.username).trim() : '';
  return `ssh:${host}:${user}:docker-prefix`;
}

function commandMentionsDocker(command) {
  return /\bdocker\b/.test(String(command || ''));
}

function dockerPermissionDenied(output) {
  const text = String(output || '').toLowerCase();
  return (
    text.includes('permission denied while trying to connect to the docker daemon socket') ||
    (text.includes('got permission denied') && text.includes('docker')) ||
    (text.includes('/var/run/docker.sock') && text.includes('permission denied'))
  );
}

function sudoNeedsPassword(output) {
  const text = String(output || '').toLowerCase();
  return (
    text.includes('a password is required') ||
    text.includes('sudo: no tty present') ||
    text.includes('sudo: a terminal is required') ||
    text.includes('sudo: a password is required')
  );
}

function withDockerPrefix(command, prefix) {
  const cmd = String(command || '');
  if (!cmd || prefix === 'docker') return cmd;
  if (/\bsudo\s+(-n\s+)?docker\b/.test(cmd)) return cmd;
  return cmd.replace(/\bdocker\b/g, prefix);
}

async function resolveDockerPrefix(conn, connection, proxy, cwd, forceRefresh = false) {
  const key = dockerPrefixCacheKey(connection, proxy);
  const cached = dockerPrefixCache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.checkedAt < DOCKER_PREFIX_CACHE_TTL_MS) {
    return { prefix: cached.prefix };
  }

  const direct = await execCommand(conn, 'docker info >/dev/null 2>&1', cwd);
  if (direct.code === 0) {
    dockerPrefixCache.set(key, { prefix: 'docker', checkedAt: Date.now() });
    return { prefix: 'docker' };
  }

  const directOut = `${direct.stderr || ''}\n${direct.stdout || ''}`;
  if (!dockerPermissionDenied(directOut)) {
    dockerPrefixCache.set(key, { prefix: 'docker', checkedAt: Date.now() });
    return { prefix: 'docker' };
  }

  const sudo = await execCommand(conn, 'sudo -n docker info >/dev/null 2>&1', cwd);
  if (sudo.code === 0) {
    dockerPrefixCache.set(key, { prefix: 'sudo -n docker', checkedAt: Date.now() });
    return { prefix: 'sudo -n docker' };
  }

  const sudoOut = `${sudo.stderr || ''}\n${sudo.stdout || ''}`;
  if (sudoNeedsPassword(sudoOut)) {
    return {
      prefix: 'docker',
      error:
        'Docker permission denied for this SSH user. Add the user to the docker group (`sudo usermod -aG docker $USER` then reconnect), or allow passwordless sudo for docker commands.',
    };
  }

  return { prefix: 'docker' };
}

async function execDockerAwareCommand(conn, command, cwd, connection, proxy) {
  const result = await execCommand(conn, command, cwd);
  if (result.code === 0 || !commandMentionsDocker(command)) return result;

  const combined = `${result.stderr || ''}\n${result.stdout || ''}`;
  if (!dockerPermissionDenied(combined)) return result;

  const resolved = await resolveDockerPrefix(conn, connection, proxy, cwd, true);
  if (resolved.error) {
    return { stdout: result.stdout || '', stderr: resolved.error, code: 1 };
  }
  if (resolved.prefix === 'docker') return result;

  const retried = await execCommand(conn, withDockerPrefix(command, resolved.prefix), cwd);
  if (retried.code === 0) return retried;
  const retriedOut = `${retried.stderr || ''}\n${retried.stdout || ''}`;
  if (sudoNeedsPassword(retriedOut)) {
    return {
      stdout: retried.stdout || '',
      stderr:
        'Docker command needs sudo password, but non-interactive SSH cannot prompt for it. Add the user to the docker group or configure passwordless sudo for docker.',
      code: 1,
    };
  }
  return retried;
}

const shells = new Map();

function sendShellOutput(shellId, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shell-output', { shellId, data });
  }
}

function registerShellHandlers() {
  ipcMain.handle('server:open-shell', async (_, { connection, proxy }) => {
    try {
      if (isDummy(connection)) {
        return { ok: false, error: 'Shell is not available for Dummy (local) server. Use your system terminal in the dummy-root folder to run commands.' };
      }
      const conn = await connectSSH(connection, proxy);

      // Check docker permissions via a silent non-PTY exec BEFORE opening the PTY shell,
      // so nothing pollutes the terminal display.
      const dockerAlias = await new Promise((resolve) => {
        conn.exec('if ! docker info >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then echo __sudo__; fi', (err, s) => {
          if (err || !s) { resolve(''); return; }
          let out = '';
          s.stdout.on('data', (d) => { out += d.toString(); });
          s.on('close', () => resolve(out.includes('__sudo__') ? "alias docker='sudo -n docker'" : ''));
        });
      });

      return new Promise((resolve, reject) => {
        conn.shell((err, stream) => {
          if (err) {
            conn.end();
            reject(err);
            return;
          }
          const shellId = 'shell-' + Date.now() + '-' + Math.random().toString(36).slice(2);
          shells.set(shellId, { conn, stream });
          stream.on('data', (data) => sendShellOutput(shellId, data.toString()));
          stream.on('close', () => {
            shells.delete(shellId);
            conn.end();
            sendShellOutput(shellId, '\r\n[Shell closed]\r\n');
          });
          stream.stderr.on('data', (data) => sendShellOutput(shellId, data.toString()));
          const cwd = connection.cwd || connection.projectPath;
          // Build a single silent init line: cd + optional alias, then clear.
          // 'clear' is the only thing the PTY echoes, and it immediately wipes itself.
          const parts = [];
          if (cwd) parts.push('cd "' + String(cwd).replace(/"/g, '\\"') + '" 2>/dev/null || true');
          if (dockerAlias) parts.push(dockerAlias);
          parts.push('clear');
          stream.write(parts.join('; ') + '\n');
          resolve({ ok: true, shellId });
        });
      });
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  });
  ipcMain.handle('server:shell-write', (_, { shellId, data }) => {
    const s = shells.get(shellId);
    if (s && s.stream && !s.stream.writableEnded) s.stream.write(data);
  });
  ipcMain.handle('server:close-shell', (_, { shellId }) => {
    const s = shells.get(shellId);
    if (s) {
      if (s.stream && !s.stream.writableEnded) s.stream.end();
      s.conn.end();
      shells.delete(shellId);
    }
  });
  log('shell handlers registered', { openShell: true });
}

ipcMain.handle('server:test-connection', async (_, { connection, proxy }) => {
  if (!connection) return { ok: false, error: 'No server config' };
  if (isDummy(connection)) {
    ensureDummyRoot();
    return { ok: true };
  }
  log('test-connection', { name: connection.name, host: connection.host, proxyEnabled: !!proxy?.enabled });
  const useProxy = proxy && proxy.enabled && proxy.host && proxy.port;
  const timeoutMs = useProxy ? 120000 : 25000; // 2 min via proxy, 25s direct
  let conn;
  try {
    conn = await Promise.race([
      connectSSH(connection, proxy),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timed out. ' + (useProxy ? 'If using Tor, ensure it is running and the host is reachable.' : 'Check host and network.'))), timeoutMs)),
    ]);
    const result = await execCommand(conn, 'echo connected', connection.cwd || connection.projectPath || undefined);
    const ok = result.code === 0;
    if (!ok) {
      try { conn.end(); } catch (_) {}
      log('test-connection failed (echo)', { host: connection.host, stderr: result.stderr, stdout: result.stdout });
      return { ok, error: result.stderr || result.stdout || 'Connection failed' };
    }
    // Reuse this connection for listDir, readFile, deploy, etc. (put in pool instead of closing)
    const key = poolKey(connection, proxy);
    if (key) {
      conn.on('close', () => {
        connectionPool.delete(key);
        connectionQueues.delete(key);
      });
      conn.on('error', () => {
        connectionPool.delete(key);
        connectionQueues.delete(key);
      });
      connectionPool.set(key, { conn, lastUsed: Date.now() });
    } else {
      try { conn.end(); } catch (_) {}
    }
    return { ok: true };
  } catch (e) {
    const err = errMsg(e);
    log('test-connection error', { host: connection.host, error: err });
    return { ok: false, error: err };
  }
});

ipcMain.handle('server:run-command', async (_, { host, username, privateKeyPath, command, cwd, connection, proxy }) => {
  try {
    if (connection && isDummy(connection)) {
      const root = getDummyRoot();
      ensureDummyRoot();
      // Return '.' for pwd so the frontend never gets the full path and never sends it as a prefix
      const trimmedCmd = (command || '').trim();
      if (trimmedCmd === 'pwd' || trimmedCmd === 'pwd;') {
        return { ok: true, stdout: '.', stderr: '', code: 0 };
      }
      try {
        const out = execSync(command, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
        return { ok: true, stdout: out || '', stderr: '', code: 0 };
      } catch (e) {
        return { ok: false, stdout: e.stdout || '', stderr: e.stderr || errMsg(e), code: e.status ?? 1 };
      }
    }
    if (connection) {
      const conn = await getOrCreateConnection(connection, proxy ?? null);
      const result = await execDockerAwareCommand(conn, command, cwd || connection.cwd, connection, proxy ?? null);
      return { ok: true, stdout: result.stdout, stderr: result.stderr, code: result.code };
    }
    const conn = await connectSSH(
      { host, username, privateKeyPath, connectionType: 'ec2' },
      undefined
    );
    try {
      const result = await execDockerAwareCommand(conn, command, cwd, { host, username, id: `${username}@${host}` }, undefined);
      return { ok: true, stdout: result.stdout, stderr: result.stderr, code: result.code };
    } finally {
      conn.end();
    }
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('server:get-docker-ps', async (_, { connection, proxy }) => {
  try {
    const conn = await getOrCreateConnection(connection, proxy);
    const result = await execDockerAwareCommand(conn, 'docker ps -a --format "{{json .}}"', connection.cwd, connection, proxy);
    if (result.code !== 0) {
      return { ok: false, error: result.stderr || result.stdout || 'Failed to fetch containers' };
    }
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    const containers = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    return { ok: true, containers };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

function envMapFromContainer(container) {
  const env = {};
  for (const entry of container?.Config?.Env || []) {
    const idx = String(entry).indexOf('=');
    if (idx > 0) env[entry.slice(0, idx)] = entry.slice(idx + 1);
  }
  return env;
}

function firstContainerIp(container) {
  const networks = container?.NetworkSettings?.Networks || {};
  for (const network of Object.values(networks)) {
    if (network?.IPAddress) return network.IPAddress;
  }
  return '';
}

function detectDockerDbType(container, env) {
  const text = [
    container?.Name,
    container?.Config?.Image,
    container?.Config?.Hostname,
    ...(container?.Config?.Cmd || []),
  ].join(' ').toLowerCase();

  if (text.includes('postgres') || text.includes('postgis') || text.includes('timescale') || env.POSTGRES_DB || env.POSTGRES_USER) {
    return 'postgres';
  }
  if (text.includes('mariadb') || text.includes('mysql') || env.MYSQL_DATABASE || env.MARIADB_DATABASE || env.MYSQL_ROOT_PASSWORD || env.MARIADB_ROOT_PASSWORD) {
    return 'mysql';
  }
  if (text.includes('redis') || env.REDIS_PASSWORD) {
    return 'redis';
  }
  return null;
}

function dockerDbDefaults(dbType, env) {
  if (dbType === 'postgres') {
    return {
      port: '5432',
      username: env.POSTGRES_USER || 'postgres',
      password: env.POSTGRES_PASSWORD || '',
      database: env.POSTGRES_DB || env.POSTGRES_USER || 'postgres',
    };
  }
  if (dbType === 'mysql') {
    const rootPassword = env.MYSQL_ROOT_PASSWORD || env.MARIADB_ROOT_PASSWORD || '';
    return {
      port: '3306',
      username: env.MYSQL_USER || env.MARIADB_USER || 'root',
      password: env.MYSQL_PASSWORD || env.MARIADB_PASSWORD || rootPassword,
      database: env.MYSQL_DATABASE || env.MARIADB_DATABASE || '',
    };
  }
  return {
    port: '6379',
    username: '',
    password: env.REDIS_PASSWORD || '',
    database: '0',
  };
}

function dockerDbEndpoint(container, defaultPort) {
  const ports = container?.NetworkSettings?.Ports || {};
  const bindings = ports[`${defaultPort}/tcp`] || [];
  const published = Array.isArray(bindings) ? bindings.find((b) => b?.HostPort) : null;
  if (published?.HostPort) {
    return { host: '127.0.0.1', port: String(published.HostPort), source: 'published-port' };
  }

  const ip = firstContainerIp(container);
  if (ip) {
    return { host: ip, port: String(defaultPort), source: 'container-ip' };
  }

  return { host: '127.0.0.1', port: String(defaultPort), source: 'default-port' };
}

function dockerDatabasePreset(container) {
  const env = envMapFromContainer(container);
  const dbType = detectDockerDbType(container, env);
  if (!dbType) return null;

  const defaults = dockerDbDefaults(dbType, env);
  const endpoint = dockerDbEndpoint(container, defaults.port);
  const name = String(container?.Name || '').replace(/^\//, '') || container?.Id?.slice(0, 12) || 'database';

  return {
    id: container?.Id || name,
    name,
    image: container?.Config?.Image || '',
    state: container?.State?.Status || '',
    status: container?.State?.Running ? 'running' : (container?.State?.Status || ''),
    dbType,
    host: endpoint.host,
    port: endpoint.port,
    username: defaults.username,
    password: defaults.password,
    database: defaults.database,
    source: endpoint.source,
  };
}

ipcMain.handle('server:get-docker-databases', async (_, { connection, proxy }) => {
  try {
    const conn = await getOrCreateConnection(connection, proxy);
    const cwd = connection.cwd || connection.projectPath;
    const cmd = 'ids=$(docker ps -a -q); if [ -z "$ids" ]; then echo "[]"; else docker inspect $ids; fi';
    const result = await execDockerAwareCommand(conn, cmd, cwd, connection, proxy);
    if (result.code !== 0) {
      return { ok: false, error: result.stderr || result.stdout || 'Failed to inspect Docker containers', databases: [] };
    }

    const containers = JSON.parse(result.stdout || '[]');
    const databases = (Array.isArray(containers) ? containers : [])
      .map(dockerDatabasePreset)
      .filter(Boolean);

    return { ok: true, databases };
  } catch (e) {
    return { ok: false, error: errMsg(e), databases: [] };
  }
});

function isComposeFilePath(p) {
  const lower = (p || '').toLowerCase();
  return lower.endsWith('.yml') || lower.endsWith('.yaml');
}

ipcMain.handle('server:get-docker-compose-services', async (_, { connection, composePath, proxy }) => {
  try {
    if (isDummy(connection)) {
      ensureDummyRoot();
      const cwd = getDummyRoot();
      const resolved = composePath ? resolveDummyPath(connection, composePath) : path.join(cwd, 'docker-compose.yml');
      const pathEsc = resolved.replace(/'/g, "'\\''");
      const cmd = `docker compose -f '${pathEsc}' config --services`;
      try {
        const out = execSync(cmd, { cwd, encoding: 'utf8' });
        const services = (out || '').trim().split(/\n/).map((s) => s.trim()).filter(Boolean);
        return { ok: true, services };
      } catch {
        return { ok: false, error: 'No compose file found or docker not available.', services: [] };
      }
    }
    const conn = await getOrCreateConnection(connection, proxy);
    const cwd = connection.cwd || connection.projectPath;
    const pathEsc = (composePath || '').replace(/'/g, "'\\''");
    const cmd = pathEsc
      ? isComposeFilePath(composePath)
        ? `docker compose -f '${pathEsc}' config --services`
        : `docker compose --project-directory '${pathEsc}' config --services`
      : 'docker compose config --services';
    const result = await execDockerAwareCommand(conn, cmd, cwd, connection, proxy);
    const out = (result.stdout + result.stderr).trim();
    if (result.code !== 0) {
      const friendly = /no configuration file|not found/i.test(out)
        ? `No compose file found at "${composePath || 'default'}". Check the path.`
        : out || 'Failed to list services';
      return { ok: false, error: friendly, services: [] };
    }
    const services = result.stdout.trim().split(/\n/).map((s) => s.trim()).filter(Boolean);
    return { ok: true, services };
  } catch (e) {
    return { ok: false, error: errMsg(e), services: [] };
  }
});

ipcMain.handle('server:get-docker-compose-logs', async (_, { connection, service, tail, proxy, composePath }) => {
  try {
    const conn = await getOrCreateConnection(connection, proxy);
    const cwd = connection.cwd || connection.projectPath;
    const pathEsc = (composePath || '').replace(/'/g, "'\\''");
    const composeFlag = pathEsc
      ? isComposeFilePath(composePath)
        ? `-f '${pathEsc}' `
        : `--project-directory '${pathEsc}' `
      : '';
    const cmd = service
      ? `docker compose ${composeFlag}logs --tail=${tail || 500} ${service}`
      : `docker compose ${composeFlag}logs --tail=${tail || 500}`;
    const result = await execDockerAwareCommand(conn, cmd, cwd, connection, proxy);
    const out = (result.stdout + result.stderr).trim();
    if (result.code !== 0) {
      const friendly = /no configuration file|not found/i.test(out)
        ? (composePath ? `No compose file at "${composePath}".` : 'No docker-compose.yml (or docker-compose.yaml) found in the server\'s working directory. Add a compose file there, or use the Terminal tab to run docker commands.')
        : out || 'Docker Compose command failed';
      return { ok: false, error: friendly };
    }
    return { ok: true, logs: result.stdout + result.stderr };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

const logStreams = new Map();

function sendComposeLogsData(streamId, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('compose-logs-data', { streamId, data });
  }
}

ipcMain.handle('server:start-compose-logs-stream', async (event, { streamId, connection, composePath, service, tail, proxy }) => {
  try {
    if (isDummy(connection)) {
      return { ok: false, error: 'Streaming logs not available for Dummy (local) server. Use Deploy to run docker compose logs.' };
    }
    const cwd = connection.cwd || connection.projectPath;
    const pathEsc = (composePath || '').replace(/'/g, "'\\''");
    const composeFlag = pathEsc
      ? isComposeFilePath(composePath)
        ? `-f '${pathEsc}' `
        : `--project-directory '${pathEsc}' `
      : '';
    const servicePart = service ? ` ${service}` : '';
    const conn = await connectSSH(connection, proxy);
    const resolved = await resolveDockerPrefix(conn, connection, proxy, cwd);
    if (resolved.error) {
      conn.end();
      return { ok: false, error: resolved.error };
    }
    const dockerPrefix = resolved.prefix || 'docker';
    const fullCmd = cwd
      ? `cd "${String(cwd).replace(/"/g, '\\"')}" && ${dockerPrefix} compose ${composeFlag}logs -f --tail=${tail || 200}${servicePart}`
      : `${dockerPrefix} compose ${composeFlag}logs -f --tail=${tail || 200}${servicePart}`;
    return new Promise((resolve, reject) => {
      conn.exec(fullCmd, (err, stream) => {
        if (err) {
          conn.end();
          reject(err);
          return;
        }
        logStreams.set(streamId, { conn, stream });
        stream.on('data', (data) => sendComposeLogsData(streamId, data.toString()));
        stream.stderr.on('data', (data) => sendComposeLogsData(streamId, data.toString()));
        stream.on('close', (code) => {
          logStreams.delete(streamId);
          conn.end();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('compose-logs-stream-ended', { streamId });
          }
        });
        resolve({ ok: true });
      });
    });
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('server:stop-compose-logs-stream', async (_, { streamId }) => {
  const s = logStreams.get(streamId);
  if (s) {
    if (s.stream && !s.stream.writableEnded) s.stream.destroy();
    s.conn.end();
    logStreams.delete(streamId);
  }
});

ipcMain.handle('server:read-file', async (_, { connection, filePath, proxy, useSudo }) => {
  try {
    const conn = await getOrCreateConnection(connection, proxy);
    const pathEsc = filePath.replace(/"/g, '\\"');
    const cwd = connection.cwd || connection.projectPath;
    log('read-file', { filePath, cwd });
    const result = await execCommand(conn, useSudo ? `sudo -n cat "${pathEsc}"` : `cat "${pathEsc}"`, cwd);
    if (result.code !== 0) {
      const out = `${result.stderr || ''}\n${result.stdout || ''}`;
      if (useSudo && sudoNeedsPassword(out)) {
        return { ok: false, error: sudoFilePermissionMessage('read') };
      }
      log('read-file failed', { filePath, code: result.code, stderr: result.stderr });
      return { ok: false, error: result.stderr || result.stdout || 'Failed to read file' };
    }
    const content = result.stdout || '';
    log('read-file ok', { filePath, contentLength: content.length, contentPreview: content.slice(0, 120) + (content.length > 120 ? '...' : '') });
    return { ok: true, content, error: undefined };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

function escapeSingleQuotes(s) {
  return s.replace(/'/g, "'\\''");
}

function sudoFilePermissionMessage(action) {
  return `Need elevated permissions to ${action} this file. Run one of these on the server: add this SSH user to a group with access, or allow passwordless sudo for this user.`;
}

ipcMain.handle('server:write-file', async (_, { connection, filePath, content, proxy, useSudo }) => {
  try {
    if (isDummy(connection)) {
      ensureDummyRoot();
      const resolved = resolveDummyPath(connection, filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf8');
      return { ok: true };
    }
    const pathEsc = escapeSingleQuotes(filePath);
    const conn = await getOrCreateConnection(connection, proxy);
    let result;
    if (content === '') {
      result = await execCommand(conn, useSudo ? `sudo -n touch '${pathEsc}'` : `touch '${pathEsc}'`, connection.cwd);
    } else {
      const b64 = Buffer.from(content, 'utf8').toString('base64');
      const delim = 'EOS' + Math.random().toString(36).slice(2);
      await execCommand(conn, `cat > /tmp/so-write.b64 << '${delim}'\n${b64}\n${delim}`, connection.cwd);
      if (useSudo) {
        result = await execCommand(conn, `base64 -d /tmp/so-write.b64 | sudo -n tee '${pathEsc}' > /dev/null && rm -f /tmp/so-write.b64`, connection.cwd);
      } else {
        result = await execCommand(conn, `base64 -d /tmp/so-write.b64 > '${pathEsc}' && rm -f /tmp/so-write.b64`, connection.cwd);
      }
    }
    const out = `${result.stderr || ''}\n${result.stdout || ''}`;
    if (useSudo && sudoNeedsPassword(out)) {
      await execCommand(conn, 'rm -f /tmp/so-write.b64', connection.cwd);
      return { ok: false, error: sudoFilePermissionMessage('write') };
    }
    return result.code === 0 ? { ok: true } : { ok: false, error: result.stderr || 'Write failed' };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('server:list-dir', async (_, { connection, dirPath, proxy }) => {
  try {
    if (isDummy(connection)) {
      return listDirDummy(connection, dirPath);
    }
    const conn = await getOrCreateConnection(connection, proxy);
    const result = await execCommand(conn, `ls -la "${(dirPath || '.').replace(/"/g, '\\"')}"`, connection.cwd);
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('server:mkdir', async (_, { connection, dirPath, proxy }) => {
  try {
    if (isDummy(connection)) {
      ensureDummyRoot();
      const resolved = resolveDummyPath(connection, dirPath);
      fs.mkdirSync(resolved, { recursive: true });
      return { ok: true };
    }
    const pathEsc = escapeSingleQuotes(dirPath);
    const conn = await getOrCreateConnection(connection, proxy);
    const result = await execCommand(conn, `mkdir -p '${pathEsc}'`, connection.cwd);
    return result.code === 0 ? { ok: true } : { ok: false, error: result.stderr || 'mkdir failed' };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('server:deletePath', async (_, { connection, filePath, proxy }) => {
  try {
    if (isDummy(connection)) {
      ensureDummyRoot();
      const resolved = resolveDummyPath(connection, filePath);
      if (fs.existsSync(resolved)) fs.rmSync(resolved, { recursive: true });
      return { ok: true };
    }
    const pathEsc = escapeSingleQuotes(filePath);
    const conn = await getOrCreateConnection(connection, proxy);
    const result = await execCommand(conn, `rm -rf '${pathEsc}'`, connection.cwd);
    return result.code === 0 ? { ok: true } : { ok: false, error: result.stderr || 'Delete failed' };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

function joinRemoteRelative(remoteDir, fileName) {
  const dir = (remoteDir || '.').trim().replace(/\/+$/, '') || '.';
  const base = String(fileName || '').replace(/^\/+/, '');
  if (!base) return null;
  return dir === '.' ? base : `${dir}/${base}`;
}

function openSftp(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(sftp);
    });
  });
}

function sftpFastPut(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function sftpRealpath(sftp, p) {
  return new Promise((resolve, reject) => {
    sftp.realpath(p, (err, absPath) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(absPath);
    });
  });
}

function sftpMkdir(sftp, p) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(p, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function ensureRemoteDirSftp(sftp, dirPath) {
  const normalized = path.posix.normalize(dirPath || '.');
  const parts = normalized.split('/').filter(Boolean);
  let current = normalized.startsWith('/') ? '/' : '';
  for (const part of parts) {
    current = current === '/' ? `/${part}` : (current ? `${current}/${part}` : part);
    try {
      await sftpMkdir(sftp, current);
    } catch (e) {
      const msg = errMsg(e);
      if (!/failure|exists|file already exists/i.test(msg)) throw e;
    }
  }
}

ipcMain.handle('server:upload-local-file', async (_, { connection, proxy, remoteDir }) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const picked = await dialog.showOpenDialog(win, {
      title: 'Upload file to server',
      properties: ['openFile'],
    });
    if (picked.canceled || !picked.filePaths?.[0]) {
      return { ok: true, canceled: true };
    }
    const localPath = picked.filePaths[0];
    const baseName = path.basename(localPath);
    const remoteFile = joinRemoteRelative(remoteDir, baseName);
    if (!remoteFile) {
      return { ok: false, error: 'Invalid destination path' };
    }
    if (isDummy(connection)) {
      ensureDummyRoot();
      const resolved = resolveDummyPath(connection, remoteFile);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.copyFileSync(localPath, resolved);
      return { ok: true, canceled: false, remotePath: remoteFile };
    }
    const conn = await getOrCreateConnection(connection, proxy);
    const cwd = connection.cwd || connection.projectPath;
    const sftp = await openSftp(conn);
    try {
      const base = cwd && String(cwd).trim() ? String(cwd).trim() : '.';
      const remoteTarget = remoteFile.startsWith('/')
        ? remoteFile
        : path.posix.join(base, remoteFile);
      const remoteAbs = await sftpRealpath(sftp, path.posix.dirname(remoteTarget))
        .then((absParent) => path.posix.join(absParent, path.posix.basename(remoteTarget)))
        .catch(async () => {
          const home = await sftpRealpath(sftp, '.').catch(() => '.');
          const candidate = remoteTarget.startsWith('/') ? remoteTarget : path.posix.join(home, remoteTarget);
          await ensureRemoteDirSftp(sftp, path.posix.dirname(candidate));
          return candidate;
        });
      await sftpFastPut(sftp, localPath, remoteAbs);
    } finally {
      try { sftp.end(); } catch (_) {}
    }
    return { ok: true, canceled: false, remotePath: remoteFile };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('server:download-remote-file', async (_, { connection, proxy, remoteFilePath }) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const suggested =
      String(remoteFilePath || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean)
        .pop() || 'download';
    const save = await dialog.showSaveDialog(win, {
      title: 'Save file from server',
      defaultPath: suggested,
    });
    if (save.canceled || !save.filePath) {
      return { ok: true, canceled: true };
    }
    const localOut = save.filePath;
    if (isDummy(connection)) {
      ensureDummyRoot();
      const resolved = resolveDummyPath(connection, remoteFilePath);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        return { ok: false, error: 'Remote file not found' };
      }
      fs.copyFileSync(resolved, localOut);
      return { ok: true, canceled: false, savedTo: localOut };
    }
    const pathEsc = escapeSingleQuotes(remoteFilePath);
    const conn = await getOrCreateConnection(connection, proxy);
    const cwd = connection.cwd || connection.projectPath;
    const result = await execCommand(conn, `base64 < '${pathEsc}' | tr -d '\n'`, cwd);
    if (result.code !== 0) {
      return { ok: false, error: result.stderr || result.stdout || 'Could not read remote file' };
    }
    const raw = (result.stdout || '').replace(/\s+/g, '');
    let buf;
    try {
      buf = Buffer.from(raw, 'base64');
    } catch {
      return { ok: false, error: 'Invalid data from server' };
    }
    fs.writeFileSync(localOut, buf);
    return { ok: true, canceled: false, savedTo: localOut };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

function execCommandStreamRaw(conn, command, cwd, onData) {
  return new Promise((resolve) => {
    const fullCmd = cwd ? `cd "${String(cwd).replace(/"/g, '\\"')}" && ${command}` : command;
    conn.exec(fullCmd, (err, stream) => {
      if (err) {
        onData(`Error: ${err.message}\r\n`);
        resolve({ code: 1, output: err.message });
        return;
      }
      let output = '';
      stream.on('data', (data) => {
        const str = data.toString();
        output += str;
        onData(str);
      });
      stream.stderr.on('data', (data) => {
        const str = data.toString();
        output += str;
        onData(str);
      });
      stream.on('close', (code) => {
        resolve({ code: code ?? 0, output });
      });
    });
  });
}

function execCommandStream(conn, command, cwd, onData) {
  const key = findPoolKey(conn);
  if (!key) {
    return execCommandStreamRaw(conn, command, cwd, onData);
  }

  let currentQueue = connectionQueues.get(key) || Promise.resolve();

  const nextQueue = currentQueue.then(() => {
    return execCommandStreamRaw(conn, command, cwd, onData);
  }).catch((err) => {
    return Promise.reject(err);
  });

  connectionQueues.set(key, nextQueue.catch(() => {}));

  return nextQueue;
}

function execLocalCommandStream(command, cwd, onData) {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-c', command];
    
    const proc = spawn(shell, args, { cwd, shell: true });
    let output = '';
    
    proc.stdout.on('data', (data) => {
      const str = data.toString();
      output += str;
      onData(str);
    });
    
    proc.stderr.on('data', (data) => {
      const str = data.toString();
      output += str;
      onData(str);
    });
    
    proc.on('close', (code) => {
      resolve({ code: code ?? 0, output });
    });
    
    proc.on('error', (err) => {
      onData(`Local execute error: ${err.message}\r\n`);
      resolve({ code: 1, output: err.message });
    });
  });
}

log('ipc handlers registered', { deletePath: true, uploadLocalFile: true, downloadRemoteFile: true });

ipcMain.handle('server:deploy', async (_, { connection, deployCommand, proxy, cwd }) => {
  try {
    if (isDummy(connection)) {
      ensureDummyRoot();
      const root = getDummyRoot();
      const workDir = cwd && cwd.trim() && cwd !== '.' ? path.join(root, cwd.replace(/^dummy-root\/?/, '')) : root;
      try {
        const out = execSync(deployCommand, { cwd: workDir, encoding: 'utf8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
        return { ok: true, stdout: out || '', stderr: '', code: 0 };
      } catch (e) {
        return { ok: false, stdout: e.stdout || '', stderr: e.stderr || errMsg(e), code: e.status ?? 1 };
      }
    }
    const conn = await getOrCreateConnection(connection, proxy);
    const workDir = cwd && cwd.trim() ? cwd : (connection.cwd || connection.projectPath);
    const result = await execDockerAwareCommand(conn, deployCommand, workDir, connection, proxy);
    return { ok: true, stdout: result.stdout, stderr: result.stderr, code: result.code };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('server:run-deploy-pipeline', async (_, { connection, shellId, projectDir, branch, depType, migType, restartType, serviceName, proxy }) => {
  const serverId = connection.id;
  const serverName = connection.name;
  
  const cmds = [];
  cmds.push(`echo "🚀 Starting Git-based deployment pipeline..."`);
  cmds.push(`git pull origin "${branch || 'main'}"`);
  
  if (depType === 'auto') {
    cmds.push(`if [ -f package.json ]; then echo "↳ Found package.json. Running npm install..." && npm install; elif [ -f requirements.txt ]; then echo "↳ Found requirements.txt. Running pip install..." && pip install -r requirements.txt; else echo "↳ No package.json or requirements.txt found. Skipping dependencies."; fi`);
  } else if (depType === 'npm') {
    cmds.push(`npm install`);
  } else if (depType === 'pip') {
    cmds.push(`pip install -r requirements.txt`);
  }
  
  if (migType === 'auto') {
    cmds.push(`if [ -f package.json ] && grep -q '"migrate"' package.json; then echo "↳ Found 'migrate' script. Running npm run migrate..." && npm run migrate; elif [ -f manage.py ]; then echo "↳ Found manage.py. Running python manage.py migrate..." && python manage.py migrate; else echo "↳ No migration scripts detected."; fi`);
  } else if (migType === 'npm') {
    cmds.push(`npm run migrate`);
  } else if (migType === 'pip') {
    cmds.push(`python manage.py migrate`);
  }
  
  if (restartType === 'pm2') {
    cmds.push(`pm2 restart "${serviceName || 'app'}"`);
  } else if (restartType === 'systemd') {
    cmds.push(`sudo systemctl restart "${serviceName || 'app'}" || systemctl restart "${serviceName || 'app'}"`);
  }
  
  const fullCommand = cmds.join(' && ');
  const timestamp = new Date().toISOString();
  
  const onData = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shell-output', { shellId, data: data.replace(/\r?\n/g, '\r\n') });
    }
  };
  
  try {
    let result;
    let workDir = projectDir;
    
    if (isDummy(connection)) {
      ensureDummyRoot();
      const root = getDummyRoot();
      workDir = projectDir && projectDir.trim() && projectDir !== '.' ? path.join(root, projectDir.replace(/^dummy-root\/?/, '')) : root;
      result = await execLocalCommandStream(fullCommand, workDir, onData);
    } else {
      const conn = await getOrCreateConnection(connection, proxy);
      result = await execCommandStream(conn, fullCommand, projectDir, onData);
    }
    
    let commitHash = '';
    const status = result.code === 0 ? 'success' : 'failure';
    
    if (result.code === 0) {
      try {
        let gitRes;
        if (isDummy(connection)) {
          gitRes = await execLocalCommandStream('git rev-parse HEAD', workDir, () => {});
        } else {
          const conn = await getOrCreateConnection(connection, proxy);
          gitRes = await execCommandStream(conn, 'git rev-parse HEAD', projectDir, () => {});
        }
        commitHash = gitRes.output.trim();
      } catch (e) {
        log('Error getting git commit hash', { error: String(e) });
      }
    }
    
    db.run(`
      INSERT INTO deployment_history (serverId, serverName, projectDir, branch, commitHash, triggeredCommand, status, output, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [serverId, serverName, projectDir, branch, commitHash, fullCommand, status, result.output, timestamp], (err) => {
      if (err) {
        log('SQLite save deployment_history error', { error: err.message });
      }
    });
    
    if (result.code === 0) {
      onData(`\r\n✨ Deployment completed successfully! Commit: ${commitHash || 'Unknown'}\r\n`);
      return { ok: true, commitHash, output: result.output };
    } else {
      onData(`\r\n❌ Deployment failed with exit code ${result.code}.\r\n`);
      return { ok: false, error: `Command chain exited with code ${result.code}`, output: result.output };
    }
  } catch (e) {
    onData(`\r\n❌ Deployment exception: ${errMsg(e)}\r\n`);
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('server:rollback-deploy', async (_, { connection, shellId, projectDir, commitHash, restartType, serviceName, proxy }) => {
  const serverId = connection.id;
  const serverName = connection.name;
  
  const cmds = [];
  cmds.push(`echo "🔄 Starting rollback process..."`);
  cmds.push(`git checkout "${commitHash}"`);
  
  if (restartType === 'pm2') {
    cmds.push(`pm2 restart "${serviceName || 'app'}"`);
  } else if (restartType === 'systemd') {
    cmds.push(`sudo systemctl restart "${serviceName || 'app'}" || systemctl restart "${serviceName || 'app'}"`);
  }
  
  const fullCommand = cmds.join(' && ');
  const timestamp = new Date().toISOString();
  
  const onData = (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shell-output', { shellId, data: data.replace(/\r?\n/g, '\r\n') });
    }
  };
  
  try {
    let result;
    let workDir = projectDir;
    
    if (isDummy(connection)) {
      ensureDummyRoot();
      const root = getDummyRoot();
      workDir = projectDir && projectDir.trim() && projectDir !== '.' ? path.join(root, projectDir.replace(/^dummy-root\/?/, '')) : root;
      result = await execLocalCommandStream(fullCommand, workDir, onData);
    } else {
      const conn = await getOrCreateConnection(connection, proxy);
      result = await execCommandStream(conn, fullCommand, projectDir, onData);
    }
    
    const status = result.code === 0 ? 'success' : 'failure';
    const triggeredCommand = `Rollback to ${commitHash}`;
    
    db.run(`
      INSERT INTO deployment_history (serverId, serverName, projectDir, branch, commitHash, triggeredCommand, status, output, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [serverId, serverName, projectDir, 'rollback', commitHash, triggeredCommand, status, result.output, timestamp], (err) => {
      if (err) {
        log('SQLite save deployment_history rollback error', { error: err.message });
      }
    });
    
    if (result.code === 0) {
      onData(`\r\n✨ Rollback successful! Switched to commit: ${commitHash}\r\n`);
      return { ok: true };
    } else {
      onData(`\r\n❌ Rollback failed with exit code ${result.code}.\r\n`);
      return { ok: false, error: `Rollback command exited with code ${result.code}` };
    }
  } catch (e) {
    onData(`\r\n❌ Rollback exception: ${errMsg(e)}\r\n`);
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('server:get-deploy-history', async (_, { serverId, projectDir }) => {
  return new Promise((resolve) => {
    db.all(`
      SELECT * FROM deployment_history 
      WHERE serverId = ? AND projectDir = ? 
      ORDER BY id DESC 
      LIMIT 100
    `, [serverId, projectDir], (err, rows) => {
      if (err) {
        log('SQLite select deployment_history error', { error: err.message });
        resolve([]);
      } else {
        resolve(rows || []);
      }
    });
  });
});

ipcMain.handle('snippets:get', async () => {
  return new Promise((resolve) => {
    if (!db) {
      resolve([]);
      return;
    }
    db.all('SELECT * FROM terminal_snippets ORDER BY title ASC', (err, rows) => {
      if (err) {
        log('SQLite select terminal_snippets error', { error: err.message });
        resolve([]);
      } else {
        resolve(rows || []);
      }
    });
  });
});

ipcMain.handle('snippets:save', async (_, { id, title, description, command }) => {
  const timestamp = new Date().toISOString();
  return new Promise((resolve) => {
    if (!db) {
      resolve({ ok: false, error: 'Database not initialized' });
      return;
    }
    if (id) {
      db.run(
        'UPDATE terminal_snippets SET title = ?, description = ?, command = ?, timestamp = ? WHERE id = ?',
        [title, description, command, timestamp, id],
        function (err) {
          if (err) {
            log('SQLite update snippet error', { error: err.message });
            resolve({ ok: false, error: err.message });
          } else {
            resolve({ ok: true, id });
          }
        }
      );
    } else {
      db.run(
        'INSERT INTO terminal_snippets (title, description, command, timestamp) VALUES (?, ?, ?, ?)',
        [title, description, command, timestamp],
        function (err) {
          if (err) {
            log('SQLite insert snippet error', { error: err.message });
            resolve({ ok: false, error: err.message });
          } else {
            resolve({ ok: true, id: this.lastID });
          }
        }
      );
    }
  });
});

ipcMain.handle('snippets:delete', async (_, { id }) => {
  return new Promise((resolve) => {
    if (!db) {
      resolve({ ok: false, error: 'Database not initialized' });
      return;
    }
    db.run('DELETE FROM terminal_snippets WHERE id = ?', [id], function (err) {
      if (err) {
        log('SQLite delete snippet error', { error: err.message });
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true });
      }
    });
  });
});

ipcMain.handle('app:open-devtools', async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.openDevTools();
      return { ok: true };
    }
    return { ok: false, error: 'Main window is not available' };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('app:get-log-file-path', async () => {
  try {
    return getLogPath();
  } catch (e) {
    return '';
  }
});

ipcMain.handle('app:read-log-file', async () => {
  try {
    const logPath = getLogPath();
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      const maxSize = 256 * 1024; // 256KB limit to keep it fast
      if (stats.size > maxSize) {
        const fd = fs.openSync(logPath, 'r');
        const buffer = Buffer.alloc(maxSize);
        fs.readSync(fd, buffer, 0, maxSize, stats.size - maxSize);
        fs.closeSync(fd);
        return { ok: true, content: '... [Truncated due to size, showing last 256KB] ...\n' + buffer.toString('utf8') };
      }
      return { ok: true, content: fs.readFileSync(logPath, 'utf8') };
    }
    return { ok: true, content: 'No log file found.' };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

ipcMain.handle('app:clear-log-file', async () => {
  try {
    const logPath = getLogPath();
    fs.writeFileSync(logPath, '', 'utf8');
    log('Log file cleared');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
});

// ── Alerting System IPC Handlers ─────────────────────────────────────
ipcMain.handle('alerts:save', async (_, alert) => {
  return new Promise((resolve) => {
    if (!db) {
      resolve({ ok: false, error: 'Database not initialized' });
      return;
    }
    const stmt = db.prepare(`
      INSERT INTO alerts (serverId, serverName, metricType, metricValue, thresholdValue, message, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      alert.serverId,
      alert.serverName,
      alert.metricType,
      alert.metricValue,
      alert.thresholdValue,
      alert.message,
      alert.timestamp || new Date().toISOString(),
      function(err) {
        if (err) {
          log('SQLite save error', { error: err.message });
          resolve({ ok: false, error: err.message });
        } else {
          resolve({ ok: true, id: this.lastID });
        }
      }
    );
    stmt.finalize();
  });
});

ipcMain.handle('alerts:get-history', async (_, { serverId }) => {
  return new Promise((resolve) => {
    if (!db) {
      resolve([]);
      return;
    }
    let sql = 'SELECT * FROM alerts';
    const params = [];
    if (serverId) {
      sql += ' WHERE serverId = ?';
      params.push(serverId);
    }
    sql += ' ORDER BY id DESC LIMIT 200';
    db.all(sql, params, (err, rows) => {
      if (err) {
        log('SQLite get error', { error: err.message });
        resolve([]);
      } else {
        resolve(rows || []);
      }
    });
  });
});

ipcMain.handle('alerts:clear-history', async (_, { serverId }) => {
  return new Promise((resolve) => {
    if (!db) {
      resolve({ ok: false, error: 'Database not initialized' });
      return;
    }
    let sql = 'DELETE FROM alerts';
    const params = [];
    if (serverId) {
      sql += ' WHERE serverId = ?';
      params.push(serverId);
    }
    db.run(sql, params, (err) => {
      if (err) {
        log('SQLite delete error', { error: err.message });
        resolve({ ok: false, error: err.message });
      } else {
        resolve({ ok: true });
      }
    });
  });
});

ipcMain.handle('alerts:trigger-notification', (_, { title, body }) => {
  const { Notification } = require('electron');
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
      return { ok: true };
    }
    return { ok: false, error: 'Notifications not supported' };
  } catch (e) {
    log('Notification error', { error: String(e) });
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('alerts:send-webhook', async (_, { url, payload }) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return { ok: response.ok, status: response.status };
  } catch (e) {
    log('Webhook error', { error: String(e) });
    return { ok: false, error: String(e) };
  }
});

// ── Uptime Monitoring System IPC Handlers (Disabled) ────────────────
ipcMain.handle('monitoring:set-servers', () => {
  return { ok: true };
});

ipcMain.handle('monitoring:get-statuses', () => {
  return [];
});

ipcMain.handle('metrics:get-history', async () => {
  return [];
});

ipcMain.handle('metrics:clear-history', async () => {
  return { ok: true };
});

// ----- Database Tunneling and Queries Handling -----
const activeDbConnections = new Map(); // serverId -> { tunnelServer, dbClient, dbType, localPort, databaseName }
const net = require('net');

function createTunnel(sshConn, remoteHost, remotePort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      sshConn.forwardOut(
        '127.0.0.1', 
        server.address().port, 
        remoteHost, 
        remotePort, 
        (err, stream) => {
          if (err) {
            log('Tunnel forwarding error', { error: err.message });
            socket.destroy();
            return;
          }
          socket.pipe(stream).pipe(socket);
          
          socket.on('error', (e) => {
            log('Tunnel socket error', { error: e.message });
            stream.destroy();
          });
          stream.on('error', (e) => {
            log('Tunnel stream error', { error: e.message });
            socket.destroy();
          });
        }
      );
    });

    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });

    server.on('error', (err) => {
      reject(err);
    });
  });
}

async function closeDbConnection(serverId) {
  const connInfo = activeDbConnections.get(serverId);
  if (!connInfo) return;

  log('Closing database connection and tunnel', { serverId, dbType: connInfo.dbType });
  
  try {
    if (connInfo.dbClient) {
      if (connInfo.dbType === 'mysql') {
        await connInfo.dbClient.end();
      } else if (connInfo.dbType === 'postgres') {
        await connInfo.dbClient.end();
      } else if (connInfo.dbType === 'redis') {
        connInfo.dbClient.disconnect();
      }
    }
  } catch (e) {
    log('Error closing DB client', { serverId, error: e.message });
  }

  try {
    if (connInfo.tunnelServer) {
      await new Promise((resolve) => {
        connInfo.tunnelServer.close(() => resolve());
      });
    }
  } catch (e) {
    log('Error closing tunnel TCP server', { serverId, error: e.message });
  }

  activeDbConnections.delete(serverId);
}

ipcMain.handle('database:connect', async (_, { connection, proxy, dbType, config }) => {
  const serverId = connection.id;
  await closeDbConnection(serverId);

  try {
    const sshConn = await getOrCreateConnection(connection, proxy);
    const remoteHost = config.host || '127.0.0.1';
    let defaultPort = 3306;
    if (dbType === 'postgres') defaultPort = 5432;
    else if (dbType === 'redis') defaultPort = 6379;
    const remotePort = Number(config.port) || defaultPort;

    const tunnelServer = await createTunnel(sshConn, remoteHost, remotePort);
    const localPort = tunnelServer.address().port;

    let dbClient = null;
    
    if (dbType === 'mysql') {
      const mysql = require('mysql2/promise');
      dbClient = await mysql.createConnection({
        host: '127.0.0.1',
        port: localPort,
        user: config.username,
        password: config.password,
        database: config.database,
        connectTimeout: 10000,
      });
      await dbClient.query('SELECT 1');
      
    } else if (dbType === 'postgres') {
      const { Client: PgClient } = require('pg');
      dbClient = new PgClient({
        host: '127.0.0.1',
        port: localPort,
        user: config.username,
        password: config.password,
        database: config.database,
        connectionTimeoutMillis: 10000,
      });
      await dbClient.connect();
      await dbClient.query('SELECT 1');
      
    } else if (dbType === 'redis') {
      const Redis = require('ioredis');
      dbClient = new Redis({
        host: '127.0.0.1',
        port: localPort,
        password: config.password || undefined,
        db: Number(config.database) || 0,
        connectTimeout: 10000,
        lazyConnect: true,
      });
      await dbClient.connect();
      await dbClient.ping();
    } else {
      throw new Error(`Unsupported database type: ${dbType}`);
    }

    activeDbConnections.set(serverId, {
      tunnelServer,
      dbClient,
      dbType,
      localPort,
      databaseName: config.database || (dbType === 'redis' ? '0' : 'database'),
    });

    log('Database connection and tunnel established', { serverId, dbType, localPort });
    return { ok: true, localPort };

  } catch (err) {
    log('Database connection failed', { serverId, error: err.message });
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('database:disconnect', async (_, { serverId }) => {
  await closeDbConnection(serverId);
  return { ok: true };
});

ipcMain.handle('database:query', async (_, { serverId, query }) => {
  const connInfo = activeDbConnections.get(serverId);
  if (!connInfo || !connInfo.dbClient) {
    return { ok: false, error: 'No active database connection' };
  }

  try {
    const { dbClient, dbType } = connInfo;
    
    if (dbType === 'mysql') {
      const [rows] = await dbClient.query(query);
      return { ok: true, result: rows };
      
    } else if (dbType === 'postgres') {
      const res = await dbClient.query(query);
      return { ok: true, result: res.rows };
      
    } else if (dbType === 'redis') {
      const parts = query.trim().split(/\s+/);
      const cmd = parts[0];
      const args = parts.slice(1);
      const res = await dbClient.call(cmd, ...args);
      return { ok: true, result: res };
    }
    
    return { ok: false, error: `Unknown database type: ${dbType}` };
  } catch (err) {
    log('Database query execution error', { serverId, error: err.message });
    return { ok: false, error: err.message || String(err) };
  }
});

ipcMain.handle('database:get-schema', async (_, { serverId }) => {
  const connInfo = activeDbConnections.get(serverId);
  if (!connInfo || !connInfo.dbClient) {
    return { ok: false, error: 'No active database connection' };
  }

  try {
    const { dbClient, dbType } = connInfo;
    
    if (dbType === 'mysql') {
      const [tablesRows] = await dbClient.query('SHOW TABLES');
      const tables = tablesRows.map(row => Object.values(row)[0]);
      return { ok: true, tables };
      
    } else if (dbType === 'postgres') {
      const res = await dbClient.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
      `);
      const tables = res.rows.map(row => row.table_name);
      return { ok: true, tables };
      
    } else if (dbType === 'redis') {
      const keys = await dbClient.call('KEYS', '*');
      return { ok: true, keys: keys || [] };
    }
    
    return { ok: false, error: `Unknown database type: ${dbType}` };
  } catch (err) {
    log('Database schema fetch error', { serverId, error: err.message });
    return { ok: false, error: err.message || String(err) };
  }
});

function sqlComment(text) {
  return `-- ${String(text).replace(/\r?\n/g, ' ')}\n`;
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function mysqlIdent(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function pgIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlValue(value, dialect) {
  if (value === null || value === undefined) return 'NULL';
  if (Buffer.isBuffer(value)) {
    const hex = value.toString('hex');
    return dialect === 'postgres' ? `decode('${hex}', 'hex')` : `X'${hex}'`;
  }
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'boolean') return dialect === 'postgres' ? (value ? 'TRUE' : 'FALSE') : (value ? '1' : '0');
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

async function mysqlTables(dbClient) {
  const [rows] = await dbClient.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
  return rows.map((row) => Object.values(row)[0]).filter(Boolean);
}

async function exportMysqlSchema(dbClient, tables) {
  const chunks = [];
  for (const table of tables) {
    const [rows] = await dbClient.query(`SHOW CREATE TABLE ${mysqlIdent(table)}`);
    const createSql = rows?.[0]?.['Create Table'];
    if (createSql) chunks.push(`${createSql};\n`);
  }
  return chunks.join('\n');
}

async function exportMysqlData(dbClient, tables) {
  const chunks = [];
  for (const table of tables) {
    const [rows] = await dbClient.query(`SELECT * FROM ${mysqlIdent(table)}`);
    chunks.push(sqlComment(`Data for ${table}`));
    if (!rows.length) {
      chunks.push('\n');
      continue;
    }
    for (const row of rows) {
      const columns = Object.keys(row);
      const names = columns.map(mysqlIdent).join(', ');
      const values = columns.map((column) => sqlValue(row[column], 'mysql')).join(', ');
      chunks.push(`INSERT INTO ${mysqlIdent(table)} (${names}) VALUES (${values});\n`);
    }
    chunks.push('\n');
  }
  return chunks.join('');
}

async function pgTables(dbClient) {
  const res = await dbClient.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  return res.rows.map((row) => row.table_name);
}

async function exportPostgresSchema(dbClient, tables) {
  const chunks = [];
  for (const table of tables) {
    const columns = await dbClient.query(`
      SELECT
        a.attname AS column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
        a.attnotnull AS not_null,
        pg_get_expr(d.adbin, d.adrelid) AS column_default
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = 'public'
        AND c.relname = $1
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum;
    `, [table]);

    const columnDefs = columns.rows.map((column) => {
      const parts = [`  ${pgIdent(column.column_name)}`, column.data_type];
      if (column.column_default) parts.push(`DEFAULT ${column.column_default}`);
      if (column.not_null) parts.push('NOT NULL');
      return parts.join(' ');
    });

    chunks.push(`CREATE TABLE ${pgIdent('public')}.${pgIdent(table)} (\n${columnDefs.join(',\n')}\n);\n`);

    const constraints = await dbClient.query(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_catalog.pg_constraint
      WHERE conrelid = (
        SELECT c.oid
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = $1
      )
      ORDER BY conname;
    `, [table]);

    for (const constraint of constraints.rows) {
      chunks.push(`ALTER TABLE ONLY ${pgIdent('public')}.${pgIdent(table)} ADD CONSTRAINT ${pgIdent(constraint.conname)} ${constraint.definition};\n`);
    }

    const indexes = await dbClient.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
        AND indexname NOT IN (
          SELECT conname
          FROM pg_catalog.pg_constraint
          WHERE conrelid = (
            SELECT c.oid
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = $2
          )
        )
      ORDER BY indexname;
    `, [table, table]);

    for (const index of indexes.rows) {
      chunks.push(`${index.indexdef};\n`);
    }

    chunks.push('\n');
  }
  return chunks.join('');
}

async function exportPostgresData(dbClient, tables) {
  const chunks = [];
  for (const table of tables) {
    const res = await dbClient.query(`SELECT * FROM ${pgIdent('public')}.${pgIdent(table)}`);
    chunks.push(sqlComment(`Data for public.${table}`));
    if (!res.rows.length) {
      chunks.push('\n');
      continue;
    }
    for (const row of res.rows) {
      const columns = Object.keys(row);
      const names = columns.map(pgIdent).join(', ');
      const values = columns.map((column) => sqlValue(row[column], 'postgres')).join(', ');
      chunks.push(`INSERT INTO ${pgIdent('public')}.${pgIdent(table)} (${names}) VALUES (${values});\n`);
    }
    chunks.push('\n');
  }
  return chunks.join('');
}

ipcMain.handle('database:export-sql', async (_, { serverId, mode }) => {
  const connInfo = activeDbConnections.get(serverId);
  if (!connInfo || !connInfo.dbClient) {
    return { ok: false, error: 'No active database connection' };
  }

  try {
    const { dbClient, dbType, databaseName } = connInfo;
    if (dbType === 'redis') {
      return { ok: false, error: 'Redis does not support .sql schema or data exports.' };
    }
    if (mode !== 'schema' && mode !== 'data' && mode !== 'full') {
      return { ok: false, error: 'Unknown export mode' };
    }

    const tables = dbType === 'mysql' ? await mysqlTables(dbClient) : await pgTables(dbClient);
    const header = [
      sqlComment(`Server Operator ${mode} export`),
      sqlComment(`Database: ${databaseName || 'database'}`),
      sqlComment(`Engine: ${dbType}`),
      sqlComment(`Generated: ${new Date().toISOString()}`),
      '\n',
    ].join('');

    let body = '';
    if (dbType === 'mysql') {
      if (mode === 'schema') {
        body = await exportMysqlSchema(dbClient, tables);
      } else if (mode === 'data') {
        body = await exportMysqlData(dbClient, tables);
      } else {
        body = [
          await exportMysqlSchema(dbClient, tables),
          '\n',
          sqlComment('Data export'),
          await exportMysqlData(dbClient, tables),
        ].join('');
      }
    } else if (dbType === 'postgres') {
      if (mode === 'schema') {
        body = await exportPostgresSchema(dbClient, tables);
      } else if (mode === 'data') {
        body = await exportPostgresData(dbClient, tables);
      } else {
        body = [
          await exportPostgresSchema(dbClient, tables),
          '\n',
          sqlComment('Data export'),
          await exportPostgresData(dbClient, tables),
        ].join('');
      }
    }

    const safeDbName = String(databaseName || 'database').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'database';
    return {
      ok: true,
      sql: header + body,
      filename: `${safeDbName}-${mode}-${timestampForFilename()}.sql`,
    };
  } catch (err) {
    log('Database SQL export error', { serverId, error: err.message });
    return { ok: false, error: err.message || String(err) };
  }
});

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let single = false;
  let double = false;
  let backtick = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      current += ch;
      if (ch === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i++;
        blockComment = false;
      }
      continue;
    }

    if (dollarTag) {
      current += ch;
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag.slice(1);
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (!single && !double && !backtick) {
      if (ch === '-' && next === '-') {
        current += ch + next;
        i++;
        lineComment = true;
        continue;
      }
      if (ch === '/' && next === '*') {
        current += ch + next;
        i++;
        blockComment = true;
        continue;
      }
      if (ch === '$') {
        const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
        if (match) {
          dollarTag = match[0];
          current += dollarTag;
          i += dollarTag.length - 1;
          continue;
        }
      }
    }

    if (ch === "'" && !double && !backtick) {
      current += ch;
      if (single && next === "'") {
        current += next;
        i++;
      } else {
        single = !single;
      }
      continue;
    }

    if (ch === '"' && !single && !backtick) {
      current += ch;
      if (double && next === '"') {
        current += next;
        i++;
      } else {
        double = !double;
      }
      continue;
    }

    if (ch === '`' && !single && !double) {
      current += ch;
      backtick = !backtick;
      continue;
    }

    if (ch === ';' && !single && !double && !backtick) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

function isSqlImportNoop(statement) {
  const compact = statement
    .replace(/--[^\n]*(?:\n|$)/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
  return !compact;
}

ipcMain.handle('database:import-sql', async (_, { serverId, sql }) => {
  const connInfo = activeDbConnections.get(serverId);
  if (!connInfo || !connInfo.dbClient) {
    return { ok: false, error: 'No active database connection' };
  }

  try {
    const { dbClient, dbType } = connInfo;
    if (dbType === 'redis') {
      return { ok: false, error: 'Redis does not support .sql imports.' };
    }

    const statements = splitSqlStatements(String(sql || '')).filter((statement) => !isSqlImportNoop(statement));
    if (!statements.length) {
      return { ok: false, error: 'No SQL statements found in the selected file.' };
    }

    let executed = 0;
    if (dbType === 'postgres') await dbClient.query('BEGIN');
    try {
      for (const statement of statements) {
        if (dbType === 'mysql') {
          await dbClient.query(statement);
        } else if (dbType === 'postgres') {
          await dbClient.query(statement);
        }
        executed++;
      }
      if (dbType === 'postgres') await dbClient.query('COMMIT');
    } catch (err) {
      if (dbType === 'postgres') {
        try { await dbClient.query('ROLLBACK'); } catch (_) {}
      }
      throw err;
    }

    return { ok: true, statements: executed };
  } catch (err) {
    log('Database SQL import error', { serverId, error: err.message });
    return { ok: false, error: err.message || String(err) };
  }
});

function getFeaturesConfigPath() {
  try {
    return path.join(app.getPath('userData'), 'features.json');
  } catch (_) {
    return path.join(process.cwd(), 'features.json');
  }
}

ipcMain.handle('features:load', async () => {
  try {
    const p = getFeaturesConfigPath();
    if (fs.existsSync(p)) {
      const data = fs.readFileSync(p, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    log('Failed to load features config', { error: String(e) });
  }
  return null;
});

ipcMain.handle('features:save', async (_, config) => {
  try {
    const p = getFeaturesConfigPath();
    fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf8');
    log('Saved features config');
    return { ok: true };
  } catch (e) {
    log('Failed to save features config', { error: String(e) });
    return { ok: false, error: String(e) };
  }
});

// Window control handlers
ipcMain.handle('window:minimize', async () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.handle('window:maximize', async () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});
ipcMain.handle('window:close', async () => {
  if (mainWindow) mainWindow.close();
});
ipcMain.handle('window:isMaximized', async () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ── Cloudinary Backup/Restore IPC Handlers ──────────────────────────
function getCloudinaryConfigPath() {
  try {
    return path.join(app.getPath('userData'), 'cloudinary-config.json');
  } catch (_) {
    return path.join(process.cwd(), 'cloudinary-config.json');
  }
}

function loadCloudinaryConfig() {
  try {
    const p = getCloudinaryConfigPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {
    log('Failed to load Cloudinary config', { error: String(e) });
  }
  return null;
}

function getCloudinary() {
  const config = loadCloudinaryConfig();
  if (!config || !config.cloudName || !config.apiKey || !config.apiSecret) {
    return null;
  }
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  });
  return cloudinary;
}

ipcMain.handle('cloudinary:save-config', async (_, config) => {
  try {
    const p = getCloudinaryConfigPath();
    fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf8');
    log('Cloudinary config saved');
    return { ok: true };
  } catch (e) {
    log('Failed to save Cloudinary config', { error: String(e) });
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('cloudinary:load-config', async () => {
  try {
    const config = loadCloudinaryConfig();
    if (config) {
      return { ok: true, config: { cloudName: config.cloudName, apiKey: config.apiKey, apiSecret: '••••••' } };
    }
    return { ok: false, error: 'No Cloudinary config found' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('cloudinary:upload-backup', async (_, { sql, filename, serverName, dbType, dbName }) => {
  try {
    const cloudinary = getCloudinary();
    if (!cloudinary) {
      return { ok: false, error: 'Cloudinary not configured. Set your Cloudinary credentials in Settings.' };
    }
    const safeName = (serverName || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const publicId = `server-operator-backups/${safeName}/backup_${dateStr}`;
    const result = await cloudinary.uploader.upload(`data:text/plain;base64,${Buffer.from(sql, 'utf8').toString('base64')}`, {
      public_id: publicId,
      resource_type: 'raw',
      tags: 'server-operator-backup',
      context: `server=${serverName || ''}|dbType=${dbType || ''}|dbName=${dbName || ''}|filename=${filename || ''}`,
      use_filename: true,
      unique_filename: false,
      overwrite: true,
    });
    log('Cloudinary backup uploaded', { publicId: result.public_id, url: result.secure_url });
    return { ok: true, publicId: result.public_id, url: result.secure_url };
  } catch (e) {
    log('Cloudinary upload error', { error: String(e) });
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('cloudinary:list-backups', async () => {
  try {
    const cloudinary = getCloudinary();
    if (!cloudinary) {
      return { ok: false, error: 'Cloudinary not configured.' };
    }
    const result = await cloudinary.search
      .expression('tags:server-operator-backup AND resource_type:raw')
      .sort_by('created_at', 'desc')
      .max_results(100)
      .execute();
    const backups = (result.resources || []).map((r) => {
      const ctx = r.context?.custom || '';
      const ctxMap = {};
      ctx.split('|').forEach((pair) => {
        const [k, v] = pair.split('=');
        if (k && v) ctxMap[k] = v;
      });
      return {
        publicId: r.public_id,
        filename: ctxMap.filename || r.filename || r.public_id.split('/').pop() || 'backup.sql',
        createdAt: r.created_at,
        size: r.bytes,
        serverName: ctxMap.server || '',
        dbType: ctxMap.dbType || '',
        dbName: ctxMap.dbName || '',
      };
    });
    return { ok: true, backups };
  } catch (e) {
    log('Cloudinary list error', { error: String(e) });
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('cloudinary:download-backup', async (_, { publicId }) => {
  try {
    const cloudinary = getCloudinary();
    if (!cloudinary) {
      return { ok: false, error: 'Cloudinary not configured.' };
    }
    const result = await cloudinary.api.resource(publicId, { resource_type: 'raw' });
    const url = result.secure_url;
    const response = await fetch(url);
    const sql = await response.text();
    return { ok: true, sql };
  } catch (e) {
    log('Cloudinary download error', { error: String(e) });
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('cloudinary:delete-backup', async (_, { publicId }) => {
  try {
    const cloudinary = getCloudinary();
    if (!cloudinary) {
      return { ok: false, error: 'Cloudinary not configured.' };
    }
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    return { ok: true };
  } catch (e) {
    log('Cloudinary delete error', { error: String(e) });
    return { ok: false, error: String(e.message || e) };
  }
});

app.on('will-quit', async () => {
  for (const id of activeDbConnections.keys()) {
    await closeDbConnection(id);
  }
});
