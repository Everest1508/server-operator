// SSH host key trust store (trust on first use, like OpenSSH known_hosts).
// Fingerprints live in <userData>/known_hosts.json as { "host:port": "SHA256:..." }.
const fs = require('fs');
const path = require('path');
const { app, ipcMain } = require('electron');

const PROMPT_TIMEOUT_MS = 120000;

const pendingPrompts = new Map(); // promptId -> resolve(boolean)
const promptByHost = new Map(); // "host:port" -> Promise<boolean>, so parallel connects share one dialog
let promptCounter = 0;

function storePath() {
  return path.join(app.getPath('userData'), 'known_hosts.json');
}

function loadHosts() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveHosts(hosts) {
  fs.writeFileSync(storePath(), JSON.stringify(hosts, null, 2));
}

// ssh2 gives the hash as hex when hostHash is set. OpenSSH shows SHA256 as unpadded base64.
function formatFingerprint(hexHash) {
  return 'SHA256:' + Buffer.from(hexHash, 'hex').toString('base64').replace(/=+$/, '');
}

function askRenderer(getWindow, payload) {
  const win = getWindow();
  if (!win || win.isDestroyed()) return Promise.resolve(false);
  const key = `${payload.host}:${payload.port}`;
  const existing = promptByHost.get(key);
  if (existing) return existing;

  const promptId = `hk-${++promptCounter}`;
  const answer = new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingPrompts.delete(promptId);
      resolve(false);
    }, PROMPT_TIMEOUT_MS);
    pendingPrompts.set(promptId, (ok) => {
      clearTimeout(timer);
      resolve(ok);
    });
  }).finally(() => promptByHost.delete(key));
  promptByHost.set(key, answer);
  win.webContents.send('ssh-host-key-prompt', { promptId, ...payload });
  return answer;
}

/**
 * Returns the hostVerifier callback for ssh2.
 * Known and matching: accept silently. Unknown or changed: ask the user, save only if they accept.
 */
function createHostVerifier(getWindow, host, port, log) {
  return (hexHash, callback) => {
    const fingerprint = formatFingerprint(hexHash);
    const key = `${host}:${port}`;
    const hosts = loadHosts();
    const saved = hosts[key];
    if (saved === fingerprint) return callback(true);

    const status = saved ? 'changed' : 'new';
    log('SSH host key needs confirmation', { host, port, status });
    askRenderer(getWindow, { host, port, fingerprint, previousFingerprint: saved || null, status })
      .then((ok) => {
        if (ok) {
          const latest = loadHosts();
          latest[key] = fingerprint;
          try { saveHosts(latest); } catch (e) { log('known_hosts write failed', { error: String(e) }); }
        }
        callback(ok);
      });
  };
}

function registerHostKeyHandlers() {
  ipcMain.handle('ssh:host-key-answer', async (_e, { promptId, trust }) => {
    const resolve = pendingPrompts.get(promptId);
    if (resolve) {
      pendingPrompts.delete(promptId);
      resolve(!!trust);
    }
  });
  ipcMain.handle('ssh:host-key-list', async () => loadHosts());
  ipcMain.handle('ssh:host-key-forget', async (_e, { host, port }) => {
    const hosts = loadHosts();
    delete hosts[`${host}:${port || 22}`];
    saveHosts(hosts);
    return { ok: true };
  });
}

module.exports = { createHostVerifier, registerHostKeyHandlers };
