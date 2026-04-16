import { useState, useRef, useEffect } from 'react';
import { Rocket, Loader2, Key, FileCode, FolderTree, Send, Sparkles, Play, ChevronDown, Server } from 'lucide-react';
import type { ServerConnection, ProxySettings } from '../types';
import { loadProjectContext } from '../utils/loadProjectContext';
import { ConfigCreators } from './ConfigCreators';
import { ProjectTerminal } from './ProjectTerminal';
import { ServerToolsView } from './ServerToolsView';

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
}

const hasServerOperator = typeof window !== 'undefined' && typeof window.serverOperator?.deploy === 'function';

type DeploySubTab = 'deploy' | 'creators' | 'server';

export function DeployView({ currentServer, proxy, onOpenPanel: _onOpenPanel, currentPath = '.', basePath, activeFilePath, projectRepos = [], projectTreeListings = {}, onOpenTerminalAndRun: _onOpenTerminalAndRun }: DeployViewProps) {
  const [deploySubTab, setDeploySubTab] = useState<DeploySubTab>('deploy');
  const [command, setCommand] = useState('');
  const [groqApiKey, setGroqApiKey] = useState(loadGroqApiKey);
  const [deployChatMessages, setDeployChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [deployContextText, setDeployContextText] = useState('');
  const [deployContextCollapsed, setDeployContextCollapsed] = useState(false);
  const [contextAccordionOpen, setContextAccordionOpen] = useState(false);
  const [selectedDeployProjectPath, setSelectedDeployProjectPath] = useState('');
  const [loadingDeployContext, setLoadingDeployContext] = useState(false);
  const [deploySplitPercent, setDeploySplitPercent] = useState(50);
  const [deployResizing, setDeployResizing] = useState(false);
  const deployResizeStartRef = useRef({ x: 0, percent: 50 });
  const runCommandInTerminalRef = useRef<((cmd: string) => void) | null>(null);
  const [aiRequest, setAiRequest] = useState('');
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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

  const executeInLeftTerminal = (cmd?: string) => {
    const toRun = (cmd ?? command).trim();
    if (!toRun) return;
    runCommandInTerminalRef.current?.(toRun);
  };

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
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-primary)] text-[var(--text-secondary)] p-8 text-center min-h-0">
        <Rocket size={48} className="mb-4 opacity-50" />
        <p className="font-medium text-[var(--text-primary)]">Deploy</p>
        <p className="text-sm mt-2 max-w-md">Run the app in Electron to run deploy commands on servers.</p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)] min-h-0">
      {/* Top Tabs */}
      <div className="flex items-center gap-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <button
          type="button"
          onClick={() => setDeploySubTab('deploy')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            deploySubTab === 'deploy'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Rocket size={16} />
          Deploy
        </button>
  
        <button
          type="button"
          onClick={() => setDeploySubTab('creators')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            deploySubTab === 'creators'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <FileCode size={16} />
          Config creators
        </button>
        <button
          type="button"
          onClick={() => setDeploySubTab('server')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            deploySubTab === 'server'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Server size={16} />
          Server
        </button>
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
      {/* Terminal (left) + Server tools (right): shown for both Deploy and Server tabs; always mounted so terminal + server state stay when switching */}
      <div
        className="flex-1 flex flex-col min-h-0 overflow-hidden"
        style={{ display: deploySubTab === 'deploy' || deploySubTab === 'server' ? 'flex' : 'none' }}
      >
        <div data-deploy-split className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          {/* Left: Terminal - flex 0 0 so it keeps its share and doesn't shrink to zero */}
          <div
            style={{
              flex: `0 0 ${deploySplitPercent}%`,
              minWidth: 200,
              maxWidth: deploySplitPercent === 100 ? '100%' : undefined,
            }}
            className="flex flex-col min-h-0 border-r border-[var(--border)] bg-[var(--bg-primary)] overflow-hidden"
          >
            <div className="shrink-0 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Terminal {runCwd ? `· ${runCwd}` : ''}
              </span>
            </div>
  
            <ProjectTerminal
              currentServer={currentServer}
              proxy={proxy}
              projectPath={runCwd || ''}
              onReady={(runCommand) => {
                runCommandInTerminalRef.current = runCommand;
              }}
              onUnready={() => {
                runCommandInTerminalRef.current = null;
              }}
            />
          </div>
  
          {/* Resize Handle */}
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
            className={`shrink-0 w-2 cursor-col-resize border-x border-[var(--border)] bg-[var(--bg-secondary)]
              hover:bg-[var(--accent)]/20 transition-colors
              ${deployResizing ? 'bg-[var(--accent)]/30' : ''}`}
          />
  
          {/* Right Panel: Chat when Deploy tab, Server tools when Server tab — both kept mounted so no reload when switching */}
          <div
            style={{
              flex: `1 1 ${100 - deploySplitPercent}%`,
              minWidth: 280,
              minHeight: 0,
            }}
            className="flex flex-col min-h-0 overflow-hidden"
          >
            {/* Deploy tab: Context + Chat (hidden when Server tab) */}
            <div
              className="flex flex-col min-h-0 overflow-auto p-4 space-y-4"
              style={{ display: deploySubTab === 'deploy' ? 'flex' : 'none' }}
            >
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shrink-0 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setContextAccordionOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--bg-primary)]/50 transition-colors"
                >
                  <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Context sent every message
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-[var(--text-secondary)] shrink-0 transition-transform duration-200 ${contextAccordionOpen ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
                {contextAccordionOpen && (
                  <div className="border-t border-[var(--border)] p-3 space-y-2">
                    <p className="text-xs text-[var(--text-primary)] break-words">{serverContextSummary}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs font-medium text-[var(--text-secondary)]">Project context</label>
                      <select
                        value={selectedDeployProjectPath}
                        onChange={(e) => onSelectDeployProjectForContext(e.target.value)}
                        disabled={loadingDeployContext || !projectRepos.length}
                        className="px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                      >
                        <option value="">Select project (tree + deployment files)</option>
                        {projectRepos.map((path) => (
                          <option key={path} value={path}>
                            {path}
                          </option>
                        ))}
                      </select>
                      {loadingDeployContext && <Loader2 size={14} className="animate-spin text-[var(--text-secondary)]" />}
                      {!projectRepos.length && (
                        <span className="text-xs text-[var(--text-muted)]">Right-click a folder → Add as project</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeployContextCollapsed((c) => !c)}
                      className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <FolderTree size={14} />
                      {deployContextCollapsed ? 'Show context' : 'Hide context'}
                      {deployContextText.trim() ? ` (${deployContextText.split('\n').filter(Boolean).length} lines)` : ''}
                    </button>
                    {!deployContextCollapsed && (
                      <textarea
                        value={deployContextText}
                        onChange={(e) => {
                          setDeployContextText(e.target.value);
                          setAiError(null);
                        }}
                        placeholder="Select a project above to load tree (level 3) + Dockerfile, compose, .env, etc. Or paste your own context."
                        rows={3}
                        className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-y"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col min-h-0 flex-1">
                <div className="p-3 border-b border-[var(--border)] shrink-0">
                  <div className="flex items-center gap-2">
                    <Key size={14} className="text-[var(--text-secondary)] shrink-0" />
                    <input
                      type="password"
                      value={groqApiKey}
                      onChange={(e) => setGroqApiKey(e.target.value)}
                      onBlur={handleSaveGroqKey}
                      placeholder="Groq API key (saved locally)"
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    />
                    <button
                      type="button"
                      onClick={handleSaveGroqKey}
                      className="px-3 py-1.5 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)] text-xs text-[var(--text-primary)] hover:border-[var(--accent)]/50 shrink-0"
                    >
                      Save
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-[160px] flex flex-col overflow-hidden bg-[var(--bg-primary)]/30">
                  <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
                    {deployChatMessages.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Sparkles size={32} className="text-[var(--accent)]/60 mb-2" />
                        <p className="text-sm text-[var(--text-muted)]">
                          Describe what you want to run. Each reply is a suggested command.
                        </p>
                      </div>
                    )}
                    {deployChatMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                            m.role === 'user'
                              ? 'bg-[var(--accent)] text-white rounded-br-md'
                              : 'bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] font-mono rounded-bl-md'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex-1">{m.content}</span>
                            {m.role === 'assistant' && m.content.trim() && (
                              <button
                                type="button"
                                onClick={() => executeInLeftTerminal(m.content)}
                                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30"
                              >
                                <Play size={12} />
                                Execute
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {aiSuggesting && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-muted)] flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin" />
                          Suggesting command…
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 p-3 pt-0">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] focus-within:ring-1 focus-within:ring-[var(--accent)] overflow-hidden">
                      <input
                        type="text"
                        value={aiRequest}
                        onChange={(e) => {
                          setAiRequest(e.target.value);
                          setAiError(null);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && sendDeployMessage()}
                        placeholder="e.g. restart api container, show last 50 lines of logs"
                        className="w-full px-4 py-3 bg-transparent border-0 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
                      />
                      <div className="flex justify-end px-2 pb-2">
                        <button
                          type="button"
                          onClick={sendDeployMessage}
                          disabled={aiSuggesting || !aiRequest.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {aiSuggesting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                          Send
                        </button>
                      </div>
                    </div>
                    {aiError && <p className="mt-2 text-xs text-[var(--error)]">{aiError}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Server tab: Cron, Nginx, Certbot (hidden when Deploy tab) */}
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
        </div>
      </div>
    </div>
  );
}