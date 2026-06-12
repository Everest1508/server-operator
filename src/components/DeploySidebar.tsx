import { useEffect, useState } from 'react';
import { ChevronDown, Copy, FolderTree, Loader2, Play, Wand2 } from 'lucide-react';
import type { ProxySettings, ServerConnection } from '../types';
import { parseLsLine } from '../utils/parseLs';
import { joinRemotePath } from '../utils/remotePath';

interface SeropShortcut {
  id: string;
  name: string;
  command: string;
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

  const flushSection = () => {
    const commands = currentSectionCommands.map((line) => line.trim()).filter(Boolean);
    if (!commands.length) return;
    shortcuts.push({
      id: `shortcut-${shortcuts.length + 1}`,
      name: currentSectionName || `Shortcut ${shortcuts.length + 1}`,
      command: commands.join(' && '),
    });
    currentSectionName = '';
    currentSectionCommands = [];
  };

  lines.forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;

    const section = trimmed.match(/^\[([^\]]+)\]$/);
    if (section) {
      flushSection();
      currentSectionName = section[1].trim();
      return;
    }

    if (!currentSectionName && currentSectionCommands.length === 0) {
      const inlinePair = trimmed.match(/^([^:=]+?)\s*[:=]\s*(.+)$/);
      if (inlinePair) {
        shortcuts.push({
          id: `shortcut-${shortcuts.length + 1}`,
          name: inlinePair[1].trim(),
          command: inlinePair[2].trim(),
        });
        return;
      }
      currentSectionName = `Shortcut ${shortcuts.length + 1}`;
    }

    currentSectionCommands.push(trimmed);
  });

  flushSection();
  if (shortcuts.length === 0) {
    return {
      shortcuts: [],
      warning: 'No shortcuts found. Use [Shortcut Name] sections followed by one or more command lines.',
    };
  }
  return { shortcuts };
}

function pathChipLabel(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  if (normalized === '/' || !normalized) return path;
  return normalized.split('/').pop() || normalized;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface DeploySidebarProps {
  currentServer: ServerConnection | null;
  proxy: ProxySettings;
  projectPaths: string[];
  selectedProjectPath: string;
  onSelectProject: (path: string) => void;
  contextText: string;
  onContextTextChange: (text: string) => void;
  loadingContext: boolean;
  contextError?: string | null;
}

export function DeploySidebar({
  currentServer,
  proxy,
  projectPaths,
  selectedProjectPath,
  onSelectProject,
  contextText,
  onContextTextChange,
  loadingContext,
  contextError = null,
}: DeploySidebarProps) {
  const [contextOpen, setContextOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(true);
  const [expandedShortcutId, setExpandedShortcutId] = useState<string | null>(null);
  const [editedShortcutCommands, setEditedShortcutCommands] = useState<Record<string, string>>({});
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

  const activeProjectPath = selectedProjectPath.trim();
  const seropFolderPath = joinRemotePath(activeProjectPath || '.', '.server-operator');

  useEffect(() => {
    setEditedShortcutCommands(Object.fromEntries(seropShortcuts.map((shortcut) => [shortcut.id, shortcut.command])));
    setExpandedShortcutId((prev) => (prev && seropShortcuts.some((shortcut) => shortcut.id === prev) ? prev : null));
  }, [seropShortcuts]);

  useEffect(() => {
    if (!window.serverOperator || !currentServer || !activeProjectPath) {
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
        const listRes = await window.serverOperator.listDir({
          connection: currentServer,
          dirPath: seropFolderPath,
          proxy: proxy.enabled ? proxy : undefined,
        });
        if (cancelled) return;
        if (!listRes.ok || !listRes.stdout) {
          setShortcutFiles([]);
          setSelectedShortcutFile('');
          setShortcutsWarning(`No shortcut folder found at ${seropFolderPath}. Create it and add .serop files.`);
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

        const readRes = await window.serverOperator.readFile({
          connection: currentServer,
          filePath: joinRemotePath(seropFolderPath, preferred),
          proxy: proxy.enabled ? proxy : undefined,
        });
        if (cancelled) return;
        if (!readRes.ok) {
          setShortcutsError(readRes.error || `Failed to read ${preferred}`);
          return;
        }
        const parsed = parseSeropShortcuts(readRes.content || '');
        setSeropShortcuts(parsed.shortcuts);
        setShortcutsWarning(parsed.warning || null);
      } finally {
        if (!cancelled) setShortcutsLoading(false);
      }
    };

    void loadSeropFiles();
    return () => {
      cancelled = true;
    };
  }, [currentServer?.id, proxy.enabled, proxy.host, proxy.port, activeProjectPath, seropFolderPath, selectedShortcutFile, shortcutsRefreshToken]);

  const handleCopyShortcutBootstrapPrompt = async () => {
    const ok = await copyToClipboard(buildSeropAgentPrompt(activeProjectPath || '.'));
    if (ok) {
      setShortcutBootstrapError(null);
      setShortcutBootstrapMessage('AI setup prompt copied.');
      setTimeout(() => setShortcutBootstrapMessage((msg) => (msg === 'AI setup prompt copied.' ? null : msg)), 2000);
      return;
    }
    setShortcutBootstrapError('Failed to copy prompt to clipboard.');
  };

  const handleCreateStarterShortcuts = async () => {
    if (!window.serverOperator || !currentServer || !activeProjectPath) return;
    setShortcutBootstrapBusy(true);
    setShortcutBootstrapError(null);
    setShortcutBootstrapMessage(null);
    try {
      const mkdirRes = await window.serverOperator.mkdir({
        connection: currentServer,
        dirPath: seropFolderPath,
        proxy: proxy.enabled ? proxy : undefined,
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
          proxy: proxy.enabled ? proxy : undefined,
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

  const runShortcut = (command: string) => {
    window.dispatchEvent(new CustomEvent('deploy-run-command', { detail: { command } }));
  };

  return (
    <div className="px-3 pt-2 space-y-3">
      <div className="rounded-lg border border-border bg-bg-primary p-3 text-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Projects</span>
          {loadingContext && (
            <span className="flex items-center gap-1 text-[10px] text-text-secondary">
              <Loader2 size={11} className="animate-spin text-accent" />
              Loading
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {projectPaths.map((path) => {
            const isSelected = path === activeProjectPath;
            return (
              <button
                key={path}
                type="button"
                onClick={() => onSelectProject(path)}
                className={`max-w-full px-2.5 py-1.5 rounded-full border text-[11px] font-semibold transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-accent/50 bg-accent/20 text-accent'
                    : 'border-border/25 bg-bg-secondary/40 text-text-secondary hover:text-text-primary hover:bg-bg-secondary/70'
                }`}
                title={path}
              >
                <span className="truncate block max-w-[180px]">{pathChipLabel(path)}</span>
              </button>
            );
          })}
        </div>
        {currentServer && <p className="text-accent text-xs">Viewing: {currentServer.name}</p>}
      </div>

      <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
        <button type="button" onClick={() => setShortcutsOpen((open) => !open)} className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left hover:bg-bg-secondary/60 transition-colors cursor-pointer">
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Serop Commands</span>
          <ChevronDown size={14} className={`text-text-secondary transition-transform ${shortcutsOpen ? 'rotate-0' : '-rotate-90'}`} />
        </button>
        {shortcutsOpen && (
          <div className="border-t border-border/20 p-3 space-y-3">
            <select
              value={selectedShortcutFile}
              onChange={(e) => setSelectedShortcutFile(e.target.value)}
              disabled={shortcutsLoading || !shortcutFiles.length}
              className="w-full px-3 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary focus:outline-none focus:border-accent disabled:opacity-60"
            >
              <option value="">Select recipe file…</option>
              {shortcutFiles.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <div className="max-h-56 overflow-auto space-y-2 pr-1">
              {shortcutsLoading && <p className="text-xs text-text-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin text-accent" />Parsing build shortcuts…</p>}
              {!shortcutsLoading && seropShortcuts.map((shortcut) => {
                const isOpen = expandedShortcutId === shortcut.id;
                const editedCommand = editedShortcutCommands[shortcut.id] ?? shortcut.command;
                return (
                  <div key={shortcut.id} className="rounded-xl border border-border/20 bg-bg-secondary/35 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setExpandedShortcutId((prev) => (prev === shortcut.id ? null : shortcut.id))}
                        className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                      >
                        <ChevronDown size={14} className={`shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                        <span className="text-xs font-bold text-text-primary truncate">{shortcut.name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => runShortcut(shortcut.command)}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer"
                      >
                        <Play size={10} />Run
                      </button>
                    </div>
                    {isOpen && (
                      <div className="border-t border-border/20 p-3 pt-2 space-y-2">
                        <textarea
                          value={editedCommand}
                          onChange={(e) => setEditedShortcutCommands((prev) => ({ ...prev, [shortcut.id]: e.target.value }))}
                          rows={4}
                          className="w-full px-3 py-2 rounded-xl bg-bg-primary/40 border border-border/20 text-[10px] font-mono text-text-primary placeholder-text-muted resize-y focus:outline-none focus:border-accent"
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => runShortcut(editedCommand)}
                            disabled={!editedCommand.trim()}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-accent text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Play size={10} />Run edited
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditedShortcutCommands((prev) => ({ ...prev, [shortcut.id]: shortcut.command }))}
                            className="px-2.5 py-1 rounded-lg border border-border/30 bg-bg-primary/40 text-[10px] font-semibold text-text-primary hover:bg-bg-tertiary/60 transition-colors cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {shortcutsError && <p className="text-xs text-error font-mono">{shortcutsError}</p>}
              {shortcutsWarning && !shortcutsError && <p className="text-xs text-text-muted">{shortcutsWarning}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button type="button" onClick={handleCopyShortcutBootstrapPrompt} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/30 bg-bg-primary/40 text-text-primary text-xs font-semibold hover:bg-bg-tertiary/60 transition-all cursor-pointer">
                <Copy size={12} />Copy AI recipe prompt
              </button>
              <button type="button" onClick={handleCreateStarterShortcuts} disabled={shortcutBootstrapBusy || !activeProjectPath} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-accent/20 text-accent font-semibold hover:bg-accent/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors">
                {shortcutBootstrapBusy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}Write starter shortcuts
              </button>
            </div>
            {shortcutBootstrapMessage && <p className="text-xs text-text-secondary">{shortcutBootstrapMessage}</p>}
            {shortcutBootstrapError && <p className="text-xs text-error font-mono">{shortcutBootstrapError}</p>}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
        <button type="button" onClick={() => setContextOpen((open) => !open)} className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left hover:bg-bg-secondary/60 transition-colors cursor-pointer">
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Context</span>
          <ChevronDown size={14} className={`text-text-secondary transition-transform ${contextOpen ? 'rotate-0' : '-rotate-90'}`} />
        </button>
        {contextOpen && (
          <div className="border-t border-border/20 p-3 space-y-3">
            <div className="flex items-center gap-2 text-[10px] text-text-secondary">
              <FolderTree size={12} className="text-accent shrink-0" />
              <span className="truncate" title={activeProjectPath}>{activeProjectPath}</span>
            </div>
            <textarea value={contextText} onChange={(e) => onContextTextChange(e.target.value)} placeholder="Project tree context will appear here for the selected project." rows={10} className="w-full px-3 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs font-mono text-text-primary placeholder-text-muted resize-y" />
            {contextError && <p className="text-xs text-error font-mono">{contextError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
