import type { ServerConnection, ProxySettings } from './types';

export interface ServerOperatorAPI {
  testConnection: (opts: { connection: ServerConnection; proxy?: ProxySettings }) => Promise<{ ok: boolean; error?: string }>;
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
  stopComposeLogsStream: (opts: { streamId: string }) => Promise<void>;
  readFile: (opts: { connection: ServerConnection; filePath: string; proxy?: ProxySettings }) => Promise<{
    ok: boolean;
    content?: string;
    error?: string;
  }>;
  writeFile: (opts: { connection: ServerConnection; filePath: string; content: string; proxy?: ProxySettings }) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  listDir: (opts: { connection: ServerConnection; dirPath?: string; proxy?: ProxySettings }) => Promise<{
    ok: boolean;
    stdout?: string;
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
  deploy: (opts: { connection: ServerConnection; deployCommand: string; proxy?: ProxySettings; cwd?: string }) => Promise<{
    ok: boolean;
    stdout?: string;
    stderr?: string;
    code?: number;
    error?: string;
  }>;
  openShell: (opts: { connection: ServerConnection; proxy?: ProxySettings }) => Promise<{ ok: boolean; shellId?: string; error?: string }>;
  closeShell: (opts: { shellId: string }) => Promise<void>;
  shellWrite: (opts: { shellId: string; data: string }) => Promise<void>;
}

declare global {
  interface Window {
    serverOperator: ServerOperatorAPI;
  }
}

export {};
