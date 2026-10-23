const { contextBridge, ipcRenderer, webUtils } = require('electron');

ipcRenderer.on('shell-output', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('shell-output', { detail: payload }));
});
ipcRenderer.on('shell-status', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('shell-status', { detail: payload }));
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
ipcRenderer.on('update-progress', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('update-progress', { detail: payload }));
});
ipcRenderer.on('update-check-result', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('update-check-result', { detail: payload }));
});
ipcRenderer.on('ssh-host-key-prompt', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('ssh-host-key-prompt', { detail: payload }));
});
ipcRenderer.on('import-progress', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('import-progress', { detail: payload }));
});
ipcRenderer.on('open-local-folder', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('open-local-folder', { detail: payload }));
});
ipcRenderer.on('deploy:job-started', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('deploy:job-started', { detail: payload }));
});
ipcRenderer.on('deploy:job-finished', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('deploy:job-finished', { detail: payload }));
});
ipcRenderer.on('deploy:job-error', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('deploy:job-error', { detail: payload }));
});
ipcRenderer.on('deploy:job-cancelled', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('deploy:job-cancelled', { detail: payload }));
});
ipcRenderer.on('deploy:job-log', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('deploy:job-log', { detail: payload }));
});
ipcRenderer.on('deploy:job-focus', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('deploy:job-focus', { detail: payload }));
});

contextBridge.exposeInMainWorld('serverOperator', {
  loadThemeFolders: () => ipcRenderer.invoke('themes:load-folders'),
  openThemesFolder: () => ipcRenderer.invoke('themes:open-user-folder'),
  encryptSecrets: (values) => ipcRenderer.invoke('secrets:encrypt', { values }),
  decryptSecrets: (values) => ipcRenderer.invoke('secrets:decrypt', { values }),
  answerHostKeyPrompt: (opts) => ipcRenderer.invoke('ssh:host-key-answer', opts),
  listKnownHosts: () => ipcRenderer.invoke('ssh:host-key-list'),
  forgetKnownHost: (opts) => ipcRenderer.invoke('ssh:host-key-forget', opts),
  testConnection: (opts) => ipcRenderer.invoke('server:test-connection', opts),
  pickLocalFolder: () => ipcRenderer.invoke('server:pick-local-folder'),
  runCommand: (opts) => ipcRenderer.invoke('server:run-command', opts),
  getDockerPs: (opts) => ipcRenderer.invoke('server:get-docker-ps', opts),
  getDockerDatabases: (opts) => ipcRenderer.invoke('server:get-docker-databases', opts),
  getDockerComposeServices: (opts) => ipcRenderer.invoke('server:get-docker-compose-services', opts),
  getDockerComposeLogs: (opts) => ipcRenderer.invoke('server:get-docker-compose-logs', opts),
  startComposeLogsStream: (opts) => ipcRenderer.invoke('server:start-compose-logs-stream', opts),
  startLogStream: (opts) => ipcRenderer.invoke('server:start-log-stream', opts),
  stopComposeLogsStream: (opts) => ipcRenderer.invoke('server:stop-compose-logs-stream', opts),
  readFile: (opts) => ipcRenderer.invoke('server:read-file', opts),
  writeFile: (opts) => ipcRenderer.invoke('server:write-file', opts),
  listDir: (opts) => ipcRenderer.invoke('server:list-dir', opts),
  statFile: (opts) => ipcRenderer.invoke('server:stat-file', opts),
  mkdir: (opts) => ipcRenderer.invoke('server:mkdir', opts),
  deletePath: (opts) => ipcRenderer.invoke('server:deletePath', opts),
  uploadLocalFile: (opts) => ipcRenderer.invoke('server:upload-local-file', opts),
  uploadLocalPaths: (opts) => ipcRenderer.invoke('server:upload-local-paths', opts),
  // Electron 32+ no longer puts .path on dropped File objects
  getPathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch (_) { return ''; } },
  findFiles: (opts) => ipcRenderer.invoke('server:find-files', opts),
  gitStatus: (opts) => ipcRenderer.invoke('git:status', opts),
  gitDiff: (opts) => ipcRenderer.invoke('git:diff', opts),
  gitAction: (opts) => ipcRenderer.invoke('git:action', opts),
  downloadRemoteFile: (opts) => ipcRenderer.invoke('server:download-remote-file', opts),
  deploy: (opts) => ipcRenderer.invoke('server:deploy', opts),
  openShell: (opts) => ipcRenderer.invoke('server:open-shell', opts),
  closeShell: (opts) => ipcRenderer.invoke('server:close-shell', opts),
  shellWrite: (opts) => ipcRenderer.invoke('server:shell-write', opts),
  openDevTools: () => ipcRenderer.invoke('app:open-devtools'),
  inspectElement: (opts) => ipcRenderer.invoke('app:inspect-element', opts),
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
  scheduleList: (opts) => ipcRenderer.invoke('schedule:list', opts),
  scheduleCreate: (opts) => ipcRenderer.invoke('schedule:create', opts),
  scheduleUpdateStatus: (opts) => ipcRenderer.invoke('schedule:update-status', opts),
  scheduleDelete: (opts) => ipcRenderer.invoke('schedule:delete', opts),
  apiRequest: (opts) => ipcRenderer.invoke('api:request', opts),
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
  // ── CRM OAuth Sign-In ────────────────────────────────────────────────────
  crmLogin: (opts) => ipcRenderer.invoke('auth:crm-login', opts),
  // ── Updates ───────────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openReleasePage: (url) => ipcRenderer.invoke('updates:open-release', url),
  // ── Window Controls ────────────────────────────────────────────────────────
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('window:set-opacity', opacity),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  editCommand: (command) => ipcRenderer.invoke('edit:command', command),
  shellResize: (opts) => ipcRenderer.invoke('server:shell-resize', opts),
  openUrl: (url) => ipcRenderer.invoke('shell:open-url', url),
  deployStartBg: (opts) => ipcRenderer.invoke('deploy:start-bg', opts),
  deployReadLog: (opts) => ipcRenderer.invoke('deploy:read-log', opts),
  deployList: () => ipcRenderer.invoke('deploy:list'),
  deployStatus: (opts) => ipcRenderer.invoke('deploy:status', opts),
  deployCancel: (opts) => ipcRenderer.invoke('deploy:cancel', opts),
});
