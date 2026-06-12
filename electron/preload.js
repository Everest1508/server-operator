const { contextBridge, ipcRenderer } = require('electron');

ipcRenderer.on('shell-output', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('shell-output', { detail: payload }));
});
ipcRenderer.on('compose-logs-data', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('compose-logs-data', { detail: payload }));
});
ipcRenderer.on('compose-logs-stream-ended', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('compose-logs-stream-ended', { detail: payload }));
});
// ── Update checker events ──────────────────────────────────────────────────
ipcRenderer.on('update-available', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('update-available', { detail: payload }));
});
ipcRenderer.on('update-check-result', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('update-check-result', { detail: payload }));
});
ipcRenderer.on('import-progress', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('import-progress', { detail: payload }));
});
ipcRenderer.on('open-local-folder', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('open-local-folder', { detail: payload }));
});

contextBridge.exposeInMainWorld('serverOperator', {
  testConnection: (opts) => ipcRenderer.invoke('server:test-connection', opts),
  pickLocalFolder: () => ipcRenderer.invoke('server:pick-local-folder'),
  runCommand: (opts) => ipcRenderer.invoke('server:run-command', opts),
  getDockerPs: (opts) => ipcRenderer.invoke('server:get-docker-ps', opts),
  getDockerDatabases: (opts) => ipcRenderer.invoke('server:get-docker-databases', opts),
  getDockerComposeServices: (opts) => ipcRenderer.invoke('server:get-docker-compose-services', opts),
  getDockerComposeLogs: (opts) => ipcRenderer.invoke('server:get-docker-compose-logs', opts),
  startComposeLogsStream: (opts) => ipcRenderer.invoke('server:start-compose-logs-stream', opts),
  stopComposeLogsStream: (opts) => ipcRenderer.invoke('server:stop-compose-logs-stream', opts),
  readFile: (opts) => ipcRenderer.invoke('server:read-file', opts),
  writeFile: (opts) => ipcRenderer.invoke('server:write-file', opts),
  listDir: (opts) => ipcRenderer.invoke('server:list-dir', opts),
  mkdir: (opts) => ipcRenderer.invoke('server:mkdir', opts),
  deletePath: (opts) => ipcRenderer.invoke('server:deletePath', opts),
  uploadLocalFile: (opts) => ipcRenderer.invoke('server:upload-local-file', opts),
  downloadRemoteFile: (opts) => ipcRenderer.invoke('server:download-remote-file', opts),
  deploy: (opts) => ipcRenderer.invoke('server:deploy', opts),
  openShell: (opts) => ipcRenderer.invoke('server:open-shell', opts),
  closeShell: (opts) => ipcRenderer.invoke('server:close-shell', opts),
  shellWrite: (opts) => ipcRenderer.invoke('server:shell-write', opts),
  openDevTools: () => ipcRenderer.invoke('app:open-devtools'),
  getLaunchContext: () => ipcRenderer.invoke('app:get-launch-context'),
  getLogFilePath: () => ipcRenderer.invoke('app:get-log-file-path'),
  readLogFile: () => ipcRenderer.invoke('app:read-log-file'),
  clearLogFile: () => ipcRenderer.invoke('app:clear-log-file'),
  connectDatabase: (opts) => ipcRenderer.invoke('database:connect', opts),
  disconnectDatabase: (opts) => ipcRenderer.invoke('database:disconnect', opts),
  queryDatabase: (opts) => ipcRenderer.invoke('database:query', opts),
  getDatabaseSchema: (opts) => ipcRenderer.invoke('database:get-schema', opts),
  exportDatabaseSql: (opts) => ipcRenderer.invoke('database:export-sql', opts),
  importDatabaseSql: (opts) => ipcRenderer.invoke('database:import-sql', opts),
  importFullDatabaseSql: (opts) => ipcRenderer.invoke('database:import-sql-full', opts),
  runDeployPipeline: (opts) => ipcRenderer.invoke('server:run-deploy-pipeline', opts),
  rollbackDeploy: (opts) => ipcRenderer.invoke('server:rollback-deploy', opts),
  getDeployHistory: (opts) => ipcRenderer.invoke('server:get-deploy-history', opts),
  getSnippets: () => ipcRenderer.invoke('snippets:get'),
  saveSnippet: (opts) => ipcRenderer.invoke('snippets:save', opts),
  deleteSnippet: (opts) => ipcRenderer.invoke('snippets:delete', opts),
  loadFeaturesConfig: () => ipcRenderer.invoke('features:load'),
  saveFeaturesConfig: (config) => ipcRenderer.invoke('features:save', config),
  openTunnel: (opts) => ipcRenderer.invoke('tunnel:open', opts),
  closeTunnel: (opts) => ipcRenderer.invoke('tunnel:close', opts),
  // ── Cloudinary Backup ────────────────────────────────────────────────────────
  cloudinarySaveConfig: (config) => ipcRenderer.invoke('cloudinary:save-config', config),
  cloudinaryLoadConfig: () => ipcRenderer.invoke('cloudinary:load-config'),
  cloudinaryUploadBackup: (opts) => ipcRenderer.invoke('cloudinary:upload-backup', opts),
  cloudinaryListBackups: () => ipcRenderer.invoke('cloudinary:list-backups'),
  cloudinaryDownloadBackup: (opts) => ipcRenderer.invoke('cloudinary:download-backup', opts),
  cloudinaryDeleteBackup: (opts) => ipcRenderer.invoke('cloudinary:delete-backup', opts),
  // ── Updates ───────────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  openReleasePage: (url) => ipcRenderer.invoke('updates:open-release', url),
  // ── Window Controls ────────────────────────────────────────────────────────
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
});
