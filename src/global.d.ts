import type { ServerConnection, ProxySettings } from './types';

export interface ServerOperatorAPI {
  testConnection: (opts: { connection: ServerConnection; proxy?: ProxySettings }) => Promise<{ ok: boolean; error?: string }>; 
  pickLocalFolder?: () => Promise<{ ok: boolean; canceled?: boolean; folderPath?: string; error?: string }>;
  getLaunchContext?: () => Promise<{ localFolder?: string | null }>;
  runCommand: (opts: {
    host?: string;
    username?: string;
    privateKeyPath?: string;
    command: string;
    cwd?: string;
    connection?: ServerConnection;
    proxy?: ProxySettings;
  }) => Promise<{ ok: boolean; stdout?: string; stderr?: string; code?: number; error?: string }>;
  getDockerPs: (opts: { connection: ServerConnection; proxy?: ProxySettings }) => Promise<{ ok: boolean; containers?: unknown[]; error?: string }>;
  getDockerDatabases: (opts: { connection: ServerConnection; proxy?: ProxySettings }) => Promise<{
    ok: boolean;
    databases?: Array<{
      id: string;
      name: string;
      image: string;
      state?: string;
      status?: string;
      dbType: 'mysql' | 'postgres' | 'redis';
      host: string;
      port: string;
      username: string;
      password: string;
      database: string;
      source: 'published-port' | 'container-ip' | 'default-port';
    }>;
    error?: string;
  }>;
  getDockerComposeServices: (opts: {
    connection: ServerConnection;
    composePath?: string;
    proxy?: ProxySettings;
  }) => Promise<{ ok: boolean; services?: string[]; error?: string }>;
  getDockerComposeLogs: (opts: {
    connection: ServerConnection;
    service?: string;
    tail?: number;
    composePath?: string;
    proxy?: ProxySettings;
  }) => Promise<{ ok: boolean; logs?: string; error?: string }>;
  startComposeLogsStream: (opts: {
    streamId: string;
    connection: ServerConnection;
    composePath?: string;
    service?: string;
    tail?: number;
    proxy?: ProxySettings;
  }) => Promise<{ ok: boolean; error?: string }>;
  startLogStream: (opts: { streamId: string; connection: ServerConnection; command: string; proxy?: ProxySettings }) => Promise<{ ok: boolean; error?: string }>;
  stopComposeLogsStream: (opts: { streamId: string }) => Promise<void>;
  readFile: (opts: { connection: ServerConnection; filePath: string; proxy?: ProxySettings; useSudo?: boolean; sudoPassword?: string }) => Promise<{
    ok: boolean;
    content?: string;
    isBinary?: boolean;
    encoding?: 'utf8' | 'base64';
    mtime?: number;
    size?: number;
    error?: string;
  }>;
  writeFile: (opts: { connection: ServerConnection; filePath: string; content: string; proxy?: ProxySettings; useSudo?: boolean }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  listDir: (opts: { connection: ServerConnection; dirPath?: string; proxy?: ProxySettings }) => Promise<{
    ok: boolean;
    stdout?: string;
    items?: Array<{ name: string; isDir: boolean; isSymlink?: boolean; size?: number; mtime?: number }>;
    error?: string;
  }>;
  statFile: (opts: { connection: ServerConnection; filePath: string; proxy?: ProxySettings }) => Promise<{
    ok: boolean;
    mtime?: number;
    size?: number;
    error?: string;
  }>;
  mkdir: (opts: { connection: ServerConnection; dirPath: string; proxy?: ProxySettings }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  deletePath: (opts: { connection: ServerConnection; filePath: string; proxy?: ProxySettings }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  uploadLocalFile: (opts: {
    connection: ServerConnection;
    proxy?: ProxySettings;
    /** Relative directory on the server (same as file tree), e.g. "." or "src/config". */
    remoteDir: string;
  }) => Promise<{ ok: boolean; canceled?: boolean; error?: string; remotePath?: string }>;
  /** Upload files dropped from Finder / Explorer into remoteDir. Folders are skipped. */
  uploadLocalPaths?: (opts: { connection: ServerConnection; proxy?: ProxySettings; remoteDir: string; localPaths: string[] }) => Promise<{
    ok: boolean;
    uploaded: string[];
    skipped: string[];
    failed: { name: string; error: string }[];
  }>;
  /** Local path of a dropped File (Electron 32+ no longer sets File.path). */
  getPathForFile?: (file: File) => string;
  gitStatus?: (opts: { connection: ServerConnection; proxy?: ProxySettings; dir?: string }) => Promise<{
    ok: boolean;
    error?: string;
    isRepo?: boolean;
    reason?: string;
    branch?: string;
    upstream?: string;
    ahead?: number;
    behind?: number;
    root?: string;
    files?: { code: string; path: string; untracked: boolean }[];
    commits?: { hash: string; author: string; when: string; subject: string }[];
  }>;
  gitDiff?: (opts: { connection: ServerConnection; proxy?: ProxySettings; dir?: string; file?: string; untracked?: boolean; commit?: string }) => Promise<{ ok: boolean; diff?: string; truncated?: boolean; error?: string }>;
  gitAction?: (opts: { connection: ServerConnection; proxy?: ProxySettings; dir?: string; action: 'fetch' | 'pull' | 'stash' | 'discard'; file?: string; untracked?: boolean }) => Promise<{ ok: boolean; output?: string; error?: string }>;
  /** Every file under the project folder (relative paths), for quick open. */
  findFiles?: (opts: { connection: ServerConnection; proxy?: ProxySettings }) => Promise<{ ok: boolean; files?: string[]; truncated?: boolean; error?: string }>;
  downloadRemoteFile: (opts: {
    connection: ServerConnection;
    proxy?: ProxySettings;
    remoteFilePath: string;
  }) => Promise<{ ok: boolean; canceled?: boolean; error?: string; savedTo?: string }>;
  deploy: (opts: { connection: ServerConnection; deployCommand: string; proxy?: ProxySettings; cwd?: string }) => Promise<{
    ok: boolean;
    stdout?: string;
    stderr?: string;
    code?: number;
    error?: string;
  }>;
  openShell: (opts: { connection: ServerConnection; proxy?: ProxySettings; cols?: number; rows?: number }) => Promise<{ ok: boolean; shellId?: string; error?: string }>;
  closeShell: (opts: { shellId: string }) => Promise<void>;
  shellWrite: (opts: { shellId: string; data: string }) => Promise<void>;
  loadThemeFolders: () => Promise<{ file: string; source: 'installer' | 'admin' | 'user'; text?: string; error?: string }[]>;
  openThemesFolder: () => Promise<{ ok: boolean; error?: string; path: string }>;
  encryptSecrets: (values: string[]) => Promise<string[]>;
  decryptSecrets: (values: string[]) => Promise<(string | null)[]>;
  answerHostKeyPrompt: (opts: { promptId: string; trust: boolean }) => Promise<void>;
  listKnownHosts: () => Promise<Record<string, string>>;
  forgetKnownHost: (opts: { host: string; port?: number }) => Promise<{ ok: boolean }>;
  openDevTools?: () => Promise<{ ok: boolean; error?: string }>;
  inspectElement?: (opts: { x: number; y: number }) => Promise<{ ok: boolean; error?: string }>;
  getLogFilePath?: () => Promise<string>;
  readLogFile?: () => Promise<{ ok: boolean; content?: string; error?: string }>;
  clearLogFile?: () => Promise<{ ok: boolean; error?: string }>;
  connectDatabase: (opts: {
    connection: ServerConnection;
    proxy?: ProxySettings;
    dbType: 'mysql' | 'postgres' | 'redis' | 'sqlite';
    config: Record<string, string>;
  }) => Promise<{ ok: boolean; localPort?: number; error?: string }>;
  disconnectDatabase: (opts: { serverId: string }) => Promise<{ ok: boolean; error?: string }>;
  queryDatabase: (opts: { serverId: string; query: string }) => Promise<{ ok: boolean; result?: any; error?: string }>;
  getDatabaseSchema: (opts: { serverId: string }) => Promise<{ ok: boolean; tables?: string[]; keys?: string[]; error?: string }>;
  exportDatabaseSql: (opts: { serverId: string; mode: 'schema' | 'data' | 'full' }) => Promise<{ ok: boolean; sql?: string; filename?: string; error?: string }>;
  importDatabaseSql: (opts: { serverId: string; sql: string }) => Promise<{ ok: boolean; statements?: number; error?: string; lastStatement?: string }>;
  importFullDatabaseSql: (opts: { serverId: string; sql: string }) => Promise<{ ok: boolean; statements?: number; error?: string; lastStatement?: string }>;
  runDeployPipeline: (opts: {
    connection: ServerConnection;
    shellId: string;
    projectDir: string;
    branch: string;
    depType: 'auto' | 'npm' | 'pip' | 'none';
    migType: 'auto' | 'npm' | 'pip' | 'none';
    restartType: 'pm2' | 'systemd' | 'none';
    serviceName: string;
    proxy?: ProxySettings;
  }) => Promise<{ ok: boolean; commitHash?: string; output?: string; error?: string }>;
  rollbackDeploy: (opts: {
    connection: ServerConnection;
    shellId: string;
    projectDir: string;
    commitHash: string;
    restartType: 'pm2' | 'systemd' | 'none';
    serviceName: string;
    proxy?: ProxySettings;
  }) => Promise<{ ok: boolean; error?: string }>;
  getDeployHistory: (opts: {
    serverId: string;
    projectDir: string;
  }) => Promise<Array<{
    id: number;
    serverId: string;
    serverName: string;
    projectDir: string;
    branch: string;
    commitHash: string;
    triggeredCommand: string;
    status: 'success' | 'failure';
    output: string;
    timestamp: string;
  }>>;
  // Cloudinary
  cloudinarySaveConfig: (config: import('./types').CloudinaryConfig) => Promise<{ ok: boolean; error?: string }>;
  cloudinaryLoadConfig: () => Promise<{ ok: boolean; config?: import('./types').CloudinaryConfig; error?: string }>;
  cloudinaryUploadBackup: (opts: { sql: string; filename: string; serverName?: string; dbType?: string; dbName?: string }) => Promise<{ ok: boolean; publicId?: string; url?: string; error?: string }>;
  cloudinaryListBackups: () => Promise<{ ok: boolean; backups?: import('./types').CloudinaryBackup[]; error?: string }>;
  cloudinaryDownloadBackup: (opts: { publicId: string }) => Promise<{ ok: boolean; sql?: string; error?: string }>;
  cloudinaryDeleteBackup: (opts: { publicId: string }) => Promise<{ ok: boolean; error?: string }>;

  getSnippets: () => Promise<Array<{
    id: number;
    title: string;
    description?: string;
    command: string;
    timestamp: string;
  }>>;
  saveSnippet: (opts: {
    id?: number;
    title: string;
    description?: string;
    command: string;
  }) => Promise<{ ok: boolean; id?: number; error?: string }>;
  deleteSnippet: (opts: { id: number }) => Promise<{ ok: boolean; error?: string }>;
  scheduleList: (opts?: { serverId?: string }) => Promise<Array<{
    id: number;
    serverId: string;
    serverName: string;
    command: string;
    runAt: string;
    marker: string;
    status: 'scheduled' | 'running' | 'ran' | 'cancelled' | 'error';
    logPath: string | null;
    createdAt: string;
  }>>;
  scheduleCreate: (opts: {
    serverId: string;
    serverName: string;
    command: string;
    runAt: string;
    marker: string;
    logPath?: string;
  }) => Promise<{ ok: boolean; id?: number; error?: string }>;
  scheduleUpdateStatus: (opts: { id: number; status: 'scheduled' | 'running' | 'ran' | 'cancelled' | 'error' }) => Promise<{ ok: boolean; error?: string }>;
  scheduleDelete: (opts: { id: number }) => Promise<{ ok: boolean; error?: string }>;
  apiRequest: (opts: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    allowInsecure?: boolean;
  }) => Promise<
    | { ok: true; status: number; statusText: string; headers: Record<string, string | string[] | undefined>; body: string; size: number; truncated: boolean; ms: number }
    | { ok: false; error: string; ms?: number }
  >;
  loadFeaturesConfig: () => Promise<any>;
  saveFeaturesConfig: (config: any) => Promise<{ ok: boolean; error?: string }>;
  openTunnel: (opts: { connection: any; proxy?: any; remoteHost: string; remotePort: number }) => Promise<{ ok: boolean; localPort?: number; tunnelId?: string; error?: string }>;
  closeTunnel: (opts: { tunnelId: string }) => Promise<{ ok: boolean }>;
  // CRM OAuth sign-in
  crmLogin: (opts: { baseUrl: string }) => Promise<{
    token: string;
    user: { id: string; email: string | null; displayName: string; isGuest: boolean };
  }>;
  // Updates
  checkForUpdates?: () => Promise<{ ok: boolean }>;
  installUpdate?: () => Promise<{ ok: boolean; error?: string }>;
  openReleasePage?: (url: string) => Promise<{ ok: boolean; error?: string }>;
  platform?: string;
  minimizeWindow?: () => Promise<void>;
  maximizeWindow?: () => Promise<void>;
  closeWindow?: () => Promise<void>;
  isWindowMaximized?: () => Promise<boolean>;
  setWindowOpacity?: (opacity: number) => Promise<void>;
  quitApp?: () => Promise<void>;
  /** Tell the remote terminal its new size (columns and rows) after the panel resizes. */
  shellResize?: (opts: { shellId: string; cols: number; rows: number }) => Promise<void>;
  /** Open an http(s) link in the system browser. */
  openUrl?: (url: string) => Promise<{ ok: boolean; error?: string }>;
  /** Run a native edit command (copy, cut, paste, selectAll, undo, redo) on the focused element. */
  editCommand?: (command: 'copy' | 'cut' | 'paste' | 'pasteAndMatchStyle' | 'selectAll' | 'undo' | 'redo') => Promise<boolean>;
  deployStartBg?: (opts: {
    serverId?: string;
    cwd?: string;
    cmd: string;
    name?: string;
    env?: Record<string, string>;
    connection?: ServerConnection;
    proxy?: ProxySettings;
  }) => Promise<{ ok: boolean; jobId?: string; logPath?: string; error?: string; exitCode?: number }>;
  deployReadLog?: (opts: { jobId?: string; logPath?: string; maxBytes?: number; offset?: number }) => Promise<{
    ok: boolean;
    content?: string;
    size?: number;
    offset?: number;
    bytesRead?: number;
    truncated?: boolean;
    error?: string;
  }>;
  deployList?: () => Promise<{ ok: boolean; jobs?: any[]; error?: string }>;
  deployStatus?: (opts: { jobId: string }) => Promise<{ ok: boolean; job?: any; error?: string }>;
  deployCancel?: (opts: { jobId: string }) => Promise<{ ok: boolean; alreadyDone?: boolean; error?: string }>;
}

declare global {
  interface Window {
    serverOperator: ServerOperatorAPI;
  }
}

export {};
