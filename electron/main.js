const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
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

function getLinuxIconPath() {
  if (process.platform !== 'linux') return null;
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
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const linuxIconPath = getLinuxIconPath();
  // titleBarStyle 'hiddenInset' is macOS-only; on Linux it can cause crash or broken window
  const windowOpts = {
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: linuxIconPath || undefined,
    show: false,
  };
  if (process.platform === 'darwin') {
    windowOpts.titleBarStyle = 'hiddenInset';
  }
  mainWindow = new BrowserWindow(windowOpts);

  // Set Chrome user agent before load to improve chance of Web Speech API (mic) working
  mainWindow.webContents.setUserAgent(CHROME_UA);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  log('started', { logFile: getLogPath() });
  installApplicationMenu();
  createWindow();
  registerShellHandlers();
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
    const usePassword = (connection.connectionType === 'password' || connection.password) && typeof connection.password === 'string' && connection.password.length > 0;
    const viaProxy = useProxy(connection, proxy);
    const config = {
      username,
      port: 22,
      // Tor adds high latency; allow up to 2.5 min for handshake when via proxy
      readyTimeout: viaProxy ? 150000 : 20000,
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
    } else {
      entry.lastUsed = Date.now();
      return entry.conn;
    }
  }

  let promise = connectionInFlight.get(key);
  if (promise) return promise;

  promise = connectSSH(connection, proxy).then((conn) => {
    connectionInFlight.delete(key);
    conn.on('close', () => { connectionPool.delete(key); });
    conn.on('error', () => { connectionPool.delete(key); });
    connectionPool.set(key, { conn, lastUsed: Date.now() });
    return conn;
  });
  connectionInFlight.set(key, promise);
  return promise;
}

function execCommand(conn, command, cwd) {
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
          if (cwd) stream.write('cd "' + String(cwd).replace(/"/g, '\\"') + '" 2>/dev/null || true\n');
          // Configure docker in-shell immediately so first command from UI does not race.
          stream.write(
            "if docker info >/dev/null 2>&1; then :; " +
            "elif sudo -n docker info >/dev/null 2>&1; then " +
            "alias docker='sudo -n docker'; " +
            "echo '[Server Operator] Docker commands will use sudo -n in this shell.'; " +
            "else " +
            "echo '[Server Operator] Docker may fail for this SSH user (permission denied). Add user to docker group or allow passwordless sudo for docker.'; " +
            "fi\n"
          );
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
      conn.on('close', () => { connectionPool.delete(key); });
      conn.on('error', () => { connectionPool.delete(key); });
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
    if (connection && proxy !== undefined) {
      const conn = await getOrCreateConnection(connection, proxy);
      const result = await execDockerAwareCommand(conn, command, cwd || connection.cwd, connection, proxy);
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
