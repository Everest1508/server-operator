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

contextBridge.exposeInMainWorld('serverOperator', {
  testConnection: (opts) => ipcRenderer.invoke('server:test-connection', opts),
  runCommand: (opts) => ipcRenderer.invoke('server:run-command', opts),
  getDockerPs: (opts) => ipcRenderer.invoke('server:get-docker-ps', opts),
  getDockerComposeServices: (opts) => ipcRenderer.invoke('server:get-docker-compose-services', opts),
  getDockerComposeLogs: (opts) => ipcRenderer.invoke('server:get-docker-compose-logs', opts),
  startComposeLogsStream: (opts) => ipcRenderer.invoke('server:start-compose-logs-stream', opts),
  stopComposeLogsStream: (opts) => ipcRenderer.invoke('server:stop-compose-logs-stream', opts),
  readFile: (opts) => ipcRenderer.invoke('server:read-file', opts),
  writeFile: (opts) => ipcRenderer.invoke('server:write-file', opts),
  listDir: (opts) => ipcRenderer.invoke('server:list-dir', opts),
  mkdir: (opts) => ipcRenderer.invoke('server:mkdir', opts),
  deletePath: (opts) => ipcRenderer.invoke('server:deletePath', opts),
  deploy: (opts) => ipcRenderer.invoke('server:deploy', opts),
  openShell: (opts) => ipcRenderer.invoke('server:open-shell', opts),
  closeShell: (opts) => ipcRenderer.invoke('server:close-shell', opts),
  shellWrite: (opts) => ipcRenderer.invoke('server:shell-write', opts),
});
