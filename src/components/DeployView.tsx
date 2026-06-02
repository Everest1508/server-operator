import { useState, useRef, useEffect } from 'react';
import { Rocket, Loader2, Key, FileCode, FolderTree, Send, Sparkles, Play, ChevronDown, Server, Copy, Wand2, GitBranch, RefreshCw } from 'lucide-react';
import EyeIcon from './icons/EyeIcon';
import EyeOffIcon from './icons/EyeOffIcon';
import { useFeatureFlag } from '../contexts/FeatureFlagContext';
import type { ServerConnection, ProxySettings } from '../types';
import { loadProjectContext } from '../utils/loadProjectContext';
import { parseLsLine } from '../utils/parseLs';
import { ConfigCreators } from './ConfigCreators';
import { ProjectTerminal } from './ProjectTerminal';
import { ServerToolsView } from './ServerToolsView';
import { Select } from './Select';

const GROQ_API_KEY_STORAGE = 'server-operator:groq-api-key';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function loadGroqApiKey(): string {
  try {
    return localStorage.getItem(GROQ_API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

function saveGroqApiKey(key: string) {
  try {
    localStorage.setItem(GROQ_API_KEY_STORAGE, key);
  } catch {
    // ignore
  }
}

function buildServerContext(
  server: ServerConnection,
  currentPath: string,
  basePath: string | undefined,
  activeFilePath: string | null | undefined
 ): string {
  const projectRoot = server.projectPath || server.cwd || basePath || '.';
  const workingDir =
    !currentPath || currentPath === '.' ? projectRoot : projectRoot.replace(/\/$/, '') + '/' + currentPath.replace(/^\.\/?/, '');
  const lines: string[] = [
    `Server: ${server.name} (${server.host})`,
    `Project root on server: ${projectRoot}`,
    `Current working directory (folder user is in): ${workingDir}`,
  ];
  if (activeFilePath && activeFilePath.trim()) {
    lines.push(`Current file open: ${activeFilePath}`);
  }
  return lines.join('. ');
}

function buildDeploySystemMessage(serverContext: string, extraContext: string): string {
  let sys = `You are a DevOps assistant. The user is connected to a Linux server and has this context:

${serverContext}`;
  if (extraContext.trim()) {
    sys += `\n\nAdditional context (e.g. project tree):\n${extraContext.trim()}`;
  }
  sys += `

Your task: convert the user's request into a single shell command that fits this context.
- Commands should run in or reference the current working directory when relevant.
- If they mention a file or folder, use the current working directory or current file from the context.
- Use docker compose when relevant (restart service, logs, etc.). Use the project/working directory for compose files if needed.
- Reply with ONLY the command: no markdown, no explanation, no extra quotes. One command; chain steps with && if needed.`;
  return sys;
}

interface SeropShortcut {
  id: string;
  name: string;
  command: string;
  sourceLine: number;
}

function joinRemotePath(base: string, next: string): string {
  const normalizedBase = (base || '').trim().replace(/\/+$/, '');
  const normalizedNext = (next || '').trim().replace(/^\/+/, '');
  if (!normalizedNext) return normalizedBase || '.';
  if (!normalizedBase || normalizedBase === '.') return normalizedNext;
  return `${normalizedBase}/${normalizedNext}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const STARTER_SEROP_FILES: Array<{ name: string; content: string }> = [
  {
    name: 'deploy.serop',
    content: `[Deploy app]
git pull
docker compose up -d --build

[Restart api]
docker compose restart api

Quick logs = docker compose logs --tail=100 api
`,
  },
  {
    name: 'ops.serop',
    content: `[Health check]
docker compose ps
docker compose logs --tail=80

[Restart all]
docker compose restart
`,
  },
];

function buildSeropAgentPrompt(projectPath: string): string {
  const safeProject = (projectPath || '.').trim() || '.';
  return `Create shortcut files for Server Operator in this project path: ${safeProject}

Requirements:
- Create folder: ${safeProject}/.server-operator
- Create/update these files exactly:

1) ${safeProject}/.server-operator/deploy.serop
${STARTER_SEROP_FILES[0].content.trim()}

2) ${safeProject}/.server-operator/ops.serop
${STARTER_SEROP_FILES[1].content.trim()}

Use shell commands and keep file names ending in .serop.`;
}

function parseSeropShortcuts(content: string): { shortcuts: SeropShortcut[]; warning?: string } {
  const lines = content.split(/\r?\n/);
  const shortcuts: SeropShortcut[] = [];
  let currentSectionName = '';
  let currentSectionCommands: string[] = [];
  let currentSectionLine = 1;

  const flushSection = () => {
    const commands = currentSectionCommands.map((line) => line.trim()).filter(Boolean);
    if (!commands.length) return;
    const index = shortcuts.length + 1;
    shortcuts.push({
      id: `shortcut-${index}-${currentSectionLine}`,
      name: currentSectionName || `Shortcut ${index}`,
      command: commands.join(' && '),
      sourceLine: currentSectionLine,
    });
    currentSectionName = '';
    currentSectionCommands = [];
  };

  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;

    const section = trimmed.match(/^\[([^\]]+)\]$/);
    if (section) {
      flushSection();
      currentSectionName = section[1].trim();
      currentSectionLine = lineNo;
      return;
    }

    if (!currentSectionName && currentSectionCommands.length === 0) {
      const inlinePair = trimmed.match(/^([^:=]+?)\s*[:=]\s*(.+)$/);
      if (inlinePair) {
        const index = shortcuts.length + 1;
        shortcuts.push({
          id: `shortcut-${index}-${lineNo}`,
          name: inlinePair[1].trim(),
          command: inlinePair[2].trim(),
          sourceLine: lineNo,
        });
        return;
      }
    }

    if (!currentSectionName && currentSectionCommands.length === 0) {
      currentSectionLine = lineNo;
      currentSectionName = `Shortcut ${shortcuts.length + 1}`;
    }
    currentSectionCommands.push(trimmed);
  });

  flushSection();
  if (shortcuts.length === 0) {
    return {
      shortcuts: [],
      warning:
        'No shortcuts found. Use [Shortcut Name] sections followed by one or more command lines.',
    };
  }
  return { shortcuts };
}

async function suggestCommandWithGroq(
  apiKey: string,
  conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  serverContext: string,
  extraContext: string
): Promise<{ command: string; error?: string }> {
  const systemContent = buildDeploySystemMessage(serverContext, extraContext);
  const messages = [
    { role: 'system' as const, content: systemContent },
    ...conversationMessages,
  ];
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 256,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { command: '', error: `Groq API error: ${res.status} ${err}` };
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  return { command: text.replace(/^`+|`+$/g, '').trim(), error: text ? undefined : 'No command returned' };
}

interface DeployViewProps {
  currentServer: ServerConnection;
  servers?: ServerConnection[];
  onSelectServer?: (server: ServerConnection) => void;
  proxy: ProxySettings;
  onOpenPanel: () => void;
  /** Current folder in the file tree (e.g. "." or "src/app") */
  currentPath?: string;
  /** Base path on server (e.g. project root) */
  basePath?: string;
  /** Currently open file path (e.g. "docker-compose.yml") */
  activeFilePath?: string | null;
  /** Project paths added by right-click "Add as project" */
  projectRepos?: string[];
  /** Cached repo tree listings (key "repoPath:pathKey") */
  projectTreeListings?: Record<string, string>;
  /** Open panel terminal and run a command (e.g. cd to project then run) */
  onOpenTerminalAndRun?: (command: string, label?: string) => void;
  bottomPanelOpen?: boolean;
  bottomPanelTab?: 'logs' | 'terminal';
}

const hasServerOperator = typeof window !== 'undefined' && typeof window.serverOperator?.deploy === 'function';

type DeploySubTab = 'deploy' | 'creators' | 'server' | 'pipeline';

export function DeployView({
  currentServer,
  servers = [],
  onSelectServer,
  proxy,
  onOpenPanel: _onOpenPanel,
  currentPath = '.',
  basePath,
  activeFilePath,
  projectRepos = [],
  projectTreeListings = {},
  onOpenTerminalAndRun: _onOpenTerminalAndRun,
  bottomPanelOpen = false,
  bottomPanelTab = 'logs',
}: DeployViewProps) {
  const [deploySubTab, setDeploySubTab] = useState<DeploySubTab>('deploy');
  const isPipelineEnabled = useFeatureFlag('deployPipeline');
  const isCreatorsEnabled = useFeatureFlag('configCreators');
  const isServerEnabled = useFeatureFlag('serverAdmin');
  const isShortcutsEnabled = useFeatureFlag('shortcuts');
  const isAiEnabled = useFeatureFlag('aiAssistant');

  useEffect(() => {
    if (deploySubTab === 'pipeline' && !isPipelineEnabled) {
      setDeploySubTab('deploy');
    } else if (deploySubTab === 'creators' && !isCreatorsEnabled) {
      setDeploySubTab('deploy');
    } else if (deploySubTab === 'server' && !isServerEnabled) {
      setDeploySubTab('deploy');
    }
  }, [deploySubTab, isPipelineEnabled, isCreatorsEnabled, isServerEnabled]);

  const showRightPanel =
    deploySubTab === 'pipeline' ||
    deploySubTab === 'server' ||
    (deploySubTab === 'deploy' && (isShortcutsEnabled || isAiEnabled));
  const [command, setCommand] = useState('');
  const [groqApiKey, setGroqApiKey] = useState(loadGroqApiKey);
  const [deployChatMessages, setDeployChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [deployContextText, setDeployContextText] = useState('');
  const [deployContextCollapsed, setDeployContextCollapsed] = useState(false);
  const [contextAccordionOpen, setContextAccordionOpen] = useState(false);
  const [selectedDeployProjectPath, setSelectedDeployProjectPath] = useState('');
  const [loadingDeployContext, setLoadingDeployContext] = useState(false);
  const [deploySplitPercent, setDeploySplitPercent] = useState(65);
  const [deployResizing, setDeployResizing] = useState(false);
  const deployResizeStartRef = useRef({ x: 0, percent: 65 });
  const runCommandInTerminalRef = useRef<((cmd: string) => void) | null>(null);
  const [aiRequest, setAiRequest] = useState('');
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showGroqKey, setShowGroqKey] = useState(false);

  // Pipeline form states
  const [pipelineProjDir, setPipelineProjDir] = useState(currentServer?.projectPath || currentServer?.cwd || '');
  const [pipelineBranch, setPipelineBranch] = useState('main');
  const [pipelineDepType, setPipelineDepType] = useState<'auto' | 'npm' | 'pip' | 'none'>('auto');
  const [pipelineMigType, setPipelineMigType] = useState<'auto' | 'npm' | 'pip' | 'none'>('auto');
  const [pipelineRestartType, setPipelineRestartType] = useState<'pm2' | 'systemd' | 'none'>('none');
  const [pipelineServiceName, setPipelineServiceName] = useState('');
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployHistory, setDeployHistory] = useState<any[]>([]);
  const [expandedDeployId, setExpandedDeployId] = useState<number | null>(null);
  const terminalShellIdRef = useRef<string | null>(null);

  const fetchDeployHistory = async () => {
    if (!pipelineProjDir.trim() || !window.serverOperator) return;
    try {
      const rows = await window.serverOperator.getDeployHistory({
        serverId: currentServer.id,
        projectDir: pipelineProjDir.trim(),
      });
      setDeployHistory(rows || []);
    } catch (e) {
      console.error('Failed to fetch deployment history:', e);
    }
  };

  useEffect(() => {
    setPipelineProjDir(currentServer?.projectPath || currentServer?.cwd || '');
  }, [currentServer?.id]);

  useEffect(() => {
    fetchDeployHistory();
  }, [currentServer?.id, pipelineProjDir]);

  const [selectedShortcutsProjectPath, setSelectedShortcutsProjectPath] = useState('');
  const [shortcutFiles, setShortcutFiles] = useState<string[]>([]);
  const [selectedShortcutFile, setSelectedShortcutFile] = useState('');
  const [shortcutsLoading, setShortcutsLoading] = useState(false);
  const [shortcutsError, setShortcutsError] = useState<string | null>(null);
  const [shortcutsWarning, setShortcutsWarning] = useState<string | null>(null);
  const [seropShortcuts, setSeropShortcuts] = useState<SeropShortcut[]>([]);
  const [shortcutBootstrapBusy, setShortcutBootstrapBusy] = useState(false);
  const [shortcutBootstrapMessage, setShortcutBootstrapMessage] = useState<string | null>(null);
  const [shortcutBootstrapError, setShortcutBootstrapError] = useState<string | null>(null);
  const [shortcutsRefreshToken, setShortcutsRefreshToken] = useState(0);

  const handleSaveGroqKey = () => {
    saveGroqApiKey(groqApiKey);
  };

  const serverContextSummary = buildServerContext(currentServer, currentPath, basePath, activeFilePath);

  const onSelectDeployProjectForContext = async (projectPath: string) => {
    setSelectedDeployProjectPath(projectPath);
    if (!projectPath || !window.serverOperator) {
      if (!projectPath) setDeployContextText('');
      return;
    }
    setLoadingDeployContext(true);
    setAiError(null);
    try {
      const { context, error } = await loadProjectContext(
        currentServer,
        projectPath,
        proxy?.enabled ? proxy : undefined,
        { listDir: window.serverOperator.listDir.bind(window.serverOperator), readFile: window.serverOperator.readFile.bind(window.serverOperator) }
      );
      if (error) {
        setAiError(error);
        return;
      }
      setDeployContextText(context);
    } finally {
      setLoadingDeployContext(false);
    }
  };

  const sendDeployMessage = async () => {
    const key = groqApiKey.trim();
    if (!key) {
      setAiError('Enter your Groq API key first (get one at console.groq.com)');
      return;
    }
    const userContent = aiRequest.trim();
    if (!userContent) {
      setAiError('Describe what you want to do (e.g. restart api container, show logs)');
      return;
    }
    setAiError(null);
    setAiRequest('');
    const newUserMessage = { role: 'user' as const, content: userContent };
    setDeployChatMessages((prev) => [...prev, newUserMessage]);
    setAiSuggesting(true);
    try {
      const messagesForApi = [...deployChatMessages, newUserMessage];
      const { command: suggested, error } = await suggestCommandWithGroq(
        key,
        messagesForApi,
        serverContextSummary,
        deployContextText
      );
      if (error) {
        setAiError(error);
        setDeployChatMessages((prev) => prev.slice(0, -1));
        return;
      }
      saveGroqApiKey(key);
      if (suggested) setCommand(suggested);
      setDeployChatMessages((prev) => [...prev, { role: 'assistant', content: suggested || '(no command)' }]);
    } finally {
      setAiSuggesting(false);
    }
  };

  const runCwd = selectedDeployProjectPath?.trim() || currentServer.projectPath || currentServer.cwd || '';
  const shortcutsProjectPath =
    selectedShortcutsProjectPath.trim() ||
    selectedDeployProjectPath.trim() ||
    currentServer.projectPath ||
    currentServer.cwd ||
    '';
  const seropFolderPath = joinRemotePath(shortcutsProjectPath || '.', '.server-operator');

  const executeInLeftTerminal = (cmd?: string) => {
    const toRun = (cmd ?? command).trim();
    if (!toRun) return;
    runCommandInTerminalRef.current?.(toRun);
  };

  const handleStartDeployment = async () => {
    if (!pipelineProjDir.trim() || !window.serverOperator || !terminalShellIdRef.current) return;

    setDeploying(true);
    try {
      await window.serverOperator.runDeployPipeline({
        connection: currentServer,
        shellId: terminalShellIdRef.current,
        projectDir: pipelineProjDir.trim(),
        branch: pipelineBranch,
        depType: pipelineDepType,
        migType: pipelineMigType,
        restartType: pipelineRestartType,
        serviceName: pipelineServiceName,
        proxy: proxy?.enabled ? proxy : undefined,
      });

      fetchDeployHistory();
    } catch (err) {
      console.error('Deployment error:', err);
    } finally {
      setDeploying(false);
    }
  };

  const handleRollback = async (commitHash: string) => {
    if (!pipelineProjDir.trim() || !window.serverOperator || !terminalShellIdRef.current) return;

    setDeploying(true);
    try {
      await window.serverOperator.rollbackDeploy({
        connection: currentServer,
        shellId: terminalShellIdRef.current,
        projectDir: pipelineProjDir.trim(),
        commitHash,
        restartType: pipelineRestartType,
        serviceName: pipelineServiceName,
        proxy: proxy?.enabled ? proxy : undefined,
      });

      fetchDeployHistory();
    } catch (err) {
      console.error('Rollback error:', err);
    } finally {
      setDeploying(false);
    }
  };

  const handleCopyShortcutBootstrapPrompt = async () => {
    const prompt = buildSeropAgentPrompt(shortcutsProjectPath || '.');
    const ok = await copyToClipboard(prompt);
    if (ok) {
      setShortcutBootstrapError(null);
      setShortcutBootstrapMessage('AI setup prompt copied.');
      setTimeout(() => setShortcutBootstrapMessage((msg) => (msg === 'AI setup prompt copied.' ? null : msg)), 2000);
      return;
    }
    setShortcutBootstrapError('Failed to copy prompt to clipboard.');
  };

  const handleCreateStarterShortcuts = async () => {
    if (!window.serverOperator) return;
    if (!shortcutsProjectPath) {
      setShortcutBootstrapError('Set a project path first so files can be created in the right folder.');
      return;
    }
    setShortcutBootstrapBusy(true);
    setShortcutBootstrapError(null);
    setShortcutBootstrapMessage(null);
    try {
      const mkdirRes = await window.serverOperator.mkdir({
        connection: currentServer,
        dirPath: seropFolderPath,
        proxy: proxy?.enabled ? proxy : undefined,
      });
      if (!mkdirRes.ok) {
        setShortcutBootstrapError(mkdirRes.error || `Failed to create ${seropFolderPath}`);
        return;
      }

      for (const file of STARTER_SEROP_FILES) {
        const writeRes = await window.serverOperator.writeFile({
          connection: currentServer,
          filePath: joinRemotePath(seropFolderPath, file.name),
          content: file.content,
          proxy: proxy?.enabled ? proxy : undefined,
        });
        if (!writeRes.ok) {
          setShortcutBootstrapError(writeRes.error || `Failed to write ${file.name}`);
          return;
        }
      }

      setShortcutBootstrapMessage(`Created ${STARTER_SEROP_FILES.length} starter .serop files in ${seropFolderPath}.`);
      setShortcutsRefreshToken((n) => n + 1);
    } finally {
      setShortcutBootstrapBusy(false);
    }
  };

  const loadSeropFile = async (projectPath: string, fileName: string) => {
    if (!window.serverOperator || !projectPath || !fileName) return;
    setShortcutsLoading(true);
    setShortcutsError(null);
    setShortcutsWarning(null);
    setSeropShortcuts([]);
    try {
      const folderPath = joinRemotePath(projectPath, '.server-operator');
      const fullFilePath = joinRemotePath(folderPath, fileName);
      const res = await window.serverOperator.readFile({
        connection: currentServer,
        filePath: fullFilePath,
        proxy: proxy?.enabled ? proxy : undefined,
      });
      if (!res.ok) {
        setShortcutsError(res.error || `Failed to read ${fileName}`);
        return;
      }
      const parsed = parseSeropShortcuts(res.content || '');
      setSeropShortcuts(parsed.shortcuts);
      setShortcutsWarning(parsed.warning || null);
    } finally {
      setShortcutsLoading(false);
    }
  };

  useEffect(() => {
    if (!window.serverOperator || !shortcutsProjectPath) {
      setShortcutFiles([]);
      setSelectedShortcutFile('');
      setSeropShortcuts([]);
      setShortcutsError(null);
      setShortcutsWarning(null);
      return;
    }

    let cancelled = false;
    const loadSeropFiles = async () => {
      setShortcutsLoading(true);
      setShortcutsError(null);
      setShortcutsWarning(null);
      setSeropShortcuts([]);
      try {
        const folderPath = joinRemotePath(shortcutsProjectPath, '.server-operator');
        const listRes = await window.serverOperator.listDir({
          connection: currentServer,
          dirPath: folderPath,
          proxy: proxy?.enabled ? proxy : undefined,
        });
        if (cancelled) return;
        if (!listRes.ok || !listRes.stdout) {
          setShortcutFiles([]);
          setSelectedShortcutFile('');
          setShortcutsWarning(
            `No shortcut folder found at ${folderPath}. Create it and add .serop files.`
          );
          return;
        }

        const files = listRes.stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => parseLsLine(line))
          .filter((entry): entry is { isDir: boolean; name: string } => !!entry && !entry.isDir)
          .map((entry) => entry.name)
          .filter((name) => name.toLowerCase().endsWith('.serop'))
          .sort((a, b) => a.localeCompare(b));

        setShortcutFiles(files);
        if (!files.length) {
          setSelectedShortcutFile('');
          setShortcutsWarning('No .serop files found in .server-operator folder.');
          return;
        }

        const preferred = files.includes(selectedShortcutFile) ? selectedShortcutFile : files[0];
        setSelectedShortcutFile(preferred);
        await loadSeropFile(shortcutsProjectPath, preferred);
      } finally {
        if (!cancelled) setShortcutsLoading(false);
      }
    };

    void loadSeropFiles();
    return () => {
      cancelled = true;
    };
  }, [currentServer.id, proxy?.enabled, proxy?.host, proxy?.port, shortcutsProjectPath, shortcutsRefreshToken]);

  useEffect(() => {
    if (!deployResizing) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - deployResizeStartRef.current.x;
      const container = document.querySelector('[data-deploy-split]');
      const w = container?.getBoundingClientRect().width ?? 800;
      const deltaPercent = (delta / w) * 100;
      const next = Math.min(75, Math.max(25, deployResizeStartRef.current.percent + deltaPercent));
      setDeploySplitPercent(next);
      deployResizeStartRef.current = { x: e.clientX, percent: next };
    };
    const onUp = () => setDeployResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [deployResizing]);

  if (!hasServerOperator) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center bg-bg-primary text-text-secondary p-8 text-center min-h-0 select-none">
        <Rocket size={48} className="mb-4 opacity-50 text-accent animate-pulse" />
        <p className="font-semibold text-text-primary text-sm">Deployment Modules</p>
        <p className="text-xs text-text-muted mt-2 max-w-sm">Please launch Server Operator within Electron dev builds to execute secure remote terminal pipeline builds.</p>
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col bg-bg-primary min-h-0">
      {/* Top Tabs */}
      <div className="flex bg-bg-secondary/35 border-b border-border/20 px-3 py-1.5 gap-1 shrink-0 select-none">
        <button
          type="button"
          onClick={() => setDeploySubTab('deploy')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer ${
            deploySubTab === 'deploy'
              ? 'bg-bg-primary border-border/40 text-accent font-semibold shadow-sm'
              : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
          }`}
        >
          <Rocket size={13} />
          Terminal Shell
        </button>

        {isPipelineEnabled && (
          <button
            type="button"
            onClick={() => setDeploySubTab('pipeline')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer ${
              deploySubTab === 'pipeline'
                ? 'bg-bg-primary border-border/40 text-accent font-semibold shadow-sm'
                : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
            }`}
          >
            <GitBranch size={13} />
            Git Pipeline
          </button>
        )}
  
        {isCreatorsEnabled && (
          <button
            type="button"
            onClick={() => setDeploySubTab('creators')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer ${
              deploySubTab === 'creators'
                ? 'bg-bg-primary border-border/40 text-accent font-semibold shadow-sm'
                : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
            }`}
          >
            <FileCode size={13} />
            Config Creators
          </button>
        )}
        {isServerEnabled && (
          <button
            type="button"
            onClick={() => setDeploySubTab('server')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer ${
              deploySubTab === 'server'
                ? 'bg-bg-primary border-border/40 text-accent font-semibold shadow-sm'
                : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
            }`}
          >
            <Server size={13} />
            Server Admin
          </button>
        )}
      </div>
  
      {/* Content: Config creators when that sub-tab is selected */}
      {deploySubTab === 'creators' && (
        <div className="flex-1 flex flex-col min-h-0">
          <ConfigCreators
            currentServer={currentServer}
            proxy={proxy}
            projectRepos={projectRepos}
            projectTreeListings={projectTreeListings}
          />
        </div>
      )}

      {/* Terminal (left) + Server tools (right) */}
      <div
        className="flex-grow flex flex-col min-h-0 overflow-hidden"
        style={{ display: deploySubTab === 'deploy' || deploySubTab === 'server' || deploySubTab === 'pipeline' ? 'flex' : 'none' }}
      >
        <div data-deploy-split className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          {/* Left: Terminal */}
          <div
            style={{
              flex: showRightPanel ? `0 0 ${deploySplitPercent}%` : '1 1 100%',
              minWidth: 200,
              maxWidth: !showRightPanel ? '100%' : (deploySplitPercent === 100 ? '100%' : undefined),
            }}
            className="flex flex-col min-h-0 border-r border-border/20 bg-bg-primary overflow-hidden"
          >
            <div className="shrink-0 px-3.5 py-2 border-b border-border/20 bg-bg-secondary/45 select-none">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                Active SSH Stream {deploySubTab === 'pipeline' ? (pipelineProjDir ? `· ${pipelineProjDir}` : '') : (runCwd ? `· ${runCwd}` : '')}
              </span>
            </div>
   
            <ProjectTerminal
              currentServer={currentServer}
              proxy={proxy}
              projectPath={deploySubTab === 'pipeline' ? pipelineProjDir : runCwd}
              disabled={deploying}
              onReady={(runCommand, shellId) => {
                runCommandInTerminalRef.current = runCommand;
                terminalShellIdRef.current = shellId;
                setIsTerminalReady(true);
              }}
              onUnready={() => {
                runCommandInTerminalRef.current = null;
                terminalShellIdRef.current = null;
                setIsTerminalReady(false);
              }}
            />
          </div>
  
          {/* Resize Handle */}
          {showRightPanel && (
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(e) => {
                e.preventDefault();
                deployResizeStartRef.current = {
                  x: e.clientX,
                  percent: deploySplitPercent,
                };
                setDeployResizing(true);
              }}
              className="shrink-0 w-1 cursor-col-resize bg-transparent hover:bg-accent/40 active:bg-accent transition-colors"
            />
          )}
  
          {/* Right Panel: Chat when Deploy tab, Server tools when Server tab */}
          {showRightPanel && (
            <div
              style={{
                flex: `1 1 ${100 - deploySplitPercent}%`,
                minWidth: 280,
                minHeight: 0,
              }}
              className="flex flex-col min-h-0 overflow-hidden"
            >
              {/* Deploy tab: Context + Chat */}
              <div
                className="flex flex-col min-h-0 overflow-auto p-4 space-y-4"
                style={{ display: deploySubTab === 'deploy' ? 'flex' : 'none' }}
              >
                <div className="rounded-xl border border-border/20 bg-bg-secondary/35 shrink-0 overflow-hidden shadow-sm backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => setContextAccordionOpen((o) => !o)}
                    className="w-full flex items-center justify-between gap-2.5 px-4 py-3 text-left hover:bg-bg-secondary/60 transition-colors cursor-pointer select-none"
                  >
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                      Environmental context parameters
                    </span>
                    <ChevronDown
                      size={14}
                      className={`text-text-secondary shrink-0 transition-transform duration-200 ${contextAccordionOpen ? 'rotate-0' : '-rotate-90'}`}
                    />
                  </button>
                  <div className={`accordion-wrapper ${contextAccordionOpen ? 'open' : ''}`}>
                    <div className="overflow-hidden">
                      <div className="border-t border-border/20 p-4 space-y-3 select-text">
                        <p className="text-xs text-text-primary break-words font-mono leading-relaxed bg-bg-primary/30 p-2.5 rounded-xl border border-border/10">{serverContextSummary}</p>
                        <div className="flex flex-col gap-1.5 w-full select-none">
                          <label className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Repository binding</label>
                          <Select
                            value={selectedDeployProjectPath}
                            onChange={onSelectDeployProjectForContext}
                            disabled={loadingDeployContext || !projectRepos.length}
                            options={[
                              { value: '', label: 'Link active repository tree…' },
                              ...projectRepos.map((path) => ({ value: path, label: path })),
                            ]}
                          />
                          <div className="flex items-center gap-2 mt-1">
                            {loadingDeployContext && (
                              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                <Loader2 size={13} className="animate-spin text-accent" />
                                <span>Generating workspace tree context…</span>
                              </div>
                            )}
                            {!projectRepos.length && (
                              <span className="text-[10px] text-text-muted italic">Add projects via file tree context menus.</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeployContextCollapsed((c) => !c)}
                          className="flex items-center gap-2 text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer select-none"
                        >
                          <FolderTree size={14} />
                          {deployContextCollapsed ? 'View context parameters' : 'Collapse context parameters'}
                          {deployContextText.trim() ? ` (${deployContextText.split('\n').filter(Boolean).length} lines)` : ''}
                        </button>
                        {!deployContextCollapsed && (
                          <textarea
                            value={deployContextText}
                            onChange={(e) => {
                              setDeployContextText(e.target.value);
                              setAiError(null);
                            }}
                            placeholder="Select repository file structures above to inject code level-3 directories + configurations, or manually insert telemetry instructions."
                            rows={4}
                            className="w-full px-3 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs font-mono text-text-primary placeholder-text-muted resize-y"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {(isShortcutsEnabled || isAiEnabled) && (
                  <div className="rounded-xl border border-border/20 bg-bg-secondary/35 flex flex-col min-h-0 flex-1 shadow-sm backdrop-blur-sm overflow-hidden">
                    {isShortcutsEnabled && (
                      <div className="p-4 border-b border-border/20 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider select-none">
                            Configured serial pipelines (.serop)
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 w-full select-none">
                          <Select
                            value={selectedShortcutsProjectPath}
                            onChange={setSelectedShortcutsProjectPath}
                            disabled={shortcutsLoading}
                            options={[
                              { value: '', label: `CWD: ${shortcutsProjectPath || 'not set'}` },
                              ...projectRepos.map((path) => ({ value: path, label: path })),
                            ]}
                          />
                          <Select
                            value={selectedShortcutFile}
                            onChange={(file) => {
                              setSelectedShortcutFile(file);
                              if (shortcutsProjectPath && file) void loadSeropFile(shortcutsProjectPath, file);
                            }}
                            disabled={shortcutsLoading || !shortcutFiles.length}
                            options={[
                              { value: '', label: 'Select recipe file…' },
                              ...shortcutFiles.map((name) => ({ value: name, label: name })),
                            ]}
                          />
                        </div>
                        <div className="max-h-48 overflow-auto space-y-2 pr-1 select-text">
                          {shortcutsLoading && (
                            <p className="text-xs text-text-muted flex items-center gap-1.5 select-none">
                              <Loader2 size={12} className="animate-spin text-accent" />
                              Parsing build shortcuts…
                            </p>
                          )}
                          {!shortcutsLoading && seropShortcuts.map((shortcut) => (
                            <div
                              key={shortcut.id}
                              className="rounded-xl border border-border/20 bg-bg-primary/40 p-3 flex flex-col gap-2"
                            >
                              <div className="flex items-center gap-2 select-none">
                                <span className="text-xs font-bold text-text-primary flex-1">
                                  {shortcut.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => executeInLeftTerminal(shortcut.command)}
                                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer"
                                >
                                  <Play size={10} />
                                  Run
                                </button>
                              </div>
                              <p className="text-[10px] text-text-secondary font-mono break-words bg-bg-primary/20 p-2 rounded border border-border/10">
                                {shortcut.command}
                              </p>
                            </div>
                          ))}
                          {shortcutsError && <p className="text-xs text-error font-mono">{shortcutsError}</p>}
                          {shortcutsWarning && !shortcutsError && (
                            <p className="text-xs text-text-muted select-none">{shortcutsWarning}</p>
                          )}
                          {!shortcutsLoading && !seropShortcuts.length && !shortcutsWarning && !shortcutsError && (
                            <p className="text-xs text-text-muted select-none">
                              Create .serop target lists under project/.server-operator/.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap select-none pt-1">
                          <button
                            type="button"
                            onClick={handleCopyShortcutBootstrapPrompt}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/30 bg-bg-primary/40 text-text-primary text-xs font-semibold hover:bg-bg-tertiary/60 transition-all cursor-pointer"
                          >
                            <Copy size={12} />
                            Copy AI recipe prompt
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateStarterShortcuts}
                            disabled={shortcutBootstrapBusy || !shortcutsProjectPath}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-accent/20 text-accent font-semibold hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          >
                            {shortcutBootstrapBusy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                            Write starter shortcuts
                          </button>
                        </div>
                        {shortcutBootstrapMessage && (
                          <p className="text-xs text-text-secondary font-sans leading-relaxed">{shortcutBootstrapMessage}</p>
                        )}
                        {shortcutBootstrapError && (
                          <p className="text-xs text-error font-mono">{shortcutBootstrapError}</p>
                        )}
                      </div>
                    )}

                    {isAiEnabled && (
                      <>
                        <div className="p-4 border-b border-border/20 shrink-0 select-none">
                          <div className="flex items-center gap-3">
                            <Key size={14} className="text-text-secondary shrink-0" />
                            <div className="relative flex-1 flex items-center min-w-0">
                              <input
                                type={showGroqKey ? 'text' : 'password'}
                                value={groqApiKey}
                                onChange={(e) => setGroqApiKey(e.target.value)}
                                onBlur={handleSaveGroqKey}
                                placeholder="Groq API Key (saved locally)"
                                className="w-full px-3.5 py-1.5 pr-10 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                              />
                              <button
                                type="button"
                                onClick={() => setShowGroqKey(!showGroqKey)}
                                className="absolute right-3 text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
                              >
                                {showGroqKey ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={handleSaveGroqKey}
                              className="px-3.5 py-1.5 rounded-xl bg-bg-tertiary border border-border/30 text-xs font-semibold text-text-primary hover:border-accent/50 shrink-0 cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                        <div className="flex-1 min-h-[160px] flex flex-col overflow-hidden bg-bg-primary/10">
                          <div className="flex-1 overflow-auto px-4 py-4 space-y-4 select-text">
                            {deployChatMessages.length === 0 && (
                              <div className="flex flex-col items-center justify-center py-8 text-center select-none">
                                <Sparkles size={24} className="text-accent/60 mb-2.5 animate-pulse" />
                                <p className="text-xs text-text-muted max-w-xs">
                                  Request a command structure. Serop will compile prompt tokens into executable terminal lines.
                                </p>
                              </div>
                            )}
                            {deployChatMessages.map((m, i) => (
                              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div
                                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                                    m.role === 'user'
                                      ? 'bg-accent text-white rounded-br-md shadow-sm'
                                      : 'bg-bg-secondary border border-border/20 text-text-primary font-mono rounded-bl-md shadow-xs'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className="flex-1">{m.content}</span>
                                    {m.role === 'assistant' && m.content.trim() && (
                                      <button
                                        type="button"
                                        onClick={() => executeInLeftTerminal(m.content)}
                                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent/20 text-accent hover:bg-accent/30 transition-colors cursor-pointer select-none"
                                      >
                                        <Play size={10} />
                                        Execute
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {aiSuggesting && (
                              <div className="flex justify-start select-none">
                                <div className="max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-xs bg-bg-secondary border border-border/20 text-text-muted flex items-center gap-2 shadow-xs">
                                  <Loader2 size={13} className="animate-spin text-accent" />
                                  Prompting Groq model…
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 p-3 pt-0">
                            <div className="rounded-xl border border-border/20 bg-bg-primary/50 focus-within:ring-1 focus-within:ring-accent overflow-hidden select-none">
                              <input
                                type="text"
                                value={aiRequest}
                                onChange={(e) => {
                                    setAiRequest(e.target.value);
                                    setAiError(null);
                                  }}
                                onKeyDown={(e) => e.key === 'Enter' && sendDeployMessage()}
                                placeholder="e.g. rebuild compose api service, show nginx active status"
                                className="w-full px-4 py-2.5 bg-transparent border-0 text-xs text-text-primary placeholder-text-muted focus:outline-none select-text"
                              />
                              <div className="flex justify-end px-2.5 pb-2.5">
                                <button
                                  type="button"
                                  onClick={sendDeployMessage}
                                  disabled={aiSuggesting || !aiRequest.trim()}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-sm"
                                >
                                  {aiSuggesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
                                  Send
                                </button>
                              </div>
                            </div>
                            {aiError && <p className="mt-2 text-xs text-error font-mono">{aiError}</p>}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Pipeline tab: Git-based deployment pipeline */}
              <div
                className="flex-grow flex flex-col min-h-0 overflow-auto p-4 space-y-4"
                style={{ display: deploySubTab === 'pipeline' ? 'flex' : 'none' }}
              >
                <div className="rounded-xl border border-border/20 bg-bg-secondary/35 p-5 space-y-4 shadow-sm backdrop-blur-sm select-none">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-bg-tertiary text-accent border border-border/10">
                      <GitBranch size={16} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">Configure deploy hook</h3>
                      <p className="text-[10px] text-text-muted font-sans mt-0.5">Automate non-interactive git updates, dependency builds, migrations & reloads.</p>
                    </div>
                  </div>

                  <div className="border-t border-border/15 pt-4 space-y-3 select-text">
                    {/* Server Selection */}
                    <div className="flex flex-col gap-1.5 select-none">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Target server</label>
                      <select
                        value={currentServer.id}
                        onChange={(e) => {
                          const target = servers?.find(s => s.id === e.target.value);
                          if (target && onSelectServer) {
                            onSelectServer(target);
                          }
                        }}
                        className="w-full px-3 py-2 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent"
                      >
                        {servers?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.username}@{s.host})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Project Directory */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center select-none">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted font-sans">Project root directory</label>
                        {projectRepos.length > 0 && (
                          <select
                            onChange={(e) => {
                              if (e.target.value) setPipelineProjDir(e.target.value);
                            }}
                            className="px-2 py-0.5 border border-border/30 bg-bg-primary/50 rounded-lg text-[9px] font-semibold text-text-secondary focus:outline-none"
                          >
                            <option value="">Linked repos…</option>
                            {projectRepos.map(path => (
                              <option key={path} value={path}>{path.split('/').pop() || path}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <input
                        type="text"
                        value={pipelineProjDir}
                        onChange={(e) => setPipelineProjDir(e.target.value)}
                        placeholder="e.g., /var/www/app"
                        className="w-full px-3 py-2 border border-border/30 bg-bg-primary/50 rounded-xl text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>

                    {/* Git Branch */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted select-none">Git target branch</label>
                      <input
                        type="text"
                        value={pipelineBranch}
                        onChange={(e) => setPipelineBranch(e.target.value)}
                        placeholder="main"
                        className="w-full px-3 py-2 border border-border/30 bg-bg-primary/50 rounded-xl text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>

                    {/* Dependency Installer */}
                    <div className="flex flex-col gap-1.5 select-none">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Dependency manager</label>
                      <select
                        value={pipelineDepType}
                        onChange={(e) => setPipelineDepType(e.target.value as any)}
                        className="w-full px-3 py-2 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="auto">Auto-detect build file profiles</option>
                        <option value="npm">npm ci (Node.js environments)</option>
                        <option value="pip">pip install -r requirements.txt (Python)</option>
                        <option value="none">Bypass packages installation</option>
                      </select>
                    </div>

                    {/* Database Migrations */}
                    <div className="flex flex-col gap-1.5 select-none">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Database migrations</label>
                      <select
                        value={pipelineMigType}
                        onChange={(e) => setPipelineMigType(e.target.value as any)}
                        className="w-full px-3 py-2 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="auto">Auto-detect migrations triggers</option>
                        <option value="npm">npm run migrate (Prisma / TypeORM)</option>
                        <option value="pip">python manage.py migrate (Django)</option>
                        <option value="none">Bypass migrations execute</option>
                      </select>
                    </div>

                    {/* Service Restart */}
                    <div className="flex flex-col gap-1.5 select-none">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Graceful process restart</label>
                      <select
                        value={pipelineRestartType}
                        onChange={(e) => setPipelineRestartType(e.target.value as any)}
                        className="w-full px-3 py-2 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent"
                      >
                        <option value="none">Skip daemon reloads</option>
                        <option value="pm2">PM2 Node.js process reloader</option>
                        <option value="systemd">systemctl service unit manager</option>
                      </select>
                    </div>

                    {/* Service Name (PM2 / Systemd) */}
                    {pipelineRestartType !== 'none' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted select-none">Service target identifier</label>
                        <input
                          type="text"
                          value={pipelineServiceName}
                          onChange={(e) => setPipelineServiceName(e.target.value)}
                          placeholder="e.g. nginx or backend-api"
                          className="w-full px-3 py-2 border border-border/30 bg-bg-primary/50 rounded-xl text-xs font-mono text-text-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                    )}

                    {/* Deploy Action */}
                    <div className="pt-3 select-none">
                      <button
                        type="button"
                        onClick={handleStartDeployment}
                        disabled={deploying || !pipelineProjDir.trim() || !isTerminalReady}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all duration-200 cursor-pointer"
                      >
                        {deploying ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            Executing pipeline hooks…
                          </>
                        ) : (
                          <>
                            <Rocket size={13} />
                            Deploy Pipeline
                          </>
                        )}
                      </button>
                      {!isTerminalReady && (
                        <p className="mt-2.5 text-center text-[10px] text-warning font-semibold">
                          Awaiting remote SSH stream establishment…
                        </p>
                      )}
                      {isTerminalReady && !deploying && (
                        <p className="mt-2.5 text-center text-[9px] text-text-muted">
                          Stdout & stderr streams will print live in the active terminal layout.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Deployment History Card */}
                <div className="rounded-xl border border-border/20 bg-bg-secondary/35 p-5 space-y-4 shadow-sm backdrop-blur-sm select-none">
                  <div className="flex items-center justify-between border-b border-border/10 pb-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-text-primary">
                      SQLite Audit logs
                    </h3>
                    <button
                      type="button"
                      onClick={fetchDeployHistory}
                      className="p-1 rounded-md text-text-secondary hover:bg-bg-tertiary cursor-pointer transition-colors"
                      title="Sync History"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>

                  {deployHistory.length === 0 ? (
                    <p className="text-xs text-text-muted text-center py-6 italic select-text">
                      No build history captured on database ledger.
                    </p>
                  ) : (
                    <div className="divide-y divide-border/10 max-h-96 overflow-y-auto space-y-3 pr-1 select-text">
                      {deployHistory.map((item) => (
                        <div key={item.id} className="pt-3 first:pt-0 flex flex-col gap-2">
                          <div className="flex items-start justify-between gap-3 text-xs">
                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap select-none">
                                <span
                                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                                    item.status === 'success' ? 'bg-success shadow-[0_0_6px_rgba(78,201,176,0.6)]' : 'bg-error shadow-[0_0_6px_rgba(241,76,76,0.6)]'
                                  }`}
                                  title={item.status === 'success' ? 'Success' : 'Failure'}
                                />
                                <span className="font-bold text-text-primary">
                                  {item.status === 'success' ? 'SUCCESS' : 'FAILURE'}
                                </span>
                                <span className="text-[10px] font-medium text-text-secondary">
                                  {new Date(item.timestamp).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-[10px] text-text-secondary font-mono truncate mt-0.5">
                                Branch: <strong className="text-text-primary">{item.branch}</strong>
                                {item.commitHash && (
                                  <>
                                    {' · '}SHA:{' '}
                                    <strong className="text-text-primary font-semibold font-mono">
                                      {item.commitHash.slice(0, 7)}
                                    </strong>
                                  </>
                                )}
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-1.5 shrink-0 select-none">
                              <button
                                type="button"
                                onClick={() => setExpandedDeployId(expandedDeployId === item.id ? null : item.id)}
                                className="px-2.5 py-1 border border-border/30 bg-bg-primary/50 hover:bg-bg-tertiary rounded-lg text-[10px] font-semibold text-text-primary transition-all cursor-pointer shadow-xs"
                              >
                                {expandedDeployId === item.id ? 'Hide Logs' : 'View Logs'}
                              </button>
                              {item.status === 'success' && item.commitHash && (
                                <button
                                  type="button"
                                  onClick={() => handleRollback(item.commitHash)}
                                  disabled={deploying || !isTerminalReady}
                                  className="px-2.5 py-1 bg-error/15 hover:bg-error hover:text-white border border-error/25 hover:border-transparent rounded-lg text-[10px] text-error font-semibold disabled:opacity-40 transition-all cursor-pointer"
                                  title="Revert deployment state to this commit"
                                >
                                  Rollback
                                </button>
                              )}
                            </div>
                          </div>

                          {expandedDeployId === item.id && (
                            <div className="mt-1 flex flex-col gap-1.5">
                              <div className="bg-bg-primary/80 border border-border/20 rounded-xl p-3 font-mono text-[10px] text-text-primary overflow-auto max-h-48 whitespace-pre-wrap select-text">
                                <div className="text-text-muted font-bold border-b border-border/10 pb-1.5 mb-2 font-mono">
                                  Command: {item.triggeredCommand}
                                </div>
                                {item.output ? item.output : <span className="text-text-muted italic">No output recorded.</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Server tab: Cron, Nginx, Certbot */}
              <div
                className="flex flex-col min-h-0 overflow-auto"
                style={{ display: deploySubTab === 'server' ? 'flex' : 'none' }}
              >
                <ServerToolsView
                  currentServer={currentServer}
                  proxy={proxy}
                  onRunInTerminal={(cmd: string) => runCommandInTerminalRef.current?.(cmd)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}