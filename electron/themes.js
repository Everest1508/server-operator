// Finds theme JSON files that were not imported through the UI.
// Folders, in the order they are read (a later file with the same theme id wins in the app):
//   1. installer: <resources>/themes   (shipped by the installer, see "extraResources" in package.json)
//   2. admin:     $SEROP_THEMES_DIR    (optional, for company-wide setups)
//   3. user:      <userData>/themes    (drop files here)
// Only top-level *.json files are read. The renderer validates the content.
const fs = require('fs');
const path = require('path');
const { app, ipcMain, shell } = require('electron');

const MAX_FILES_PER_DIR = 20;
const MAX_FILE_BYTES = 20000;

function installerDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'themes') : path.join(process.cwd(), 'themes');
}

function userDir() {
  return path.join(app.getPath('userData'), 'themes');
}

function readDir(dir, source, log) {
  const found = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return found; // folder does not exist, which is normal
  }
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
    .map((e) => e.name)
    .sort()
    .slice(0, MAX_FILES_PER_DIR);
  for (const name of files) {
    try {
      const full = path.join(dir, name);
      if (fs.statSync(full).size > MAX_FILE_BYTES) {
        found.push({ file: name, source, error: 'File is larger than 20 KB.' });
        continue;
      }
      found.push({ file: name, source, text: fs.readFileSync(full, 'utf8') });
    } catch (e) {
      log('Could not read theme file', { file: name, source, error: String(e) });
    }
  }
  return found;
}

function registerThemeHandlers(log) {
  ipcMain.handle('themes:load-folders', async () => {
    const adminDir = process.env.SEROP_THEMES_DIR ? path.resolve(process.env.SEROP_THEMES_DIR) : null;
    return [
      ...readDir(installerDir(), 'installer', log),
      ...(adminDir ? readDir(adminDir, 'admin', log) : []),
      ...readDir(userDir(), 'user', log),
    ];
  });

  ipcMain.handle('themes:open-user-folder', async () => {
    const dir = userDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
      const err = await shell.openPath(dir);
      return err ? { ok: false, error: err, path: dir } : { ok: true, path: dir };
    } catch (e) {
      return { ok: false, error: String(e), path: dir };
    }
  });
}

module.exports = { registerThemeHandlers };
