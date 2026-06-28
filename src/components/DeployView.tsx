import { Fragment, useState, useRef, useEffect } from 'react';
import { Rocket, Loader2, Key, FileCode, FolderTree, Send, Sparkles, Play, ChevronDown, Server, Copy, Wand2, GitBranch, RefreshCw } from 'lucide-react';
import EyeIcon from './icons/EyeIcon';
import EyeOffIcon from './icons/EyeOffIcon';
import { useFeatureFlag } from '../contexts/FeatureFlagContext';
import type { ServerConnection, ProxySettings } from '../types';
import { loadProjectContext } from '../utils/loadProjectContext';
import { parseLsLine } from '../utils/parseLs';
import { joinRemotePath, resolveRemotePath } from '../utils/remotePath';
import { ConfigCreators } from './ConfigCreators';
import { ProjectTerminal } from './ProjectTerminal';
import { ServerToolsView } from './ServerToolsView';
import { Select } from './Select';

const GROQ_API_KEY_STORAGE = 'server-operator:groq-api-key';
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'];

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

Your task: understand the user's deploy/devops request like a real assistant, using the current project path, current file, and server context.
- Think carefully about what directory, service, file, or tool they mean.
- Prefer commands that match the selected project and current working directory.
- Use docker compose when relevant.
- If the user is asking a question, answer it clearly.
- If the user wants an action, include the exact command to run.
- If a command would be unsafe, destructive, or ambiguous, explain briefly and ask for the missing detail instead of guessing.

Reply in exactly this format:
<answer>
A concise helpful answer for the user.
</answer>
<command>
single runnable shell command, or leave empty if no command should be run
</command>`;
  return sys;
}

function parseGroqDeployResponse(text: string): { answer: string; command: string } {
  const trimmed = text.trim();
  const answerMatch = trimmed.match(/<answer>([\s\S]*?)<\/answer>/i);
  const commandMatch = trimmed.match(/<command>([\s\S]*?)<\/command>/i);
  const answer = (answerMatch?.[1] || '').trim();
  const command = (commandMatch?.[1] || '').trim().replace(/^`+|`+$/g, '').trim();

  if (answer || command) {
    return {
      answer: answer || (command ? 'Here is the command for that request.' : ''),
      command,
    };
  }

  // Some model responses partially follow the format and may leave only
  // closing tags or put prose outside the expected wrappers.
  const cleaned = trimmed
    .replace(/<\/?answer>/gi, '')
    .replace(/<\/?command>/gi, '')
    .trim();

  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const commandLikeLine = [...lines]
    .reverse()
    .find((line) => /^(cd|ls|pwd|cat|grep|find|git|docker|docker compose|npm|pnpm|yarn|python|python3|pip|systemctl|service|pm2|cp|mv|rm|mkdir|chmod|chown|sudo\s+)/i.test(line));

  if (commandLikeLine) {
    const answerLines = lines.filter((line) => line !== commandLikeLine);
    return {
      answer: answerLines.join('\n').trim() || 'Here is the command for that request.',
      command: commandLikeLine,
    };
  }

  return {
    answer: cleaned,
    command: '',
  };
}

function normalizeAssistantAnswer(text: string): string {
  return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function renderInlineAssistantText(text: string, keyPrefix: string) {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`')) {
      return (
        <code
          key={`${keyPrefix}-code-${index}`}
          className="rounded-md border border-border/20 bg-bg-primary/50 px-1.5 py-0.5 font-mono text-[11px] text-accent"
        >
          {segment.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={`${keyPrefix}-text-${index}`}>{segment}</Fragment>;
  });
}

function renderAssistantTextBlock(text: string, keyPrefix: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const isNumberedList = lines.length > 1 && lines.every((line) => /^\d+\.\s+/.test(line));
  const isBulletList = lines.length > 1 && lines.every((line) => /^[-*]\s+/.test(line));

  if (isNumberedList) {
    return (
      <ol className="space-y-2 pl-5 list-decimal marker:text-accent/80">
        {lines.map((line, lineIndex) => (
          <li key={`${keyPrefix}-num-${lineIndex}`}>
            {renderInlineAssistantText(line.replace(/^\d+\.\s+/, ''), `${keyPrefix}-num-${lineIndex}`)}
          </li>
        ))}
      </ol>
    );
  }

  if (isBulletList) {
    return (
      <ul className="space-y-2 pl-5 list-disc marker:text-accent/80">
        {lines.map((line, lineIndex) => (
          <li key={`${keyPrefix}-bullet-${lineIndex}`}>
            {renderInlineAssistantText(line.replace(/^[-*]\s+/, ''), `${keyPrefix}-bullet-${lineIndex}`)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p>
      {lines.map((line, lineIndex) => (
        <Fragment key={`${keyPrefix}-line-${lineIndex}`}>
          {lineIndex > 0 && <br />}
          {renderInlineAssistantText(line, `${keyPrefix}-line-${lineIndex}`)}
        </Fragment>
      ))}
    </p>
  );
}

function renderAssistantAnswer(text: string) {
  const normalized = normalizeAssistantAnswer(text);
  const parts = normalized.split(/```([\w-]+)?\n([\s\S]*?)```/g);

  return (
    <div className="space-y-3 text-[13px] leading-6 text-text-primary/95">
      {parts.map((part, index) => {
        if (!part || !part.trim()) return null;

        // Odd captured segments after split are the optional language labels.
        if (index % 3 === 1) return null;

        if (index % 3 === 2) {
          const language = parts[index - 1]?.trim();
          return (
            <div key={`code-${index}`} className="rounded-xl border border-accent/15 bg-bg-primary/35 overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/10 bg-bg-primary/30 select-none">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  {language || 'Code'}
                </span>
              </div>
              <pre className="px-3 py-2.5 text-[11px] leading-6 font-mono text-text-secondary whitespace-pre-wrap break-words overflow-x-auto">
                <code>{part.trim()}</code>
              </pre>
            </div>
          );
        }

        const textBlocks = part.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
        return textBlocks.map((block, blockIndex) => (
          <Fragment key={`text-${index}-${blockIndex}`}>
            {renderAssistantTextBlock(block, `text-${index}-${blockIndex}`)}
          </Fragment>
        ));
      })}
    </div>
  );
}

interface SeropShortcut {
  id: string;
  name: string;
  command: string;
  sourceLine: number;
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

function pathChipLabel(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  if (normalized === '/' || !normalized) return path;
  return normalized.split('/').pop() || normalized;
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
): Promise<{ answer: string; command: string; error?: string }> {
  const systemContent = buildDeploySystemMessage(serverContext, extraContext);
  const messages = [
    { role: 'system' as const, content: systemContent },
    ...conversationMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];
  let lastError = 'No response returned';

  for (const model of GROQ_MODELS) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 256,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      lastError = `Groq API error: ${res.status} ${err}`;
      const shouldRetryWithNextModel =
        res.status === 429 && /rate limit|tokens per minute|tpm|limit reached/i.test(err);
      if (shouldRetryWithNextModel) continue;
      return { answer: '', command: '', error: lastError };
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    if (!text) {
      lastError = `No response returned from ${model}`;
      continue;
    }
    const parsed = parseGroqDeployResponse(text);
    return { answer: parsed.answer, command: parsed.command };
  }

  return { answer: '', command: '', error: lastError };
}

interface DeployChatMessage {
  role: 'user' | 'assistant';
  content: string;
  command?: string;
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
  selectedDeployProjectPath?: string;
  deployContextText?: string;
  loadingDeployContext?: boolean;
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
  selectedDeployProjectPath = '',
  deployContextText = '',
  loadingDeployContext = false,
  onOpenTerminalAndRun: _onOpenTerminalAndRun,
  bottomPanelOpen = false,
  bottomPanelTab = 'logs',
}: DeployViewProps) {
  const [deploySubTab, setDeploySubTab] = useState<DeploySubTab>('deploy');
  const isPipelineEnabled = useFeatureFlag('deployPipeline');
  const isCreatorsEnabled = useFeatureFlag('configCreators');
  const isServerEnabled = useFeatureFlag('serverAdmin');
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
    (deploySubTab === 'deploy' && isAiEnabled);
  const [command, setCommand] = useState('');
  const [groqApiKey, setGroqApiKey] = useState(loadGroqApiKey);
  const [deployChatMessages, setDeployChatMessages] = useState<DeployChatMessage[]>([]);
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

  const handleSaveGroqKey = () => {
    saveGroqApiKey(groqApiKey);
  };

  const serverContextSummary = buildServerContext(currentServer, currentPath, basePath, activeFilePath);
  const activeProjectPath = selectedDeployProjectPath.trim() || currentServer.projectPath || currentServer.cwd || '';

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
    const newUserMessage: DeployChatMessage = { role: 'user', content: userContent };
    setDeployChatMessages((prev) => [...prev, newUserMessage]);
    setAiSuggesting(true);
    try {
      const messagesForApi = [...deployChatMessages, newUserMessage];
      const { answer, command: suggested, error } = await suggestCommandWithGroq(
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
      setDeployChatMessages((prev) => [...prev, { role: 'assistant', content: answer || '(no response)', command: suggested || undefined }]);
    } finally {
      setAiSuggesting(false);
    }
  };

  const runCwd = activeProjectPath || currentServer.projectPath || currentServer.cwd || '';

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

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ command?: string }>).detail;
      const toRun = detail?.command?.trim();
      if (toRun) runCommandInTerminalRef.current?.(toRun);
    };
    window.addEventListener('deploy-run-command', handler as EventListener);
    return () => window.removeEventListener('deploy-run-command', handler as EventListener);
  }, []);

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
              {/* Deploy tab: Chat */}
              <div
                className="flex flex-col h-full min-h-0 overflow-hidden"
                style={{ display: deploySubTab === 'deploy' ? 'flex' : 'none' }}
              >
                {isAiEnabled && (
                  <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
                    <div className="p-4 border-b border-border/20 shrink-0 select-none">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Chat</p>
                            <span className="text-[10px] text-text-secondary truncate" title={activeProjectPath}>{activeProjectPath}</span>
                          </div>
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
                                  : 'bg-gradient-to-b from-bg-secondary to-bg-secondary/85 border border-border/20 text-text-primary rounded-bl-md shadow-sm backdrop-blur-sm'
                              }`}
                            >
                              {m.role === 'user' ? (
                                <div>{m.content}</div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="rounded-xl bg-bg-primary/10 px-3 py-2.5 border border-border/10">
                                    {renderAssistantAnswer(m.content)}
                                  </div>
                                  {m.command?.trim() && (
                                    <div className="rounded-xl border border-accent/15 bg-bg-primary/30 p-2.5 space-y-2">
                                      <div className="flex items-center justify-between gap-2 select-none">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Suggested Command</span>
                                        <button
                                          type="button"
                                          onClick={() => executeInLeftTerminal(m.command)}
                                          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent/20 text-accent hover:bg-accent/30 transition-colors cursor-pointer"
                                        >
                                          <Play size={10} />
                                          Execute
                                        </button>
                                      </div>
                                      <div className="rounded-lg border border-border/10 bg-bg-primary/35 px-2.5 py-2 text-[10px] font-mono text-text-secondary break-words whitespace-pre-wrap">
                                        {m.command}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
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
                      <div className="shrink-0 p-3 pt-0 mt-auto">
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
                      <Select
                        value={currentServer.id}
                        onChange={(val) => {
                          const target = servers?.find(s => s.id === val);
                          if (target && onSelectServer) {
                            onSelectServer(target);
                          }
                        }}
                        options={servers?.map((s) => ({
                          value: s.id,
                          label: `${s.name} (${s.username}@${s.host})`
                        })) || []}
                      />
                    </div>

                    {/* Project Directory */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center select-none">
                        <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted font-sans">Project root directory</label>
                        {projectRepos.length > 0 && (
                          <Select
                            value=""
                            onChange={(val) => {
                              if (val) setPipelineProjDir(val);
                            }}
                            size="sm"
                            containerClassName="w-32"
                            options={[
                              { value: '', label: 'Linked repos…' },
                              ...projectRepos.map(path => ({
                                value: path,
                                label: path.split('/').pop() || path
                              }))
                            ]}
                          />
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
                      <Select
                        value={pipelineDepType}
                        onChange={(val) => setPipelineDepType(val as any)}
                        options={[
                          { value: 'auto', label: 'Auto-detect build file profiles' },
                          { value: 'npm', label: 'npm ci (Node.js environments)' },
                          { value: 'pip', label: 'pip install -r requirements.txt (Python)' },
                          { value: 'none', label: 'Bypass packages installation' }
                        ]}
                      />
                    </div>

                    {/* Database Migrations */}
                    <div className="flex flex-col gap-1.5 select-none">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Database migrations</label>
                      <Select
                        value={pipelineMigType}
                        onChange={(val) => setPipelineMigType(val as any)}
                        options={[
                          { value: 'auto', label: 'Auto-detect migrations triggers' },
                          { value: 'npm', label: 'npm run migrate (Prisma / TypeORM)' },
                          { value: 'pip', label: 'python manage.py migrate (Django)' },
                          { value: 'none', label: 'Bypass migrations execute' }
                        ]}
                      />
                    </div>

                    {/* Service Restart */}
                    <div className="flex flex-col gap-1.5 select-none">
                      <label className="text-[10px] font-extrabold uppercase tracking-wider text-text-muted">Graceful process restart</label>
                      <Select
                        value={pipelineRestartType}
                        onChange={(val) => setPipelineRestartType(val as any)}
                        options={[
                          { value: 'none', label: 'Skip daemon reloads' },
                          { value: 'pm2', label: 'PM2 Node.js process reloader' },
                          { value: 'systemd', label: 'systemctl service unit manager' }
                        ]}
                      />
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
