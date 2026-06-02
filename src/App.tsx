import { useState, useEffect, useRef } from 'react';
import { ActivityBar } from './components/ActivityBar';
import { Sidebar } from './components/Sidebar';
import { EditorArea } from './components/EditorArea';
import { NoServerView } from './components/NoServerView';
import { Panel } from './components/Panel';
import { RepoSidebar } from './components/RepoSidebar';
import { SettingsView } from './components/SettingsView';
import { UpdateBanner } from './components/UpdateBanner';
import { TitleBar } from './components/TitleBar';
import type { ServerConnection, ViewId, ProxySettings, DockerContainer, FileTreeClipboard } from './types';
import { escapeShellSingleQuotes } from './utils/shellQuote';
import type { ServerSysInfo } from './components/ServerOverview';
import { parseLsLine } from './utils/parseLs';

const STORAGE_KEY_SERVERS = 'server-operator-servers';
const STORAGE_KEY_PROXY = 'server-operator-proxy';
const STORAGE_KEY_REPOS = 'server-operator:repos';
const STORAGE_KEY_COMPOSE_PATHS = 'server-operator:compose-paths';

function loadReposByServer(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPOS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function loadComposePathsByServer(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COMPOSE_PATHS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

const VIEW_IDS: ViewId[] = ['servers', 'files', 'docker', 'deploy', 'notes', 'database', 'guide', 'settings'];
const HASH_PREFIX = '#/';

function viewFromHash(): ViewId {
  const hash = window.location.hash.slice(1).replace(/^\/+/, '');
  const view = hash.split('/')[0] || '';
  return VIEW_IDS.includes(view as ViewId) ? (view as ViewId) : 'servers';
}

function hashFromView(view: ViewId): string {
  return `${HASH_PREFIX}${view}`;
}

const defaultProxy: ProxySettings = {
  enabled: false,
  host: '127.0.0.1',
  port: 9050,
};

function loadServers(): ServerConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SERVERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return (parsed as ServerConnection[]).filter(s => s.id !== 'dummy' && s.host !== 'dummy');
    }
    return [];
  } catch {
    return [];
  }
}

function loadProxy(): ProxySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROXY);
    if (!raw) return defaultProxy;
    const parsed = JSON.parse(raw) as ProxySettings;
    return { ...defaultProxy, ...parsed };
  } catch {
    return defaultProxy;
  }
}

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 480;
const SIDEBAR_DEFAULT = 256;
const PANEL_MIN = 120;
const PANEL_MAX = 600;
const PANEL_DEFAULT = 280;
const RIGHT_PANEL_MIN = 180;
const RIGHT_PANEL_MAX = 480;
const RIGHT_PANEL_DEFAULT = 240;

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [activeView, setActiveView] = useState<ViewId>(() => viewFromHash());
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelHeight, setPanelHeight] = useState(PANEL_DEFAULT);
  const [panelTab, setPanelTab] = useState<'logs' | 'terminal'>('logs');
  const [pendingTerminalCommand, setPendingTerminalCommand] = useState<string | null>(null);
  const [pendingTerminalLabel, setPendingTerminalLabel] = useState<string | null>(null);
  const [currentServer, setCurrentServer] = useState<ServerConnection | null>(null);

  const openTerminalAndRun = (command: string, label?: string) => {
    setPanelOpen(true);
    setPanelTab('terminal');
    setPendingTerminalCommand(command);
    setPendingTerminalLabel(label ?? null);
  };

  const [serverSysInfo, setServerSysInfo] = useState<ServerSysInfo | null>(null);
  const [serverStatusLoading, setServerStatusLoading] = useState(false);

  const fetchServerStatus = (server: ServerConnection) => {
    if (!window.serverOperator) return;
    setServerStatusLoading(true);
    setServerSysInfo(null);
    const cwd = server.projectPath || server.cwd || undefined;
    const p = proxyRef.current;
    Promise.all([
      window.serverOperator.runCommand({ connection: server, command: 'uptime', cwd, proxy: p }),
      window.serverOperator.runCommand({ connection: server, command: 'free -m | head -2', cwd, proxy: p }),
      window.serverOperator.runCommand({ connection: server, command: 'df -h . | tail -1', cwd, proxy: p }),
    ])
      .then(([u, m, d]) => {
        setServerSysInfo({
          uptime: u.ok && u.stdout ? u.stdout.trim() : null,
          memory: m.ok && m.stdout ? m.stdout.trim() : null,
          disk: d.ok && d.stdout ? d.stdout.trim() : null,
          error: null,
        });
      })
      .catch((err) => {
        setServerSysInfo({
          uptime: null,
          memory: null,
          disk: null,
          error: err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to load system info',
        });
      })
      .finally(() => setServerStatusLoading(false));
  };

  useEffect(() => {
    if (!currentServer || !window.serverOperator) {
      setServerSysInfo(null);
      return;
    }
    fetchServerStatus(currentServer);
  }, [currentServer?.id]);

  const refreshServerStatus = () => {
    if (currentServer) fetchServerStatus(currentServer);
  };

  const [servers, setServers] = useState<ServerConnection[]>(() => loadServers());
  const [proxy, setProxy] = useState<ProxySettings>(() => loadProxy());
  const proxyRef = useRef(proxy);
  proxyRef.current = proxy; // always use latest when Connect is clicked (avoids stale closure)
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [connectingToServer, setConnectingToServer] = useState<ServerConnection | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const connectCancelRef = useRef(false);
  const [selectedGuideId, setSelectedGuideId] = useState<string>('database');
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT);
  const [resizeDrag, setResizeDrag] = useState<'sidebar' | 'panel' | 'rightPanel' | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    if (!resizeDrag) return;
    const onMove = (e: MouseEvent) => {
      const s = resizeStartRef.current;
      if (resizeDrag === 'sidebar') {
        setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, s.w + (e.clientX - s.x))));
      } else if (resizeDrag === 'rightPanel') {
        setRightPanelWidth(Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, s.w - (e.clientX - s.x))));
      } else {
        setPanelHeight(Math.min(PANEL_MAX, Math.max(PANEL_MIN, s.h - (e.clientY - s.y))));
      }
    };
    const onUp = () => setResizeDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeDrag]);

  // File browser state: tree view (VS Code style)
  const [currentPath, setCurrentPath] = useState('.');
  const [treeListings, setTreeListings] = useState<Record<string, string>>({});
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set(['.']));
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [filesError, setFilesError] = useState<string | null>(null);
  const [fileTransferBusy, setFileTransferBusy] = useState(false);
  const [fileTreeClipboard, setFileTreeClipboard] = useState<FileTreeClipboard | null>(null);
  // Tabs: multiple open files; content and saved snapshot per path
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [contentByPath, setContentByPath] = useState<Record<string, string>>({});
  const [savedContentByPath, setSavedContentByPath] = useState<Record<string, string>>({});
  const [tabSudoByPath, setTabSudoByPath] = useState<Record<string, boolean>>({});
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [fileLoadError, setFileLoadError] = useState<string | null>(null);
  const basePath = currentServer?.projectPath || currentServer?.cwd || '.';

  const [reposByServer, setReposByServer] = useState<Record<string, string[]>>(() => loadReposByServer());
  const [composePathsByServer, setComposePathsByServer] = useState<Record<string, string[]>>(() => loadComposePathsByServer());
  const [selectedRepoPath, setSelectedRepoPath] = useState<string | null>(null);
  const [repoTreeListings, setRepoTreeListings] = useState<Record<string, string>>({});
  const [repoOpenFolders, setRepoOpenFolders] = useState<Record<string, Set<string>>>({});
  const [repoCurrentPathByRepo, setRepoCurrentPathByRepo] = useState<Record<string, string>>({});
  const [repoLoadingPaths, setRepoLoadingPaths] = useState<Set<string>>(new Set());
  const repoDirCacheRef = useRef<Record<string, { fileList: string; error: string | null }>>({});

  const dirCacheRef = useRef<Record<string, { fileList: string; error: string | null }>>({});

  useEffect(() => {
    if (currentServer?.id) {
      setCurrentPath('.');
      setTreeListings({});
      setOpenFolders(new Set(['.']));
      setLoadingPaths(new Set());
      setOpenTabs([]);
      setActiveTabPath(null);
      setContentByPath({});
      setSavedContentByPath({});
      setTabSudoByPath({});
      setLoadingPath(null);
      setFileLoadError(null);
      setSelectedRepoPath(null);
      setRepoTreeListings({});
      setRepoOpenFolders({});
    }
  }, [currentServer?.id]);

  useEffect(() => {
    setFileTreeClipboard(null);
  }, [currentServer?.id]);

  useEffect(() => {
    if (selectedRepoPath && currentServer && window.serverOperator) {
      loadRepoDir(selectedRepoPath, '.', false);
    }
  }, [selectedRepoPath, currentServer?.id]);

  useEffect(() => {
    const syncNotes = (e: Event) => {
      const customEvent = e as CustomEvent<{ type: 'general' | 'server'; content: string }>;
      const path = customEvent.detail.type === 'general' ? 'notes://general' : 'notes://server';
      setContentByPath((prev) => {
        if (prev[path] === customEvent.detail.content) return prev;
        return { ...prev, [path]: customEvent.detail.content };
      });
      setSavedContentByPath((prev) => {
        if (prev[path] === customEvent.detail.content) return prev;
        return { ...prev, [path]: customEvent.detail.content };
      });
    };
    window.addEventListener('notes-updated', syncNotes as EventListener);
    return () => window.removeEventListener('notes-updated', syncNotes as EventListener);
  }, []);

  useEffect(() => {
    const handlePaste = () => {
      setPanelOpen(true);
      setPanelTab('terminal');
    };
    window.addEventListener('paste-to-active-terminal', handlePaste);
    return () => window.removeEventListener('paste-to-active-terminal', handlePaste);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_REPOS, JSON.stringify(reposByServer));
    } catch {
      // ignore
    }
  }, [reposByServer]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_COMPOSE_PATHS, JSON.stringify(composePathsByServer));
    } catch {
      // ignore
    }
  }, [composePathsByServer]);

  const composePaths = currentServer ? (composePathsByServer[currentServer.id] ?? []) : [];

  const [dockerContainers, setDockerContainers] = useState<DockerContainer[]>([]);
  const [dockerLoading, setDockerLoading] = useState(false);
  const [dockerError, setDockerError] = useState<string | null>(null);
  const [dockerServicesByPath, setDockerServicesByPath] = useState<Record<string, string[]>>({});
  const [dockerServicesLoading, setDockerServicesLoading] = useState(false);

  const fetchDockerData = () => {
    if (!currentServer || !window.serverOperator) return;
    setDockerLoading(true);
    setDockerError(null);
    const p = proxyRef.current;
    window.serverOperator
      .getDockerPs({ connection: currentServer, proxy: p })
      .then((res) => {
        if (res.ok && res.containers) setDockerContainers(res.containers as DockerContainer[]);
        else setDockerError(res.error || 'Failed to fetch containers');
      })
      .finally(() => setDockerLoading(false));
    const paths = composePathsByServer[currentServer.id] ?? [];
    if (paths.length === 0) return;
    setDockerServicesLoading(true);
    Promise.all(
      paths.map((path) =>
        window.serverOperator!.getDockerComposeServices({ connection: currentServer, composePath: path, proxy: p })
      )
    )
      .then((results) => {
        const next: Record<string, string[]> = {};
        paths.forEach((path, i) => {
          next[path] = results[i].ok && results[i].services ? results[i].services : [];
        });
        setDockerServicesByPath((prev) => ({ ...prev, ...next }));
      })
      .finally(() => setDockerServicesLoading(false));
  };

  useEffect(() => {
    if (!currentServer || !window.serverOperator) {
      setDockerContainers([]);
      setDockerServicesByPath({});
      setDockerError(null);
      return;
    }
    fetchDockerData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when server or compose paths change
  }, [currentServer?.id, composePaths.join(',')]);

  const refreshDocker = () => {
    if (currentServer) fetchDockerData();
  };

  const setComposePaths = (paths: string[]) => {
    if (!currentServer) return;
    setComposePathsByServer((prev) => ({ ...prev, [currentServer.id]: paths }));
  };
  const addComposePath = (path: string) => {
    if (!currentServer || composePaths.includes(path)) return;
    setComposePaths([...composePaths, path]);
  };
  const removeComposePath = (path: string) => {
    if (!currentServer) return;
    setComposePaths(composePaths.filter((p) => p !== path));
  };

  const repos = currentServer ? (reposByServer[currentServer.id] ?? []) : [];
  const addRepo = (path: string) => {
    if (!currentServer || repos.includes(path)) return;
    setReposByServer((prev) => ({
      ...prev,
      [currentServer.id]: [...(prev[currentServer.id] ?? []), path],
    }));
  };

  const removeRepo = (path: string) => {
    if (!currentServer) return;
    setReposByServer((prev) => {
      const list = (prev[currentServer.id] ?? []).filter((p) => p !== path);
      const next = { ...prev, [currentServer.id]: list };
      return next;
    });
    if (selectedRepoPath === path) setSelectedRepoPath(null);
  };

  const onMakeGitRepo = async (path: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentServer || !window.serverOperator) return { ok: false, error: 'Not connected' };
    const res = await window.serverOperator.runCommand({
      connection: currentServer,
      command: 'git init',
      cwd: path,
      proxy,
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error || res.stderr || 'git init failed' };
  };

  const onAddToLogs = async (filePath: string) => {
    const base = (basePath || '.').trim().replace(/\/+$/, '');
    let fullComposeFilePath: string;
    if (base === '' || base === '.') {
      if (!currentServer || !window.serverOperator) {
        fullComposeFilePath = filePath;
      } else {
        const res = await window.serverOperator.runCommand({
          connection: currentServer,
          command: 'pwd',
          proxy,
        });
        const cwd = res.ok && res.stdout ? res.stdout.trim() : '';
        fullComposeFilePath = cwd ? `${cwd}/${filePath}` : filePath;
      }
    } else {
      fullComposeFilePath = `${base}/${filePath}`;
    }
    addComposePath(fullComposeFilePath);
    console.log('[Logs] Added path for compose:', fullComposeFilePath, '(from file:', filePath + ')');
  };

  const onAddAsProject = async (path: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentServer || !window.serverOperator) return { ok: false, error: 'Not connected' };
    addRepo(path);
    const listRes = await window.serverOperator.listDir({
      connection: currentServer,
      dirPath: path,
      proxy,
    });
    if (listRes.ok && listRes.stdout) {
      const lines = listRes.stdout.trim().split('\n').filter(Boolean);
      const hasCompose = lines.some((line) => {
        const parsed = parseLsLine(line);
        const name = (parsed?.name ?? line.trim()).toLowerCase().replace(/\/$/, '');
        return name === 'docker-compose.yml' || name === 'docker-compose.yaml';
      });
      if (hasCompose) addComposePath(path);
    }
    return { ok: true };
  };

  const repoListingKey = (repoPath: string, relativePath: string) => `${repoPath}:${relativePath}`;
  const loadRepoDir = (repoPath: string, relativePath: string, forceRefresh = false) => {
    if (!currentServer || !window.serverOperator) return;
    const pathKey = (relativePath || '.').trim() || '.';
    const listKey = repoListingKey(repoPath, pathKey);
    const dirPath = pathKey === '.' ? repoPath : `${repoPath}/${pathKey}`;
    const cacheKey = `${currentServer.id}:repo:${listKey}`;
    const cached = repoDirCacheRef.current[cacheKey];
    if (!forceRefresh && cached) {
      setRepoTreeListings((prev) => ({ ...prev, [listKey]: cached.fileList }));
      return;
    }
    setRepoLoadingPaths((prev) => new Set(prev).add(listKey));
    window.serverOperator
      .listDir({ connection: currentServer, dirPath, proxy })
      .then((res) => {
        const fileList = res.ok ? res.stdout || '' : res.error || '';
        const error = res.ok ? null : (res.error || '');
        repoDirCacheRef.current[cacheKey] = { fileList, error };
        setRepoTreeListings((prev) => ({ ...prev, [listKey]: fileList }));
      })
      .finally(() => {
        setRepoLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(listKey);
          return next;
        });
      });
  };

  const refreshAllTreeDirs = () => {
    if (!currentServer || !window.serverOperator) return;
    const dirs = new Set<string>(['.']);
    openFolders.forEach((d) => dirs.add(d));
    dirs.add(currentPath || '.');
    dirs.forEach((d) => loadDir(d, true));
    const repoList = reposByServer[currentServer.id] ?? [];
    repoList.forEach((repo) => {
      loadRepoDir(repo, '.', true);
      const opens = repoOpenFolders[repo];
      if (opens) {
        opens.forEach((rel) => {
          if (rel && rel !== '.') loadRepoDir(repo, rel, true);
        });
      }
    });
  };

  const toggleRepoFolder = (repoPath: string, pathKey: string) => {
    setRepoOpenFolders((prev) => {
      const current = prev[repoPath] ?? new Set(['.']);
      const next = new Set(current);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return { ...prev, [repoPath]: next };
    });
    setRepoCurrentPathByRepo((prev) => ({ ...prev, [repoPath]: pathKey }));
    const listKey = repoListingKey(repoPath, pathKey);
    if (!repoTreeListings[listKey]) loadRepoDir(repoPath, pathKey, false);
  };

  const repoBuildPath = (repoPath: string, name: string) => {
    const current = (repoCurrentPathByRepo[repoPath] ?? '.').trim() || '.';
    return current === '.' ? `${repoPath}/${name}` : `${repoPath}/${current}/${name}`;
  };

  const appendToRepoDirListing = (repoPath: string, relativePath: string, name: string, isDir: boolean) => {
    if (!currentServer) return;
    const listKey = repoListingKey(repoPath, relativePath);
    const cacheKey = `${currentServer.id}:repo:${listKey}`;
    const cached = repoDirCacheRef.current[cacheKey];
    const currentList = cached?.fileList?.trimEnd() ?? '';
    const perm = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
    const syntheticLine = `${perm} 1 0 0 0 Jan 1 00:00 ${name}`;
    const newFileList = currentList ? currentList + '\n' + syntheticLine : syntheticLine;
    repoDirCacheRef.current[cacheKey] = { fileList: newFileList, error: cached?.error ?? null };
    setRepoTreeListings((prev) => ({ ...prev, [listKey]: newFileList }));
  };

  const removeFromRepoDirListing = (repoPath: string, relativePath: string, deletedPath: string) => {
    if (!currentServer) return;
    const listKey = repoListingKey(repoPath, relativePath);
    const cacheKey = `${currentServer.id}:repo:${listKey}`;
    const cached = repoDirCacheRef.current[cacheKey];
    if (!cached?.fileList) return;
    const nameToRemove = deletedPath.replace(/\/+$/, '').split('/').pop() ?? deletedPath;
    const lines = cached.fileList.trim().split('\n').filter((line) => {
      const parsed = parseLsLine(line);
      return !parsed || parsed.name !== nameToRemove;
    });
    const newFileList = lines.join('\n');
    repoDirCacheRef.current[cacheKey] = { fileList: newFileList, error: cached.error };
    setRepoTreeListings((prev) => ({ ...prev, [listKey]: newFileList }));
  };

  const createFileInRepo = async (repoPath: string, name: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentServer || !window.serverOperator) return { ok: false, error: 'Not connected' };
    const trimmed = name.trim();
    const filePath = repoBuildPath(repoPath, trimmed);
    if (!filePath) return { ok: false, error: 'Invalid name' };
    const res = await window.serverOperator.writeFile({
      connection: currentServer,
      filePath,
      content: '',
      proxy,
    });
    if (res.ok) {
      const parent = repoCurrentPathByRepo[repoPath] ?? '.';
      appendToRepoDirListing(repoPath, parent, trimmed, false);
      setOpenTabs((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
      setActiveTabPath(filePath);
      setContentByPath((prev) => ({ ...prev, [filePath]: '' }));
      setSavedContentByPath((prev) => ({ ...prev, [filePath]: '' }));
    }
    return res;
  };

  const createFolderInRepo = async (repoPath: string, name: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentServer || !window.serverOperator) return { ok: false, error: 'Not connected' };
    const trimmed = name.trim();
    const dirPath = repoBuildPath(repoPath, trimmed);
    if (!dirPath) return { ok: false, error: 'Invalid name' };
    const res = await window.serverOperator.mkdir({
      connection: currentServer,
      dirPath,
      proxy,
    });
    if (res.ok) {
      const parent = repoCurrentPathByRepo[repoPath] ?? '.';
      appendToRepoDirListing(repoPath, parent, trimmed, true);
    }
    return res;
  };

  const deleteEntryInRepo = async (fullPath: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentServer || !window.serverOperator) return { ok: false, error: 'Not connected' };
    const pathEsc = fullPath.replace(/'/g, "'\\''");
    const res = await window.serverOperator.runCommand({
      connection: currentServer,
      command: `rm -rf '${pathEsc}'`,
      cwd: currentServer.cwd,
      proxy,
    });
    const ok = res.ok && res.code === 0;
    if (ok) {
      if (selectedRepoPath && fullPath.startsWith(selectedRepoPath + '/')) {
        const parentPath = fullPath.split('/').slice(0, -1).join('/');
        const parentRelative = parentPath === selectedRepoPath ? '.' : parentPath.slice(selectedRepoPath.length + 1);
        removeFromRepoDirListing(selectedRepoPath, parentRelative, fullPath);
        if (openTabs.includes(fullPath)) closeTab(fullPath);
      }
      refreshAllTreeDirs();
    }
    return { ok, error: ok ? undefined : (res.error || res.stderr || 'Delete failed') };
  };

  const collapseRepo = (repoPath: string) => {
    setRepoOpenFolders((prev) => ({ ...prev, [repoPath]: new Set(['.']) }));
  };

  const loadDir = (dirPath: string, forceRefresh = false) => {
    if (!currentServer || !window.serverOperator) return;
    const pathKey = (dirPath || '.').trim() || '.';
    const cacheKey = `${currentServer.id}:${pathKey}`;
    const cached = dirCacheRef.current[cacheKey];

    if (!forceRefresh && cached) {
      setTreeListings((prev) => ({ ...prev, [pathKey]: cached.fileList }));
      setFilesError(cached.error);
      return;
    }

    setLoadingPaths((prev) => new Set(prev).add(pathKey));
    setFilesError(null);
    window.serverOperator
      .listDir({ connection: currentServer, dirPath: pathKey, proxy })
      .then((res) => {
        const fileList = res.ok ? res.stdout || '' : res.error || '';
        const error = res.ok ? null : (res.error || '');
        dirCacheRef.current[cacheKey] = { fileList, error };
        setTreeListings((prev) => ({ ...prev, [pathKey]: fileList }));
        setFilesError(error);
      })
      .finally(() => {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(pathKey);
          return next;
        });
      });
  };

  useEffect(() => {
    if (activeView !== 'files' || !currentServer || !window.serverOperator) return;
    loadDir('.', false);
  }, [activeView, currentServer?.id]);

  const toggleFolder = (path: string) => {
    const pathKey = path === '' ? '.' : path;
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
    setCurrentPath(pathKey);
    if (!treeListings[pathKey]) loadDir(pathKey, false);
  };

  const openFile = (filePath: string, opts?: { useSudo?: boolean }) => {
    const useSudo = !!opts?.useSudo;
    setFileLoadError(null);
    setTabSudoByPath((prev) => {
      const current = !!prev[filePath];
      if (current === useSudo) return prev;
      return { ...prev, [filePath]: useSudo };
    });
    if (openTabs.includes(filePath)) {
      setActiveTabPath(filePath);
      if ((tabSudoByPath[filePath] ?? false) !== useSudo) {
        setLoadingPath(filePath);
      }
    } else {
      setOpenTabs((prev) => [...prev, filePath]);
      setActiveTabPath(filePath);
      setLoadingPath(filePath);
    }
  };

  const collapseAll = () => {
    setOpenFolders(new Set(['.']));
  };

  // Load file when a new tab is opened (loadingPath set)
  useEffect(() => {
    if (!loadingPath) return;
    if (loadingPath === 'notes://general') {
      const content = localStorage.getItem('server-operator:general-notes') ?? '';
      setContentByPath((prev) => ({ ...prev, [loadingPath]: content }));
      setSavedContentByPath((prev) => ({ ...prev, [loadingPath]: content }));
      setFileLoadError(null);
      setLoadingPath(null);
      return;
    }
    if (loadingPath === 'notes://server') {
      const serverId = currentServer?.id || '';
      const content = serverId ? (localStorage.getItem(`server-operator:server-notes:${serverId}`) ?? '') : '';
      setContentByPath((prev) => ({ ...prev, [loadingPath]: content }));
      setSavedContentByPath((prev) => ({ ...prev, [loadingPath]: content }));
      setFileLoadError(null);
      setLoadingPath(null);
      return;
    }

    if (!currentServer || !window.serverOperator) return;
    setFileLoadError(null);
    window.serverOperator
      .readFile({ connection: currentServer, filePath: loadingPath, proxy, useSudo: !!tabSudoByPath[loadingPath] })
      .then((res) => {
        const content = res.content ?? '';
        if (res.ok) {
          setContentByPath((prev) => ({ ...prev, [loadingPath]: content }));
          setSavedContentByPath((prev) => ({ ...prev, [loadingPath]: content }));
          setFileLoadError(null);
        } else {
          setContentByPath((prev) => ({ ...prev, [loadingPath]: '' }));
          setFileLoadError(res.error || 'Failed to load file');
        }
      })
      .catch((err) => {
        const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : String(err ?? 'Failed to load file');
        setContentByPath((prev) => ({ ...prev, [loadingPath]: '' }));
        setFileLoadError(msg);
      })
      .finally(() => {
        setLoadingPath(null);
      });
  }, [loadingPath, currentServer?.id, tabSudoByPath]);

  const handleSaveFile = (filePath: string, content: string, opts?: { useSudo?: boolean }) => {
    if (filePath === 'notes://general') {
      localStorage.setItem('server-operator:general-notes', content);
      setSavedContentByPath((prev) => ({ ...prev, [filePath]: content }));
      window.dispatchEvent(new CustomEvent('notes-updated', { detail: { type: 'general', content } }));
      return Promise.resolve({ ok: true });
    }
    if (filePath === 'notes://server') {
      const serverId = currentServer?.id;
      if (!serverId) return Promise.resolve({ ok: false, error: 'No server connected' });
      localStorage.setItem(`server-operator:server-notes:${serverId}`, content);
      setSavedContentByPath((prev) => ({ ...prev, [filePath]: content }));
      window.dispatchEvent(new CustomEvent('notes-updated', { detail: { type: 'server', content } }));
      return Promise.resolve({ ok: true });
    }

    if (!currentServer || !window.serverOperator) return Promise.resolve({ ok: false, error: 'Not connected' });
    const useSudo = opts?.useSudo ?? !!tabSudoByPath[filePath];
    return window.serverOperator
      .writeFile({ connection: currentServer, filePath, content, proxy, useSudo })
      .then((res) => {
        if (res.ok) {
          setSavedContentByPath((prev) => ({ ...prev, [filePath]: content }));
        }
        return res;
      });
  };

  const buildPath = (name: string) => {
    const base = currentPath === '.' || currentPath === '' ? '' : currentPath;
    return base ? `${base}/${name}` : name;
  };

  /** Append a new file/folder to the current dir cache and tree (no SFTP refetch). */
  const appendToCurrentDirListing = (name: string, isDir: boolean) => {
    if (!currentServer) return;
    const pathKey = (currentPath || basePath || '.').trim() || '.';
    const cacheKey = `${currentServer.id}:${pathKey}`;
    const cached = dirCacheRef.current[cacheKey];
    const currentList = cached?.fileList?.trimEnd() ?? '';
    const perm = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
    const syntheticLine = `${perm} 1 0 0 0 Jan 1 00:00 ${name}`;
    const newFileList = currentList ? currentList + '\n' + syntheticLine : syntheticLine;
    dirCacheRef.current[cacheKey] = {
      fileList: newFileList,
      error: cached?.error ?? null,
    };
    setTreeListings((prev) => ({ ...prev, [pathKey]: newFileList }));
  };

  /** Remove a file/folder from the current dir cache so the tree updates instantly after delete. */
  const removeFromCurrentDirListing = (deletedPath: string) => {
    if (!currentServer) return;
    const pathKey = (currentPath || basePath || '.').trim() || '.';
    const cacheKey = `${currentServer.id}:${pathKey}`;
    const cached = dirCacheRef.current[cacheKey];
    if (!cached?.fileList) return;
    const nameToRemove = deletedPath.replace(/\/+$/, '').split('/').pop() ?? deletedPath;
    const lines = cached.fileList.trim().split('\n').filter((line) => {
      const parsed = parseLsLine(line);
      return !parsed || parsed.name !== nameToRemove;
    });
    const newFileList = lines.join('\n');
    dirCacheRef.current[cacheKey] = { fileList: newFileList, error: cached.error };
    setTreeListings((prev) => ({ ...prev, [pathKey]: newFileList }));
  };

  const createFileAtPath = async (filePath: string, opts?: { useSudo?: boolean }): Promise<{ ok: boolean; error?: string }> => {
    if (!currentServer || !window.serverOperator) return { ok: false, error: 'Not connected' };
    const normalized = (filePath || '').trim().replace(/^\.\/+/, '');
    if (!normalized) return { ok: false, error: 'Invalid path' };
    const useSudo = !!opts?.useSudo;
    const tabPath = normalized;
    const res = await window.serverOperator.writeFile({
      connection: currentServer,
      filePath: normalized,
      content: '',
      proxy,
      useSudo,
    });
    if (res.ok) {
      const currentDir = (currentPath === '.' || currentPath === '' ? '' : currentPath).replace(/\/+$/, '');
      const inCurrentDir = !tabPath.includes('/') || tabPath.slice(0, tabPath.lastIndexOf('/')) === currentDir;
      if (inCurrentDir) {
        appendToCurrentDirListing(tabPath.split('/').pop() || tabPath, false);
      }
      setOpenTabs((prev) => (prev.includes(tabPath) ? prev : [...prev, tabPath]));
      setActiveTabPath(tabPath);
      setTabSudoByPath((prev) => ({ ...prev, [tabPath]: useSudo }));
      setContentByPath((prev) => ({ ...prev, [tabPath]: '' }));
      setSavedContentByPath((prev) => ({ ...prev, [tabPath]: '' }));
    }
    return res;
  };

  const createFile = async (name: string): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = name.trim();
    const filePath = buildPath(trimmed);
    if (!filePath) return { ok: false, error: 'Invalid name' };
    return createFileAtPath(filePath, { useSudo: false });
  };

  const createFolder = async (name: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentServer || !window.serverOperator) return { ok: false, error: 'Not connected' };
    const trimmed = name.trim();
    const dirPath = buildPath(trimmed);
    if (!dirPath) return { ok: false, error: 'Invalid name' };
    const res = await window.serverOperator.mkdir({
      connection: currentServer,
      dirPath,
      proxy,
    });
    if (res.ok) appendToCurrentDirListing(trimmed, true);
    return res;
  };

  const handleUploadLocalFile = async () => {
    if (!currentServer) return;
    const api = window.serverOperator;
    if (!api?.uploadLocalFile) {
      setFilesError('Upload needs the desktop app (Electron with preload).');
      return;
    }
    setFilesError(null);
    setFileTransferBusy(true);
    try {
      const res = await api.uploadLocalFile({
        connection: currentServer,
        proxy,
        remoteDir: currentPath || '.',
      });
      if (res.canceled) return;
      if (!res.ok) {
        setFilesError(res.error || 'Upload failed');
        return;
      }
      loadDir(currentPath || '.', true);
    } finally {
      setFileTransferBusy(false);
    }
  };

  const handleDownloadRemoteFile = async (remoteFilePath: string) => {
    if (!currentServer) {
      return { ok: false, error: 'No server connected' };
    }
    const api = window.serverOperator;
    if (!api?.downloadRemoteFile) {
      return { ok: false, error: 'Download needs the desktop app (Electron with preload).' };
    }
    return api.downloadRemoteFile({
      connection: currentServer,
      proxy,
      remoteFilePath,
    });
  };

  const deleteEntry = async (path: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentServer || !window.serverOperator) return { ok: false, error: 'Not connected' };
    const pathEsc = path.replace(/'/g, "'\\''");
    const res = await window.serverOperator.runCommand({
      connection: currentServer,
      command: `rm -rf '${pathEsc}'`,
      cwd: currentServer.cwd,
      proxy,
    });
    const ok = res.ok && res.code === 0;
    if (ok) {
      removeFromCurrentDirListing(path);
      if (openTabs.includes(path)) closeTab(path);
      refreshAllTreeDirs();
    }
    return {
      ok,
      error: ok ? undefined : (res.error || res.stderr || 'Delete failed'),
    };
  };

  const runProjectShell = (command: string) => {
    if (!currentServer || !window.serverOperator) {
      return Promise.resolve({
        ok: false as const,
        code: 1,
        stdout: '',
        stderr: 'Not connected',
        error: 'Not connected',
      });
    }
    return window.serverOperator.runCommand({
      connection: currentServer,
      command,
      cwd: currentServer.cwd,
      proxy,
    });
  };

  const renamePathOnServer = async (oldPath: string, newName: string): Promise<{ ok: boolean; error?: string }> => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed.includes('/') || trimmed === '..') {
      return { ok: false, error: 'Invalid name' };
    }
    const slash = oldPath.lastIndexOf('/');
    const parent = slash >= 0 ? oldPath.slice(0, slash) : '';
    const newPath = parent ? `${parent}/${trimmed}` : trimmed;
    if (newPath === oldPath) return { ok: true };

    const newEsc = escapeShellSingleQuotes(newPath);
    const check = await runProjectShell(`if test -e '${newEsc}'; then echo exists; fi`);
    if (check.stdout?.includes('exists')) {
      return { ok: false, error: 'A file or folder with that name already exists' };
    }
    const oldEsc = escapeShellSingleQuotes(oldPath);
    const res = await runProjectShell(`mv '${oldEsc}' '${newEsc}'`);
    if (!res.ok || res.code !== 0) {
      return { ok: false, error: res.stderr || res.stdout || 'Rename failed' };
    }

    setOpenTabs((tabs) => tabs.map((p) => (p === oldPath ? newPath : p)));
    setContentByPath((prev) => {
      if (!(oldPath in prev)) return prev;
      const next = { ...prev };
      next[newPath] = next[oldPath];
      delete next[oldPath];
      return next;
    });
    setSavedContentByPath((prev) => {
      if (!(oldPath in prev)) return prev;
      const next = { ...prev };
      next[newPath] = next[oldPath];
      delete next[oldPath];
      return next;
    });
    setTabSudoByPath((prev) => {
      if (!(oldPath in prev)) return prev;
      const next = { ...prev };
      next[newPath] = next[oldPath];
      delete next[oldPath];
      return next;
    });
    setActiveTabPath((cur) => (cur === oldPath ? newPath : cur));
    refreshAllTreeDirs();
    return { ok: true };
  };

  const promptRenamePath = async (oldPath: string): Promise<{ ok: boolean; error?: string }> => {
    const base = oldPath.split('/').pop() || oldPath;
    const next = window.prompt('New name:', base);
    if (next == null) return { ok: true };
    const t = next.trim();
    if (!t) return { ok: false, error: 'Empty name' };
    if (t === base) return { ok: true };
    return renamePathOnServer(oldPath, t);
  };

  const duplicatePathOnServer = async (path: string, isDir: boolean): Promise<{ ok: boolean; error?: string }> => {
    const name = path.split('/').pop() || path;
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    let dupName: string;
    if (!isDir && name.includes('.') && name.lastIndexOf('.') > 0) {
      const d = name.lastIndexOf('.');
      dupName = `${name.slice(0, d)} (copy)${name.slice(d)}`;
    } else {
      dupName = `${name} (copy)`;
    }
    const newPath = parent ? `${parent}/${dupName}` : dupName;
    const newEsc = escapeShellSingleQuotes(newPath);
    const check = await runProjectShell(`if test -e '${newEsc}'; then echo exists; fi`);
    if (check.stdout?.includes('exists')) {
      return { ok: false, error: `"${dupName}" already exists. Rename or remove it first.` };
    }
    const pathEsc = escapeShellSingleQuotes(path);
    const res = await runProjectShell(`cp -a '${pathEsc}' '${newEsc}'`);
    if (!res.ok || res.code !== 0) {
      return { ok: false, error: res.stderr || res.stdout || 'Duplicate failed' };
    }
    refreshAllTreeDirs();
    return { ok: true };
  };

  const pasteIntoRemoteFolder = async (targetDir: string): Promise<{ ok: boolean; error?: string }> => {
    if (!currentServer || !window.serverOperator) return { ok: false, error: 'Not connected' };
    const clip = fileTreeClipboard;
    if (!clip || clip.serverId !== currentServer.id) {
      return { ok: false, error: 'Nothing to paste' };
    }
    const dir = (targetDir || '.').trim().replace(/\/+$/, '') || '.';
    const paths = [...clip.paths];

    for (const src of paths) {
      const parts = src.split('/').filter(Boolean);
      const base = parts.pop();
      if (!base) continue;
      const destRel = dir === '.' ? base : `${dir}/${base}`;

      if (clip.action === 'cut') {
        if (destRel === src) continue;
        if (dir === src || dir.startsWith(src + '/')) {
          return { ok: false, error: 'Cannot move a folder into itself or its subfolder' };
        }
      }

      const destEsc = escapeShellSingleQuotes(destRel);
      const chk = await runProjectShell(`if test -e '${destEsc}'; then echo exists; fi`);
      const exists = Boolean(chk.stdout?.includes('exists'));
      if (exists) {
        const okReplace = window.confirm(`Replace existing "${destRel}"?`);
        if (!okReplace) return { ok: false, error: 'Cancelled' };
        const rm = await runProjectShell(`rm -rf '${destEsc}'`);
        if (!rm.ok || rm.code !== 0) {
          return { ok: false, error: rm.stderr || rm.stdout || 'Could not remove existing item' };
        }
      }

      const srcEsc = escapeShellSingleQuotes(src);
      const dirEsc = escapeShellSingleQuotes(dir === '.' ? '.' : dir);
      const cmd = clip.action === 'copy' ? `cp -a '${srcEsc}' '${dirEsc}/'` : `mv '${srcEsc}' '${dirEsc}/'`;
      const res = await runProjectShell(cmd);
      if (!res.ok || res.code !== 0) {
        return { ok: false, error: res.stderr || res.stdout || 'Paste failed' };
      }

      if (clip.action === 'cut') {
        setOpenTabs((tabs) => tabs.map((p) => (p === src ? destRel : p)));
        setContentByPath((prev) => {
          if (!(src in prev)) return prev;
          const next = { ...prev };
          next[destRel] = next[src];
          delete next[src];
          return next;
        });
        setSavedContentByPath((prev) => {
          if (!(src in prev)) return prev;
          const next = { ...prev };
          next[destRel] = next[src];
          delete next[src];
          return next;
        });
        setTabSudoByPath((prev) => {
          if (!(src in prev)) return prev;
          const next = { ...prev };
          next[destRel] = next[src];
          delete next[src];
          return next;
        });
        setActiveTabPath((cur) => (cur === src ? destRel : cur));
      }
    }

    if (clip.action === 'cut') setFileTreeClipboard(null);
    refreshAllTreeDirs();
    return { ok: true };
  };

  const closeTab = (path: string) => {
    const closedIndex = openTabs.indexOf(path);
    const rest = openTabs.filter((p) => p !== path);
    const newActive = rest.length > 0 ? rest[Math.min(closedIndex, rest.length - 1)] : null;
    setOpenTabs(() => rest);
    setActiveTabPath(newActive);
    setContentByPath((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setSavedContentByPath((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    setTabSudoByPath((prev) => {
      if (!(path in prev)) return prev;
      const next = { ...prev };
      delete next[path];
      return next;
    });
    if (loadingPath === path) setLoadingPath(null);
    if (activeTabPath === path) setFileLoadError(null);
  };

  useEffect(() => {
    const onHashChange = () => setActiveView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setActiveViewAndRoute = (view: ViewId) => {
    setActiveView(view);
    window.location.hash = hashFromView(view);
  };

  const handleSelectGuideId = (id: string) => {
    setSelectedGuideId(id);
    if (activeView !== 'guide') {
      setActiveViewAndRoute('guide');
    }
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SERVERS, JSON.stringify(servers));
  }, [servers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROXY, JSON.stringify(proxy));
  }, [proxy]);

  useEffect(() => {
    if (window.serverOperator && window.serverOperator.setMonitoredServers) {
      window.serverOperator.setMonitoredServers({ servers, proxy });
    }
  }, [servers, proxy]);

  const setProxyAndRef = (next: ProxySettings | ((prev: ProxySettings) => ProxySettings)) => {
    if (typeof next === 'function') {
      setProxy((prev) => {
        const value = next(prev);
        proxyRef.current = value;
        return value;
      });
    } else {
      proxyRef.current = next; // so Connect sees it even before re-render
      setProxy(next);
    }
  };
  const addServer = (s: ServerConnection) => setServers((prev) => [...prev, s]);
  const updateServer = (id: string, patch: Partial<ServerConnection>) =>
    setServers((prev) =>
      prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
    );
  const removeServer = (id: string) => {
    setServers((prev) => prev.filter((x) => x.id !== id));
    if (currentServer?.id === id) setCurrentServer(null);
  };

  const handleSelectServer = (server: ServerConnection | null) => {
    setConnectionError(null);
    if (server === null || server.id === currentServer?.id) {
      setCurrentServer(null);
      return;
    }
    const api = typeof window !== 'undefined' ? window.serverOperator : null;
    if (!api?.testConnection) {
      setConnectionError('Connection API not available. Restart the app.');
      return;
    }
    const host = server.host?.trim();
    if (!host) {
      setConnectionError('Server host is required. Edit the server and set Host.');
      return;
    }
    if (!server.username?.trim()) {
      setConnectionError('SSH username is required. Edit the server and set Username.');
      return;
    }
    const isCloudflare = server.connectionType === 'cloudflare';
    const usePassword = !isCloudflare && (server.connectionType === 'password' || (server.password && server.password.length > 0));
    const useKey = !isCloudflare && !usePassword && server.privateKeyPath?.trim();
    if (!isCloudflare && !usePassword && !useKey) {
      setConnectionError('Set either SSH key path (EC2) or password for this server.');
      return;
    }
    connectCancelRef.current = false;
    setConnectingTo(server.id);
    setConnectingToServer(server);
    setConnectionError(null);
    const proxyToSend: ProxySettings = (() => {
      const p = { ...defaultProxy, ...loadProxy(), ...proxyRef.current };
      // When proxy is enabled, ensure host/port so backend never skips proxy due to empty values
      if (p.enabled) {
        if (!p.host?.trim()) p.host = '127.0.0.1';
        const portNum = Number(p.port);
        if (!Number.isFinite(portNum) || portNum <= 0) p.port = 9050;
      }
      return p;
    })();
    api
      .testConnection({ connection: server, proxy: proxyToSend })
      .then((res) => {
        if (connectCancelRef.current) return;
        setConnectingTo(null);
        setConnectingToServer(null);
        if (res.ok) {
          setCurrentServer(server);
          setActiveViewAndRoute('files');
        } else {
          setConnectionError(res.error || 'SSH connection failed');
        }
      })
      .catch((err: unknown) => {
        if (connectCancelRef.current) return;
        setConnectingTo(null);
        setConnectingToServer(null);
        const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : String(err ?? 'SSH connection failed');
        setConnectionError(msg);
      });
  };

  const cancelConnect = () => {
    connectCancelRef.current = true;
    setConnectingTo(null);
    setConnectingToServer(null);
  };

  return (
    <div className={`flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)] ${resizeDrag ? 'select-none' : ''}`}>
      <TitleBar
        currentServer={currentServer}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen((o) => !o)}
      />
      <div className="flex flex-1 min-h-0 min-w-0">
        <UpdateBanner />
        <ActivityBar
          activeView={activeView}
          onViewChange={setActiveViewAndRoute}
          sidebarOpen={sidebarOpen}
          onSidebarToggle={() => setSidebarOpen((o) => !o)}
          panelOpen={panelOpen}
          onPanelToggle={() => setPanelOpen((o) => !o)}
          currentServer={currentServer}
          onDisconnect={() => {
            setCurrentServer(null);
            setActiveViewAndRoute('servers');
          }}
        />
      <div
        style={{
          width: sidebarOpen && activeView !== 'settings' ? `${sidebarWidth}px` : '0px',
          transition: resizeDrag === 'sidebar' ? 'none' : 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className="flex flex-col shrink-0 bg-[var(--bg-secondary)] overflow-hidden"
      >
        <Sidebar
          activeView={activeView}
          servers={servers}
          currentServer={currentServer}
          connectingTo={connectingTo}
          connectionError={connectionError}
          onSelectServer={handleSelectServer}
          onRemoveServer={removeServer}
          onDismissError={() => setConnectionError(null)}
          selectedGuideId={selectedGuideId}
          onSelectGuideId={handleSelectGuideId}
          treeListings={treeListings}
          openFolders={openFolders}
          loadingPaths={loadingPaths}
          filesError={filesError}
          currentPath={currentPath}
          basePath={basePath}
          onToggleFolder={toggleFolder}
          onOpenFile={openFile}
          onLoadDir={loadDir}
          onCreateFile={createFile}
          onCreateFolder={createFolder}
          onDeleteEntry={deleteEntry}
          onCollapseAll={collapseAll}
          onMakeGitRepo={onMakeGitRepo}
          onAddAsProject={onAddAsProject}
          onAddToLogs={onAddToLogs}
          onUploadLocalFile={handleUploadLocalFile}
          uploadBusy={fileTransferBusy}
          fileTreeClipboard={fileTreeClipboard}
          onFileTreeCopyPaths={(paths) => {
            if (currentServer) setFileTreeClipboard({ serverId: currentServer.id, action: 'copy', paths });
          }}
          onFileTreeCutPaths={(paths) => {
            if (currentServer) setFileTreeClipboard({ serverId: currentServer.id, action: 'cut', paths });
          }}
          onFileTreePasteInto={pasteIntoRemoteFolder}
          onFileTreeRenamePath={promptRenamePath}
          onFileTreeDuplicatePath={duplicatePathOnServer}
          onFileTreeActionMessage={setFilesError}
        />
      </div>
      <div
        role="separator"
        style={{
          opacity: sidebarOpen && activeView !== 'settings' ? 1 : 0,
          pointerEvents: sidebarOpen && activeView !== 'settings' ? 'auto' : 'none',
          width: sidebarOpen && activeView !== 'settings' ? '1px' : '0px',
          transition: resizeDrag === 'sidebar' ? 'none' : 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className="shrink-0 cursor-col-resize bg-[var(--border)] hover:bg-[var(--accent)]/50"
        onMouseDown={(e) => {
          resizeStartRef.current = { x: e.clientX, y: 0, w: sidebarWidth, h: 0 };
          setResizeDrag('sidebar');
        }}
      />
      <div className="flex flex-1 flex-col min-w-0 min-h-0 relative">
        {connectingToServer && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[var(--bg-primary)]/95 backdrop-blur-sm">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-6 flex flex-col items-center gap-4 shadow-xl">
              <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              <p className="text-[var(--text-primary)] font-medium">Connecting to {connectingToServer.name} via SSH…</p>
              <p className="text-sm text-[var(--text-secondary)]">{connectingToServer.host} ({connectingToServer.username})</p>
              {proxy?.enabled && connectingToServer.useProxy !== false && (
                <p className="text-xs text-[var(--text-secondary)]">Via proxy — can take a minute</p>
              )}
              <button
                type="button"
                onClick={cancelConnect}
                className="mt-2 px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {connectionError && !currentServer && (
          <div className="absolute top-0 left-0 right-0 z-10 mx-4 mt-4 rounded-lg border-2 border-[var(--error)] bg-[var(--error)]/60 px-4 py-4 shadow-lg">
            <p className="text-[var(--text-primary)] font-semibold">SSH connection failed</p>
            <p className="text-sm text-[var(--text-primary)] mt-1 whitespace-pre-wrap break-words">{connectionError}</p>
            {proxy?.enabled && /Proxy|proxy|ECONNREFUSED|timed out|Tor/i.test(connectionError) && (
              <p className="text-xs text-[var(--text-secondary)] mt-2">Tip: If using Tor, ensure it is running (e.g. port 9050) and the server is reachable via Tor.</p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setConnectionError(null)}
                className="px-3 py-1.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-sm hover:bg-[var(--border)]"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 flex min-h-0 min-w-0">
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {activeView === 'settings' ? (
              <SettingsView />
            ) : (activeView === 'guide' || currentServer) ? (
              <EditorArea
                currentServer={currentServer}
                servers={servers}
                onSelectServer={setCurrentServer}
                activeView={activeView}
                proxy={proxy}
                selectedGuideId={selectedGuideId}
                onPanelTab={setPanelTab}
                onPanelOpen={() => setPanelOpen(true)}
                onOpenTerminalAndRun={openTerminalAndRun}
                serverSysInfo={serverSysInfo}
                serverStatusLoading={serverStatusLoading}
                onRefreshServerStatus={refreshServerStatus}
                onViewChange={setActiveViewAndRoute}
                openTabs={openTabs}
                activeTabPath={activeTabPath}
                contentByPath={contentByPath}
                savedContentByPath={savedContentByPath}
                onContentChange={(path: string, content: string) =>
                  setContentByPath((prev) => ({ ...prev, [path]: content }))
                }
                loadingPath={loadingPath}
                fileLoadError={fileLoadError}
                currentPath={currentPath}
                basePath={basePath}
                onSaveFile={handleSaveFile}
                onOpenFileByPath={openFile}
                onCreateFileByPath={createFileAtPath}
                activeTabUsesSudo={activeTabPath ? !!tabSudoByPath[activeTabPath] : false}
                onDownloadRemoteFile={handleDownloadRemoteFile}
                onCloseTab={closeTab}
                onSelectTab={(path: string) => {
                  setActiveTabPath(path);
                  setFileLoadError(null);
                }}
                composePaths={composePaths}
                dockerContainers={dockerContainers}
                dockerLoading={dockerLoading}
                dockerError={dockerError}
                setDockerError={setDockerError}
                dockerServicesByPath={dockerServicesByPath}
                dockerServicesLoading={dockerServicesLoading}
                onRefreshDocker={refreshDocker}
                projectRepos={repos}
                projectTreeListings={repoTreeListings}
                bottomPanelOpen={panelOpen}
                bottomPanelTab={panelTab}
              />
            ) : (
              <NoServerView
                servers={servers}
                proxy={proxy}
                connectingTo={connectingTo}
                connectionError={connectionError}
                onAddServer={addServer}
                onUpdateServer={updateServer}
                onRemoveServer={removeServer}
                onSelectServer={handleSelectServer}
                onProxyChange={setProxyAndRef}
                onDismissError={() => setConnectionError(null)}
                onViewGuide={handleSelectGuideId}
              />
            )}
          </div>
          {currentServer && activeView === 'files' && (
            <>
              <div
                role="separator"
                className="w-1 shrink-0 cursor-col-resize bg-[var(--border)] hover:bg-[var(--accent)]/50 transition-colors"
                onMouseDown={(e) => {
                  resizeStartRef.current = { x: e.clientX, y: 0, w: rightPanelWidth, h: 0 };
                  setResizeDrag('rightPanel');
                }}
              />
              <div style={{ width: rightPanelWidth }} className="shrink-0 flex flex-col min-h-0 border-l border-[var(--border)]">
                <RepoSidebar
                  repos={repos}
                  selectedRepoPath={selectedRepoPath}
                  currentServer={currentServer}
                  onSelectRepo={setSelectedRepoPath}
                  onRemoveRepo={removeRepo}
                  repoTreeListings={repoTreeListings}
                  repoOpenFolders={repoOpenFolders}
                  repoLoadingPaths={repoLoadingPaths}
                  repoCurrentPath={selectedRepoPath ? (repoCurrentPathByRepo[selectedRepoPath] ?? '.') : '.'}
                  repoBrowseDirForPaste={
                    selectedRepoPath
                      ? (() => {
                          const rel = repoCurrentPathByRepo[selectedRepoPath] ?? '.';
                          return rel === '.' ? selectedRepoPath : `${selectedRepoPath}/${rel}`;
                        })()
                      : '.'
                  }
                  onToggleRepoFolder={toggleRepoFolder}
                  loadRepoDir={loadRepoDir}
                  onOpenFile={openFile}
                  onCreateFile={createFileInRepo}
                  onCreateFolder={createFolderInRepo}
                  onDeleteEntry={deleteEntryInRepo}
                  onCollapseRepo={collapseRepo}
                  basePath={basePath}
                  fileTreeClipboard={fileTreeClipboard}
                  onFileTreeCopyPaths={(paths) => {
                    if (currentServer) setFileTreeClipboard({ serverId: currentServer.id, action: 'copy', paths });
                  }}
                  onFileTreeCutPaths={(paths) => {
                    if (currentServer) setFileTreeClipboard({ serverId: currentServer.id, action: 'cut', paths });
                  }}
                  onFileTreePasteInto={pasteIntoRemoteFolder}
                  onFileTreeRenamePath={promptRenamePath}
                  onFileTreeDuplicatePath={duplicatePathOnServer}
                  onFileTreeActionMessage={setFilesError}
                />
              </div>
            </>
          )}
        </div>
        {currentServer && (
          <>
            {panelOpen && (
              <div
                role="separator"
                className="h-1.5 shrink-0 cursor-row-resize bg-[var(--border)] hover:bg-[var(--accent)]/50 transition-colors"
                onMouseDown={(e) => {
                  resizeStartRef.current = { x: 0, y: e.clientY, w: 0, h: panelHeight };
                  setResizeDrag('panel');
                }}
              />
            )}
            <div
              style={{
                height: panelOpen ? `${panelHeight}px` : '0px',
                transition: resizeDrag === 'panel' ? 'none' : 'height 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              className="shrink-0 flex flex-col min-h-0 overflow-hidden"
            >
              <Panel
                currentServer={currentServer}
                proxy={proxy}
                panelTab={panelTab}
                onTabChange={setPanelTab}
                composePaths={composePaths}
                onAddComposePath={addComposePath}
                onRemoveComposePath={removeComposePath}
                pendingTerminalCommand={pendingTerminalCommand}
                pendingTerminalLabel={pendingTerminalLabel}
                onClearPendingTerminalCommand={() => {
                  setPendingTerminalCommand(null);
                  setPendingTerminalLabel(null);
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  </div>
  );
}
