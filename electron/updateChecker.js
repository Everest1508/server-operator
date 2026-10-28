/**
 * updateChecker.js
 * Silently polls the GitHub Releases API and emits 'update-available' to
 * the renderer when a newer version is found. Download + install goes through
 * electron-updater (mac builds are Developer ID signed + notarized).
 */

'use strict';

const https  = require('https');
const { app, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');

const CAN_AUTO_INSTALL = app.isPackaged;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

const REPO    = 'everest1508/server-operator';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const MAX_DOWNLOAD_ATTEMPTS = 6;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

/** True for a dropped or unreachable connection, as opposed to a bad file or a missing release. */
function isNetworkError(err) {
  const text = `${err && err.code ? err.code : ''} ${err && err.message ? err.message : err}`;
  return /ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ENETDOWN|EPIPE|socket hang up|net::ERR_|timeout|timed out|network|aborted|premature close|unexpected end/i.test(text);
}

/** Naive semver compare: returns true if remote > local */
function isNewer(local, remote) {
  const parse = (v) =>
    String(v)
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPat] = parse(local);
  const [rMaj, rMin, rPat] = parse(remote);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPat > lPat;
}

/** Fetch the latest release info from GitHub. Returns null on any error. */
function fetchLatestRelease() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': `server-operator/${app.getVersion()}`,
        Accept: 'application/vnd.github+json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.tag_name) {
            resolve({
              version: json.tag_name,
              releaseUrl: json.html_url || `https://github.com/${REPO}/releases/latest`,
              releaseNotes: json.body || '',
              assets: json.assets || [],
            });
          } else {
            resolve(null);
          }
        } catch (_) {
          resolve(null);
        }
      });
    });

    req.on('error', (_err) => {
      // Silent failure — user never sees this
      resolve(null);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

/**
 * Run one update check cycle. If a newer release is found, send an IPC event
 * to the focused/main window.
 *
 * @param {Electron.BrowserWindow} getWindow  - getter fn returning the current mainWindow
 * @param {boolean} [userTriggered=false]     - true when called from the menu item
 */
async function runUpdateCheck(getWindow, userTriggered = false) {
  try {
    const release = await fetchLatestRelease();
    const win = getWindow();
    if (!win || win.isDestroyed()) return;

    if (!release) {
      console.log('[Update Checker] Failed to fetch latest release from GitHub API.');
      if (userTriggered) {
        win.webContents.send('update-check-result', { ok: false });
      }
      return;
    }

    const localVersion = app.getVersion();
    const hasNewer = isNewer(localVersion, release.version);
    console.log(`[Update Checker] Comparison: Local=${localVersion}, Remote=${release.version}. Newer available? ${hasNewer}`);
    
    if (hasNewer) {
      win.webContents.send('update-available', {
        version: release.version,
        releaseUrl: release.releaseUrl,
        releaseNotes: release.releaseNotes,
        canInstall: CAN_AUTO_INSTALL,
      });
    } else if (userTriggered) {
      // Already on latest — tell the renderer to show a toast
      win.webContents.send('update-check-result', { ok: true, upToDate: true });
    }
  } catch (err) {
    console.error('[Update Checker] Error during runUpdateCheck:', err);
  }
}

/**
 * Start the update checker.
 *
 * @param {() => Electron.BrowserWindow | null} getWindow
 */
function startUpdateChecker(getWindow) {
  // First check shortly after launch (give renderer time to mount)
  console.log('[Update Checker] Starting check in 2 seconds...');
  const initialDelay = setTimeout(() => {
    console.log('[Update Checker] Running initial startup check...');
    runUpdateCheck(getWindow);
  }, 2000);

  // Then every 4 hours
  const interval = setInterval(() => runUpdateCheck(getWindow), CHECK_INTERVAL_MS);

  // IPC: renderer can request a manual check (e.g. Settings "Check for updates" button)
  ipcMain.handle('updates:check', async () => {
    await runUpdateCheck(getWindow, true);
    return { ok: true };
  });

  // IPC: download via electron-updater, then restart into the new version
  // electron-updater cannot resume a partial download: a dropped connection throws the temp file away.
  // So a network error is retried automatically (with a growing pause) instead of making the person click again.
  const send = (channel, payload) => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.send(channel, payload); };
  autoUpdater.on('download-progress', (p) => send('update-progress', Math.round(p.percent)));

  let installing = false;
  ipcMain.handle('updates:install', async () => {
    if (!CAN_AUTO_INSTALL) return { ok: false, error: 'Auto-update not available on this platform' };
    if (installing) return { ok: false, error: 'An update is already downloading.' };
    installing = true;
    try {
      let lastErr;
      for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
        try {
          await autoUpdater.checkForUpdates();
          await autoUpdater.downloadUpdate();
          send('update-status', '');
          setImmediate(() => autoUpdater.quitAndInstall());
          return { ok: true };
        } catch (err) {
          lastErr = err;
          if (!isNetworkError(err) || attempt === MAX_DOWNLOAD_ATTEMPTS) break;
          const waitSec = Math.min(30, 2 ** attempt);
          console.warn(`[Update] Download failed (${err.message || err}); retry ${attempt}/${MAX_DOWNLOAD_ATTEMPTS - 1} in ${waitSec}s`);
          send('update-status', `Network error, retrying in ${waitSec}s (${attempt}/${MAX_DOWNLOAD_ATTEMPTS - 1})…`);
          await new Promise((r) => setTimeout(r, waitSec * 1000));
        }
      }
      send('update-status', '');
      const reason = isNetworkError(lastErr) ? 'The connection kept dropping. Check your network and try again.' : String(lastErr.message || lastErr);
      return { ok: false, error: reason };
    } finally {
      installing = false;
    }
  });

  // IPC: open release page in default browser
  ipcMain.handle('updates:open-release', async (_event, url) => {
    try {
      await shell.openExternal(url || `https://github.com/${REPO}/releases/latest`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Cleanup on quit
  app.on('before-quit', () => {
    clearTimeout(initialDelay);
    clearInterval(interval);
  });
}

module.exports = { startUpdateChecker, runUpdateCheck };
