import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, Copy, FolderTree, Loader2, Play, Trash2, Wand2, X } from 'lucide-react';
import type { ProxySettings, ServerConnection } from '../types';
import { joinRemotePath } from '../utils/remotePath';
import { buildScheduleCancelCommand, buildScheduleCheckCommand, buildScheduleInstallCommand } from '../utils/scheduleCommand';
import { Select } from './Select';
import { Button } from './ui/Button';
import { Textarea } from './ui/Textarea';
import { SectionLabel } from './ui/SectionLabel';
import { Card } from './ui/Card';

interface SeropShortcut {
  id: string;
  name: string;
  command: string;
}

type ScheduledCommand = {
  id: number;
  serverId: string;
  serverName: string;
  command: string;
  runAt: string;
  marker: string;
  status: 'scheduled' | 'ran' | 'cancelled' | 'error';
  logPath: string | null;
  createdAt: string;
};

function isLocalWorkspaceConnection(server: ServerConnection): boolean {
  return server.connectionType === 'local' || server.id === 'dummy' || server.id?.startsWith('local:');
}

function formatScheduledTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
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

const FILE_ORDER_PREFIX = 'serop-file-order';

function loadStoredFileOrder(projectPath: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(`${FILE_ORDER_PREFIX}:${projectPath}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : null;
  } catch {
    return null;
  }
}

function saveStoredFileOrder(projectPath: string, names: string[]): void {
  try {
    window.localStorage.setItem(`${FILE_ORDER_PREFIX}:${projectPath}`, JSON.stringify(names));
  } catch {
    return;
  }
}

const HIDDEN_FILES_PREFIX = 'serop-hidden-files';

function loadStoredHiddenFiles(projectPath: string): string[] {
  try {
    const raw = window.localStorage.getItem(`${HIDDEN_FILES_PREFIX}:${projectPath}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

function saveStoredHiddenFiles(projectPath: string, names: string[]): void {
  try {
    window.localStorage.setItem(`${HIDDEN_FILES_PREFIX}:${projectPath}`, JSON.stringify(names));
  } catch {
    return;
  }
}

function applyStringOrder(names: string[], order: string[] | null): string[] {
  if (!order || !order.length) return names;
  const rank = new Map(order.map((name, index) => [name, index]));
  const fallbackRank = order.length;
  return names
    .map((name, index) => ({ name, index }))
    .sort((a, b) => {
      const ra = rank.get(a.name) ?? fallbackRank;
      const rb = rank.get(b.name) ?? fallbackRank;
      return ra === rb ? a.index - b.index : ra - rb;
    })
    .map((entry) => entry.name);
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
  const [fileOrder, setFileOrder] = useState<string[] | null>(null);
  const [hiddenFiles, setHiddenFiles] = useState<string[]>([]);

  const [scheduleOpen, setScheduleOpen] = useState(true);
  const [scheduledCommands, setScheduledCommands] = useState<ScheduledCommand[]>([]);
  const [scheduleSource, setScheduleSource] = useState('custom');
  const [scheduleCustomCommand, setScheduleCustomCommand] = useState('');
  const [scheduleRunAt, setScheduleRunAt] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [scheduleActionId, setScheduleActionId] = useState<number | null>(null);

  const activeProjectPath = selectedProjectPath.trim();
  const seropFolderPath = joinRemotePath(activeProjectPath || '.', '.server-operator');
  const orderedShortcutFiles = useMemo(
    () => applyStringOrder(shortcutFiles, fileOrder),
    [shortcutFiles, fileOrder]
  );
  const visibleShortcutFiles = useMemo(
    () => orderedShortcutFiles.filter((name) => !hiddenFiles.includes(name)),
    [orderedShortcutFiles, hiddenFiles]
  );

  useEffect(() => {
    setEditedShortcutCommands(Object.fromEntries(seropShortcuts.map((shortcut) => [shortcut.id, shortcut.command])));
    setExpandedShortcutId((prev) => (prev && seropShortcuts.some((shortcut) => shortcut.id === prev) ? prev : null));
  }, [seropShortcuts]);

  useEffect(() => {
    if (!window.serverOperator || !currentServer || !activeProjectPath) {
      setShortcutFiles([]);
      setSelectedShortcutFile('');
      setSeropShortcuts([]);
      setFileOrder(null);
      setHiddenFiles([]);
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
      setFileOrder(null);
      try {
        const listRes = await window.serverOperator.listDir({
          connection: currentServer,
          dirPath: seropFolderPath,
          proxy: proxy.enabled ? proxy : undefined,
        });
        if (cancelled) return;
        if (!listRes.ok || (!listRes.items?.length && !listRes.stdout)) {
          setShortcutFiles([]);
          setSelectedShortcutFile('');
          setShortcutsWarning(`No shortcut folder found at ${seropFolderPath}. Create it and add .serop files.`);
          return;
        }

        const entries: Array<{ name: string; isDir: boolean }> = listRes.items
          ? listRes.items.map((i) => ({ name: i.name, isDir: !!i.isDir }))
          : (listRes.stdout || '')
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 8) return null;
                return { isDir: parts[0].startsWith('d'), name: parts.slice(8).join(' ') };
              })
              .filter((x): x is { isDir: boolean; name: string } => !!x);

        const files = entries
          .filter((entry) => !entry.isDir)
          .map((entry) => entry.name)
          .filter((name) => name.toLowerCase().endsWith('.serop'))
          .sort((a, b) => a.localeCompare(b));

        setShortcutFiles(files);
        const storedOrder = loadStoredFileOrder(activeProjectPath);
        const storedHidden = loadStoredHiddenFiles(activeProjectPath);
        setFileOrder(storedOrder);
        setHiddenFiles(storedHidden);
        if (!files.length) {
          setSelectedShortcutFile('');
          setShortcutsWarning('No .serop files found in .server-operator folder.');
          return;
        }

        const visibleNow = applyStringOrder(files, storedOrder).filter((name) => !storedHidden.includes(name));
        const preferred = visibleNow.includes(selectedShortcutFile) ? selectedShortcutFile : (visibleNow[0] ?? files[0]);
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

  const handleRecipeFileReorder = (fromIndex: number, toIndex: number) => {
    const from = fromIndex - 1;
    const to = toIndex - 1;
    if (from < 0 || to < 0 || from >= visibleShortcutFiles.length || to >= visibleShortcutFiles.length) return;
    const names = [...visibleShortcutFiles];
    const [moved] = names.splice(from, 1);
    names.splice(to, 0, moved);
    const nextOrder = [...names, ...hiddenFiles];
    setFileOrder(nextOrder);
    saveStoredFileOrder(activeProjectPath, nextOrder);
  };

  // Selecting a recipe file promotes it to the top of the dropdown next time it opens.
  const handleShortcutFileSelect = (name: string) => {
    setSelectedShortcutFile(name);
    if (!name) return;
    const nextOrder = [name, ...orderedShortcutFiles.filter((n) => n !== name)];
    setFileOrder(nextOrder);
    saveStoredFileOrder(activeProjectPath, nextOrder);
  };

  // Hiding only affects this dropdown (stored locally); the .serop file on the server is untouched.
  const handleHideShortcutFile = (name: string) => {
    setHiddenFiles((prev) => {
      if (prev.includes(name)) return prev;
      const next = [...prev, name];
      saveStoredHiddenFiles(activeProjectPath, next);
      return next;
    });
    if (selectedShortcutFile === name) {
      setSelectedShortcutFile(visibleShortcutFiles.find((f) => f !== name) ?? '');
    }
  };

  const handleUnhideShortcutFile = (name: string) => {
    setHiddenFiles((prev) => {
      const next = prev.filter((n) => n !== name);
      saveStoredHiddenFiles(activeProjectPath, next);
      return next;
    });
  };

  const loadScheduledCommands = useCallback(async () => {
    if (!window.serverOperator || !currentServer) {
      setScheduledCommands([]);
      return;
    }
    const rows = await window.serverOperator.scheduleList({ serverId: currentServer.id });

    // Best-effort: for anything still marked "scheduled" but past its run
    // time, check whether the marker is still installed on the target — if
    // it's gone, the one-time job already fired (or was removed elsewhere).
    const now = Date.now();
    const isWindows = isLocalWorkspaceConnection(currentServer) && window.serverOperator.platform === 'win32';
    await Promise.all(
      rows
        .filter((row) => row.status === 'scheduled' && new Date(row.runAt).getTime() < now)
        .map(async (row) => {
          const check = await window.serverOperator.runCommand({
            connection: currentServer,
            command: buildScheduleCheckCommand(row.marker, isWindows),
            proxy: proxy.enabled ? proxy : undefined,
          });
          if (check.ok && (check.stdout || '').includes('NONE')) {
            await window.serverOperator.scheduleUpdateStatus({ id: row.id, status: 'ran' });
            row.status = 'ran';
          }
        })
    );
    setScheduledCommands(rows);
  }, [currentServer, proxy]);

  useEffect(() => {
    void loadScheduledCommands();
  }, [loadScheduledCommands]);

  const handleScheduleCommand = async () => {
    if (!window.serverOperator || !currentServer) return;
    const command = scheduleSource === 'custom'
      ? scheduleCustomCommand.trim()
      : seropShortcuts.find((s) => s.id === scheduleSource)?.command.trim() || '';
    if (!command) {
      setScheduleError('Choose a shortcut or enter a command.');
      return;
    }
    if (!scheduleRunAt) {
      setScheduleError('Pick a date and time.');
      return;
    }
    const runAtDate = new Date(scheduleRunAt);
    if (Number.isNaN(runAtDate.getTime()) || runAtDate.getTime() <= Date.now()) {
      setScheduleError('Pick a date and time in the future.');
      return;
    }

    setScheduleBusy(true);
    setScheduleError(null);
    setScheduleMessage(null);
    try {
      const isWindows = isLocalWorkspaceConnection(currentServer) && window.serverOperator.platform === 'win32';
      const marker = crypto.randomUUID();
      const installCmd = buildScheduleInstallCommand(command, runAtDate, marker, isWindows);
      const installRes = await window.serverOperator.runCommand({
        connection: currentServer,
        command: installCmd,
        proxy: proxy.enabled ? proxy : undefined,
      });
      if (!installRes.ok) {
        setScheduleError(installRes.error || installRes.stderr || 'Failed to install the scheduled job (is crontab available on the target?).');
        return;
      }
      const createRes = await window.serverOperator.scheduleCreate({
        serverId: currentServer.id,
        serverName: currentServer.name,
        command,
        runAt: runAtDate.toISOString(),
        marker,
      });
      if (!createRes.ok) {
        setScheduleError(createRes.error || 'Job was installed but could not be saved locally.');
        return;
      }
      setScheduleMessage(`Scheduled for ${formatScheduledTime(runAtDate.toISOString())}.`);
      setScheduleCustomCommand('');
      setScheduleRunAt('');
      await loadScheduledCommands();
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleCancelScheduledCommand = async (row: ScheduledCommand) => {
    if (!window.serverOperator || !currentServer) return;
    setScheduleActionId(row.id);
    setScheduleError(null);
    try {
      const isWindows = isLocalWorkspaceConnection(currentServer) && window.serverOperator.platform === 'win32';
      const res = await window.serverOperator.runCommand({
        connection: currentServer,
        command: buildScheduleCancelCommand(row.marker, isWindows),
        proxy: proxy.enabled ? proxy : undefined,
      });
      if (!res.ok) {
        setScheduleError(res.error || res.stderr || 'Failed to cancel the scheduled job.');
        return;
      }
      await window.serverOperator.scheduleUpdateStatus({ id: row.id, status: 'cancelled' });
      await loadScheduledCommands();
    } finally {
      setScheduleActionId(null);
    }
  };

  const handleDeleteScheduledCommand = async (row: ScheduledCommand) => {
    if (!window.serverOperator) return;
    setScheduleActionId(row.id);
    try {
      await window.serverOperator.scheduleDelete({ id: row.id });
      await loadScheduledCommands();
    } finally {
      setScheduleActionId(null);
    }
  };

  return (
    <div className="px-3 pt-2 space-y-3">
      <Card className="p-3 text-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Projects</SectionLabel>
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
      </Card>

      <div className="rounded-lg border border-border bg-bg-primary overflow-hidden">
        <button type="button" onClick={() => setShortcutsOpen((open) => !open)} className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left hover:bg-bg-secondary/60 transition-colors cursor-pointer">
          <SectionLabel>Serop Commands</SectionLabel>
          <ChevronDown size={14} className={`text-text-secondary transition-transform ${shortcutsOpen ? 'rotate-0' : '-rotate-90'}`} />
        </button>
        {shortcutsOpen && (
          <div className="border-t border-border/20 p-3 space-y-3">
            <Select
              value={selectedShortcutFile}
              onChange={handleShortcutFileSelect}
              disabled={shortcutsLoading || !shortcutFiles.length}
              reorderable={visibleShortcutFiles.length > 1}
              onReorder={handleRecipeFileReorder}
              reorderIgnoreValues={['']}
              removable={visibleShortcutFiles.length > 0}
              onRemove={handleHideShortcutFile}
              removeIgnoreValues={['']}
              options={[
                { value: '', label: 'Select recipe file…' },
                ...visibleShortcutFiles.map((name) => ({ value: name, label: name })),
              ]}
            />
            {hiddenFiles.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] text-text-muted">Hidden from dropdown:</span>
                {hiddenFiles.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleUnhideShortcutFile(name)}
                    title="Restore to dropdown"
                    className="px-2 py-0.5 rounded-full border border-border/25 bg-bg-secondary/40 text-[10px] font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-secondary/70 transition-colors cursor-pointer"
                  >
                    {name} ↺
                  </button>
                ))}
              </div>
            )}
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
                      <Button variant="subtle" size="sm" onClick={() => runShortcut(shortcut.command)} className="shrink-0">
                        <Play size={10} />Run
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="border-t border-border/20 p-3 pt-2 space-y-2">
                        <Textarea
                          size="sm"
                          value={editedCommand}
                          onChange={(e) => setEditedShortcutCommands((prev) => ({ ...prev, [shortcut.id]: e.target.value }))}
                          rows={4}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button variant="solid" size="sm" onClick={() => runShortcut(editedCommand)} disabled={!editedCommand.trim()}>
                            <Play size={10} />Run edited
                          </Button>
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
        <button type="button" onClick={() => setScheduleOpen((open) => !open)} className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left hover:bg-bg-secondary/60 transition-colors cursor-pointer">
          <SectionLabel>Scheduled Commands</SectionLabel>
          <ChevronDown size={14} className={`text-text-secondary transition-transform ${scheduleOpen ? 'rotate-0' : '-rotate-90'}`} />
        </button>
        {scheduleOpen && (
          <div className="border-t border-border/20 p-3 space-y-3">
            <p className="text-[10px] text-text-muted leading-relaxed">
              Runs once, at this time on the target's own clock, via a self-removing job — no need to keep Serop open.
            </p>
            <Select
              value={scheduleSource}
              onChange={setScheduleSource}
              disabled={!currentServer}
              options={[
                { value: 'custom', label: 'Custom command' },
                ...seropShortcuts.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            {scheduleSource === 'custom' ? (
              <Textarea
                size="sm"
                value={scheduleCustomCommand}
                onChange={(e) => setScheduleCustomCommand(e.target.value)}
                placeholder="Command to run"
                rows={2}
              />
            ) : (
              <p className="text-[11px] font-mono text-text-secondary bg-bg-secondary/40 rounded-lg px-2.5 py-1.5 break-all">
                {seropShortcuts.find((s) => s.id === scheduleSource)?.command}
              </p>
            )}
            <input
              type="datetime-local"
              value={scheduleRunAt}
              onChange={(e) => setScheduleRunAt(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary"
            />
            <Button variant="solid" size="sm" onClick={handleScheduleCommand} disabled={scheduleBusy || !currentServer}>
              {scheduleBusy ? <Loader2 size={11} className="animate-spin" /> : <CalendarClock size={11} />}
              Schedule
            </Button>
            {scheduleError && <p className="text-xs text-error font-mono">{scheduleError}</p>}
            {scheduleMessage && <p className="text-xs text-text-secondary">{scheduleMessage}</p>}

            {scheduledCommands.length > 0 && (
              <div className="max-h-56 overflow-auto space-y-2 pr-1 pt-1">
                {scheduledCommands.map((row) => (
                  <div key={row.id} className="rounded-xl border border-border/20 bg-bg-secondary/35 px-3 py-2.5 space-y-1">
                    <p className="text-[11px] font-mono text-text-primary truncate" title={row.command}>{row.command}</p>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-text-muted">{formatScheduledTime(row.runAt)}</span>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                          row.status === 'scheduled'
                            ? 'bg-accent/15 text-accent'
                            : row.status === 'ran'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : row.status === 'error'
                                ? 'bg-error/15 text-error'
                                : 'bg-bg-tertiary text-text-muted'
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {row.status === 'scheduled' ? (
                        <button
                          type="button"
                          disabled={scheduleActionId === row.id}
                          onClick={() => handleCancelScheduledCommand(row)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/30 text-[10px] font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <X size={10} />Cancel
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={scheduleActionId === row.id}
                          onClick={() => handleDeleteScheduledCommand(row)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/30 text-[10px] font-semibold text-text-secondary hover:text-error hover:bg-error/10 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Trash2 size={10} />Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
