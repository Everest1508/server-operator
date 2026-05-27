export type ViewId = 'servers' | 'files' | 'docker' | 'deploy' | 'notes' | 'database' | 'guide' | 'settings';

export interface FeatureFlags {
  deployModule: boolean;
  servers: boolean;
  files: boolean;
  docker: boolean;
  database: boolean;
  aiAssistant: boolean;
  shortcuts: boolean;
  serverAdmin: boolean;
  configCreators: boolean;
  notes: boolean;
  deployPipeline: boolean;
  deployHistory: boolean;
  sidebarUx: 'hidden' | 'disabled';
}

export const DEFAULT_FLAGS: FeatureFlags = {
  deployModule: true,
  servers: true,
  files: true,
  docker: true,
  database: true,
  aiAssistant: true,
  shortcuts: true,
  serverAdmin: true,
  configCreators: true,
  notes: true,
  deployPipeline: true,
  deployHistory: true,
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
