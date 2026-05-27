/**
 * updateChecker.js
 * Silently polls the GitHub Releases API and emits 'update-available' to
 * the renderer when a newer version is found. No electron-updater required.
 */

'use strict';

const https  = require('https');
const { app, ipcMain, shell } = require('electron');

const REPO    = 'everest1508/server-operator';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

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
      // API failed
      if (userTriggered) {
        win.webContents.send('update-check-result', { ok: false });
      }
      return;
    }

    const localVersion = app.getVersion();
    if (isNewer(localVersion, release.version)) {
      win.webContents.send('update-available', {
        version: release.version,
        releaseUrl: release.releaseUrl,
        releaseNotes: release.releaseNotes,
      });
    } else if (userTriggered) {
      // Already on latest — tell the renderer to show a toast
      win.webContents.send('update-check-result', { ok: true, upToDate: true });
    }
  } catch (_) {
    // Never propagate
  }
}

/**
 * Start the update checker.
 *
 * @param {() => Electron.BrowserWindow | null} getWindow
 */
function startUpdateChecker(getWindow) {
  // First check shortly after launch (give renderer time to mount)
  const initialDelay = setTimeout(() => runUpdateCheck(getWindow), 8000);

  // Then every 4 hours
  const interval = setInterval(() => runUpdateCheck(getWindow), CHECK_INTERVAL_MS);

  // IPC: renderer can request a manual check (e.g. Settings "Check for updates" button)
  ipcMain.handle('updates:check', async () => {
    await runUpdateCheck(getWindow, true);
    return { ok: true };
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
