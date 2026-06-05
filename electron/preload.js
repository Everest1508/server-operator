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
ipcRenderer.on('monitored-servers-status-updated', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('monitored-servers-status-updated', { detail: payload }));
});

// ── Update checker events ──────────────────────────────────────────────────
ipcRenderer.on('update-available', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('update-available', { detail: payload }));
});
ipcRenderer.on('update-check-result', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('update-check-result', { detail: payload }));
});

contextBridge.exposeInMainWorld('serverOperator', {
  testConnection: (opts) => ipcRenderer.invoke('server:test-connection', opts),
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
  getLogFilePath: () => ipcRenderer.invoke('app:get-log-file-path'),
  readLogFile: () => ipcRenderer.invoke('app:read-log-file'),
  clearLogFile: () => ipcRenderer.invoke('app:clear-log-file'),
  saveAlert: (opts) => ipcRenderer.invoke('alerts:save', opts),
  getAlertHistory: (opts) => ipcRenderer.invoke('alerts:get-history', opts),
  clearAlertHistory: (opts) => ipcRenderer.invoke('alerts:clear-history', opts),
  sendWebhook: (opts) => ipcRenderer.invoke('alerts:send-webhook', opts),
  triggerNotification: (opts) => ipcRenderer.invoke('alerts:trigger-notification', opts),
  setMonitoredServers: (opts) => ipcRenderer.invoke('monitoring:set-servers', opts),
  getMonitoredServersStatus: () => ipcRenderer.invoke('monitoring:get-statuses'),
  getHistoricalMetrics: (opts) => ipcRenderer.invoke('metrics:get-history', opts),
  clearHistoricalMetrics: (opts) => ipcRenderer.invoke('metrics:clear-history', opts),
  connectDatabase: (opts) => ipcRenderer.invoke('database:connect', opts),
  disconnectDatabase: (opts) => ipcRenderer.invoke('database:disconnect', opts),
  queryDatabase: (opts) => ipcRenderer.invoke('database:query', opts),
  getDatabaseSchema: (opts) => ipcRenderer.invoke('database:get-schema', opts),
  exportDatabaseSql: (opts) => ipcRenderer.invoke('database:export-sql', opts),
  importDatabaseSql: (opts) => ipcRenderer.invoke('database:import-sql', opts),
  runDeployPipeline: (opts) => ipcRenderer.invoke('server:run-deploy-pipeline', opts),
  rollbackDeploy: (opts) => ipcRenderer.invoke('server:rollback-deploy', opts),
  getDeployHistory: (opts) => ipcRenderer.invoke('server:get-deploy-history', opts),
  getSnippets: () => ipcRenderer.invoke('snippets:get'),
  saveSnippet: (opts) => ipcRenderer.invoke('snippets:save', opts),
  deleteSnippet: (opts) => ipcRenderer.invoke('snippets:delete', opts),
  loadFeaturesConfig: () => ipcRenderer.invoke('features:load'),
  saveFeaturesConfig: (config) => ipcRenderer.invoke('features:save', config),
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
