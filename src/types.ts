export type ViewId = 'servers' | 'files' | 'docker' | 'deploy' | 'notes' | 'monitoring' | 'database' | 'snippets' | 'settings';

export interface FeatureFlags {
  deployModule: boolean;
  servers: boolean;
  files: boolean;
  docker: boolean;
  aiAssistant: boolean;
  shortcuts: boolean;
  serverAdmin: boolean;
  configCreators: boolean;
  notes: boolean;
  deployPipeline: boolean;
  deployHistory: boolean;
  snippetLibrary: boolean;
  sidebarUx: 'hidden' | 'disabled';
}

export const DEFAULT_FLAGS: FeatureFlags = {
  deployModule: false,
  servers: false,
  files: false,
  docker: false,
  aiAssistant: false,
  shortcuts: false,
  serverAdmin: false,
  configCreators: false,
  notes: false,
  deployPipeline: false,
  deployHistory: false,
  snippetLibrary: false,
  sidebarUx: 'hidden',
};

export interface ProxySettings {
  enabled: boolean;
  host: string;
  port: number;
}

export type ConnectionType = 'ec2' | 'password' | 'cloudflare';

export interface ServerConnection {
  id: string;
  name: string;
  host: string;
  username: string;
  /** Defaults to 'ec2' if privateKeyPath is set, else 'password' */
  connectionType?: ConnectionType;
  /** For EC2: path to SSH private key file */
  privateKeyPath?: string;
  /** For password: server password (stored in memory; consider using keychain for production) */
  password?: string;
  projectPath?: string;
  cwd?: string;
  useProxy?: boolean;
  layoutX?: number;
  layoutY?: number;
  role?: string;
  links?: string[];
}

/** Clipboard for cut/copy in remote file trees (main Files panel and Projects). */
export interface FileTreeClipboard {
  serverId: string;
  action: 'cut' | 'copy';
  paths: string[];
}

export interface DockerContainer {
  ID?: string;
  Names?: string;
  Image?: string;
  Status?: string;
  State?: string;
  [key: string]: string | undefined;
}
