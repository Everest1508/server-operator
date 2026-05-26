export type ViewId = 'servers' | 'files' | 'docker' | 'deploy' | 'notes';

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
