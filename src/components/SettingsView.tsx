import React, { useState, useEffect } from 'react';
import { useFeatureFlags } from '../contexts/FeatureFlagContext';
import { FeatureFlags, CloudinaryConfig, AppTheme } from '../types';
import {
  Sliders,
  Search,
  RotateCcw,
  LayoutGrid,
  FolderOpen,
  Terminal,
  Sparkles,
  Workflow,
  History,
  FileText,
  Boxes,
  Lock,
  Compass,
  Cpu,
  Layers,
  ScrollText,
  ChevronDown,
  ChevronUp,
  Bug,
  Trash2,
  BookOpen,
  Database,
  Cloud,
  Save,
  Loader2,
  Upload,
  Download,
  X,
  Check,
  Plus,
  Pencil,
} from 'lucide-react';

import { CHANGELOG, ChangeEntry } from './changelogData';
import { Select } from './Select';
import { ThemeEditor } from './ThemeEditor';
import {
  CustomTheme, THEME_TEMPLATE, parseThemeJson, loadCustomThemes, addCustomTheme, removeCustomTheme,
  customChoiceId, loadThemeChoice, applyTheme, listAllThemes, loadFolderThemes, THEMES_CHANGED_EVENT, ListedTheme,
} from '../utils/customThemes';
import packageJson from '../../package.json';

const OPACITY_STORAGE_KEY = 'server-operator:opacity';
const BLUR_STORAGE_KEY = 'server-operator:blur';

const THEMES: { id: AppTheme; label: string; desc: string; swatch: string[] }[] = [
  {
    id: 'default',
    label: 'Default',
    desc: 'Standard dark operator theme with solid panels.',
    swatch: ['#1e1e1e', '#0078d4', '#4ec9b0', '#cccccc'],
  },
  {
    id: 'glassy',
    label: 'Glassy',
    desc: 'Transparent layered panels with a Linux-terminal-style glass look.',
    swatch: ['#0b1426', '#5cc8ff', '#7ff0c2', '#dbe5f5'],
  },
  {
    id: 'light',
    label: 'Light',
    desc: 'Bright, clean light mode with soft panels.',
    swatch: ['#f7f8fc', '#0a66d4', '#1a7f37', '#1f2328'],
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    desc: 'Deep indigo-navy dark with cyan and violet accents.',
    swatch: ['#1a1b26', '#7aa2f7', '#9ece6a', '#c0caf5'],
  },
];

function loadOpacity(): number {
  try {
    const raw = localStorage.getItem(OPACITY_STORAGE_KEY);
    if (raw === null) return 1.0;
    const v = parseFloat(raw);
    return isFinite(v) ? Math.max(0.6, Math.min(1, v)) : 1.0;
  } catch {
    return 1.0;
  }
}

function saveOpacity(value: number) {
  try {
    localStorage.setItem(OPACITY_STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

function loadBlur(): number {
  try {
    const raw = localStorage.getItem(BLUR_STORAGE_KEY);
    if (raw === null) return 28;
    const v = parseFloat(raw);
    return isFinite(v) ? Math.max(4, Math.min(40, v)) : 28;
  } catch {
    return 28;
  }
}

function saveBlur(value: number) {
  try {
    localStorage.setItem(BLUR_STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

function applyOpacity(value: number) {
  document.documentElement.style.setProperty('--app-opacity', String(value));
}

function applyBlur(pixels: number) {
  document.documentElement.style.setProperty('--glass-blur', `${pixels}px`);
}

const TYPE_BADGE: Record<ChangeEntry['type'], { label: string; color: string; bg: string }> = {
  feat:    { label: 'NEW',     color: '#86efac', bg: 'rgba(134,239,172,0.12)' },
  fix:     { label: 'FIX',     color: '#fca5a5', bg: 'rgba(252,165,165,0.12)' },
  improve: { label: 'IMPR',    color: '#93c5fd', bg: 'rgba(147,197,253,0.12)' },
  core:    { label: 'CORE',    color: '#c4b5fd', bg: 'rgba(196,181,253,0.12)' },
};

/* ─────────────────────────────────────────────
   MODULES DATA  (unchanged from before)
───────────────────────────────────────────── */
interface FeatureItem {
  key: keyof FeatureFlags;
  title: string;
  description: string;
  category: 'core' | 'advanced' | 'integrations' | 'deploy';
  icon: React.ComponentType<any>;
  isSubFeature?: boolean;
}

const ALL_FEATURES: FeatureItem[] = [
  {
    key: 'servers',
    title: 'Servers Manager',
    description: 'SSH connection manager supporting Tor proxy proxying, customizable grid layouts, and server tags/roles.',
    category: 'core',
    icon: Compass,
  },
  {
    key: 'files',
    title: 'File Explorer',
    description: 'Remote file tree explorer, custom Monaco Editor editor workspace, direct file uploads, downloads, and search.',
    category: 'core',
    icon: FolderOpen,
  },
  {
    key: 'docker',
    title: 'Docker Console',
    description: 'Monitor container status list, read logs, rebuild docker-compose systems, and manage active service status.',
    category: 'advanced',
    icon: Boxes,
  },
  {
    key: 'database',
    title: 'Database Manager',
    description: 'Connect to remote databases, browse tables, run queries, and manage database schemas directly from the app.',
    category: 'advanced',
    icon: ScrollText,
  },
  {
    key: 'shortcuts',
    title: 'Quick Command Shortcuts',
    description: 'Define and trigger quick commands, hotkeys, and shell hooks directly on your active server connections.',
    category: 'advanced',
    icon: Sliders,
  },
  {
    key: 'serverAdmin',
    title: 'Server Admin Tools',
    description: 'Deep operating system manager, service status controller, process supervisor, and automated server maintenance tasks.',
    category: 'advanced',
    icon: Cpu,
  },
  {
    key: 'configCreators',
    title: 'Config Creators',
    description: 'Auto-generation wizards for systemd service declarations, Nginx reverse proxy blocks, and boilerplate files.',
    category: 'advanced',
    icon: Layers,
  },
  {
    key: 'aiAssistant',
    title: 'AI Assistant',
    description: 'Integrated intelligent AI companion for query optimization, diagnostic suggestions, and shell commands helper.',
    category: 'integrations',
    icon: Sparkles,
  },
  {
    key: 'notes',
    title: 'Persistent Notes',
    description: 'Create and persist markdown logs, developer guidelines, and server checklists. Syncs automatically with Monaco editor views.',
    category: 'integrations',
    icon: FileText,
  },
  {
    key: 'deployModule',
    title: 'Deploy & Server Tools Suite',
    description: 'All-in-one suite for remote code deployments, process controllers, history charts, and terminal scripts.',
    category: 'deploy',
    icon: Workflow,
  },
  {
    key: 'deployPipeline',
    title: 'Git-based Deployment Pipeline',
    description: 'Trigger remote git checkout operations, install node_modules/pip environments, run migrations, and lock editor interactions during deployments.',
    category: 'deploy',
    icon: Workflow,
    isSubFeature: true,
  },
  {
    key: 'deployHistory',
    title: 'Log History & Rollbacks',
    description: 'Local SQLite log history tracker for audit, build output streams viewer, and quick single-click rollbacks to historical Git commits.',
    category: 'deploy',
    icon: History,
    isSubFeature: true,
  },
];

const CATEGORIES = {
  core: { name: 'Core Modules', desc: 'Essential connection and tree operations' },
  advanced: { name: 'Advanced Operations', desc: 'Enhanced container, config, and system monitors' },
  integrations: { name: 'Integrations', desc: 'Intelligent assistants and notes engines' },
  deploy: { name: 'Deploy & Server Tools', desc: 'Pipelines and deployment history audit logs with rollbacks' },
};

/* ─────────────────────────────────────────────
   CHANGELOG VIEW
───────────────────────────────────────────── */
function ChangelogView() {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (key: string) =>
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="p-6 space-y-10">
      {CHANGELOG.map((ver) => (
        <div key={ver.version}>
          {/* Version Header */}
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 p-5 rounded-xl border border-border relative overflow-hidden bg-gradient-to-br from-accent/8 to-transparent"
          >
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_0%_0%,var(--color-accent),transparent_60%)] opacity-[0.12]" />
            <div className="relative flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-widest border border-indigo-300/30 bg-indigo-300/8 text-indigo-300"
                >
                  v{ver.version}
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-semibold border border-amber-400/30 bg-amber-400/8 text-amber-400"
                >
                  ✦ {ver.codename}
                </span>
                <span className="text-xs text-text-muted ml-auto">{ver.date}</span>
              </div>
              <p className="text-sm text-text-secondary mt-2 leading-relaxed">{ver.summary}</p>
            </div>
          </div>

          {/* Change Groups */}
          <div className="space-y-3">
            {ver.groups.map((group) => {
              const GroupIcon = group.icon;
              const groupKey = `${ver.version}-${group.label}`;
              const isOpen = expandedGroups[groupKey] !== false; // default open

              return (
                <div
                  key={groupKey}
                  className="rounded-lg border border-border overflow-hidden bg-bg-secondary"
                >
                  {/* Group Header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-tertiary/50 transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `${group.color}18`, color: group.color }}
                    >
                      <GroupIcon size={15} />
                    </div>
                    <span className="text-sm font-semibold text-text-primary flex-1">{group.label}</span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                      style={{ color: group.color, borderColor: `${group.color}30`, background: `${group.color}10` }}
                    >
                      {group.items.length} changes
                    </span>
                    {isOpen
                      ? <ChevronUp size={14} className="text-text-muted shrink-0" />
                      : <ChevronDown size={14} className="text-text-muted shrink-0" />
                    }
                  </button>

                  {/* Items */}
                  {isOpen && (
                    <ul className="border-t border-border divide-y divide-border/50">
                      {group.items.map((entry, i) => {
                        const badge = TYPE_BADGE[entry.type];
                        return (
                          <li key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-bg-tertiary/30 transition-colors">
                            <span
                              className="mt-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider"
                              style={{ color: badge.color, background: badge.bg }}
                            >
                              {badge.label}
                            </span>
                            <span className="text-xs text-text-secondary leading-relaxed">{entry.text}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MODULES VIEW  (feature toggles)
───────────────────────────────────────────── */
function ModulesView() {
  const { flags, toggleFlag, setSidebarUx, resetToDefaults } = useFeatureFlags();
  const [searchQuery, setSearchQuery] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [devtoolsStatus, setDevtoolsStatus] = useState<'idle' | 'opened' | 'error'>('idle');
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsContent, setLogsContent] = useState('');
  const [logPath, setLogPath] = useState('');
  const [themeChoice, setThemeChoice] = useState<string>(loadThemeChoice);
  const [customThemes, setCustomThemes] = useState<ListedTheme[]>(listAllThemes);
  const refreshThemeList = () => setCustomThemes(listAllThemes());
  const [themeMessage, setThemeMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const themeFileRef = React.useRef<HTMLInputElement>(null);
  const [opacity, setOpacity] = useState<number>(loadOpacity);
  const [blur, setBlur] = useState<number>(loadBlur);
  const [editor, setEditor] = useState<{ initial: CustomTheme | null; restore: string } | null>(null);

  const allThemes = [
    ...THEMES.map((t) => ({ ...t, id: t.id as string, customId: null as string | null })),
    ...customThemes.map((t) => ({
      id: customChoiceId(t.id),
      label: t.name,
      desc: t.source === 'imported' ? t.description : `${t.description} (from ${t.source} folder)`,
      swatch: [t.colors.bgPrimary ?? '#1e1e1e', t.colors.accent ?? '#0078d4', t.colors.success ?? '#4ec9b0', t.colors.textPrimary ?? '#cccccc'],
      customId: (t.source === 'imported' ? t.id : null) as string | null,
    })),
  ];

  const importThemeFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 20000) {
      setThemeMessage({ ok: false, text: 'Theme file is too large (max 20 KB).' });
      return;
    }
    const result = parseThemeJson(await file.text());
    if (!result.ok) {
      setThemeMessage({ ok: false, text: result.error });
      return;
    }
    const added = addCustomTheme(result.theme);
    if (!added.ok) {
      setThemeMessage({ ok: false, text: added.error });
      return;
    }
    refreshThemeList();
    setThemeChoice(customChoiceId(result.theme.id));
    const ignoredNote = result.ignored.length ? ` Ignored: ${result.ignored.join(', ')}.` : '';
    setThemeMessage({ ok: true, text: `Applied "${result.theme.name}".${ignoredNote}` });
  };

  const downloadThemeTemplate = () => {
    const url = URL.createObjectURL(new Blob([THEME_TEMPLATE], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'serop-theme-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const reloadThemeFolders = async () => {
    const { themes, problems } = await loadFolderThemes();
    refreshThemeList();
    setThemeMessage(
      problems.length
        ? { ok: false, text: `Loaded ${themes.length} theme(s) from folders. Skipped: ${problems.join('; ')}` }
        : { ok: true, text: `Loaded ${themes.length} theme(s) from folders.` },
    );
  };

  const openThemesFolder = async () => {
    const res = await window.serverOperator?.openThemesFolder?.();
    if (res && !res.ok) setThemeMessage({ ok: false, text: `Could not open ${res.path}: ${res.error}` });
  };

  useEffect(() => {
    window.addEventListener(THEMES_CHANGED_EVENT, refreshThemeList);
    return () => window.removeEventListener(THEMES_CHANGED_EVENT, refreshThemeList);
  }, []);

  const deleteCustomTheme = (id: string) => {
    removeCustomTheme(id);
    refreshThemeList();
    if (themeChoice === customChoiceId(id)) setThemeChoice('default');
  };

  React.useEffect(() => {
    if (window.serverOperator?.getLogFilePath) {
      window.serverOperator.getLogFilePath().then((path: string) => setLogPath(path || ''));
    }
  }, []);

  useEffect(() => {
    applyTheme(themeChoice);
  }, [themeChoice]);

  useEffect(() => {
    saveOpacity(opacity);
    applyOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    saveBlur(blur);
    applyBlur(blur);
  }, [blur]);

  const handleOpenDevTools = async () => {
    if (!window.serverOperator?.openDevTools) {
      setDevtoolsStatus('error');
      return;
    }
    setDevtoolsStatus('opened');
    await window.serverOperator.openDevTools();
    setTimeout(() => setDevtoolsStatus('idle'), 2000);
  };

  const loadLogs = async () => {
    if (!window.serverOperator?.readLogFile) return;
    setLogsLoading(true);
    try {
      const res = await window.serverOperator.readLogFile();
      if (res.ok) {
        setLogsContent(res.content ?? '');
      } else {
        alert(res.error || 'Failed to read logs');
      }
    } catch (e: any) {
      alert(e?.message || 'Error reading log file');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.serverOperator?.clearLogFile) return;
    if (!window.confirm('Are you sure you want to clear the application log file? This cannot be undone.')) {
      return;
    }
    try {
      const res = await window.serverOperator.clearLogFile();
      if (res.ok) {
        setLogsContent('Log file cleared.');
        alert('Logs cleared successfully');
      } else {
        alert(res.error || 'Failed to clear logs');
      }
    } catch (e: any) {
      alert(e?.message || 'Error clearing logs');
    }
  };

  const toggles = Object.keys(flags).filter((k) => k !== 'sidebarUx') as Array<keyof FeatureFlags>;
  const enabledCount = toggles.reduce((c, k) => c + (flags[k] ? 1 : 0), 0);
  const totalCount = toggles.length;
  const percentEnabled = Math.round((enabledCount / totalCount) * 100);

  const filteredFeatures = ALL_FEATURES.filter((item) => {
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      CATEGORIES[item.category].name.toLowerCase().includes(q)
    );
  });

  const handleToggle = (key: keyof FeatureFlags, isSubFeature?: boolean) => {
    if (isSubFeature && !flags.deployModule) return;
    toggleFlag(key);
  };

  const selectedTheme = allThemes.find((t) => t.id === themeChoice) ?? allThemes[0];
  const sw = selectedTheme.swatch;
  const ghostBtn =
    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/30 hover:border-border/60 hover:bg-bg-tertiary/60 text-[11px] font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer';

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {editor && (
        <ThemeEditor
          initial={editor.initial}
          restoreChoice={editor.restore}
          onClose={() => setEditor(null)}
          onSaved={(theme) => {
            refreshThemeList();
            setThemeChoice(customChoiceId(theme.id));
            applyTheme(customChoiceId(theme.id));
            setThemeMessage({ ok: true, text: `Saved "${theme.name}".` });
            setEditor(null);
          }}
        />
      )}
      <div className="p-6 space-y-8">
        {/* Appearance */}
        <section className="rounded-2xl border border-border/30 bg-bg-secondary/25">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border/20">
            <div>
              <h2 className="text-sm font-bold text-text-primary">Appearance</h2>
              <p className="text-[11px] text-text-secondary mt-0.5">Pick a theme and tune window transparency.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={themeFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  void importThemeFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => setEditor({ initial: null, restore: themeChoice })}
                title="Design your own theme with colour pickers"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent text-white text-[11px] font-semibold hover:bg-accent-hover cursor-pointer"
              >
                <Plus size={12} /> Create theme
              </button>
              <button type="button" onClick={() => themeFileRef.current?.click()} title="Load a theme from a JSON file" className={ghostBtn}>
                <Upload size={12} /> Import
              </button>
              <button type="button" onClick={downloadThemeTemplate} title="Download an example theme file to edit" className={ghostBtn}>
                <Download size={12} /> Template
              </button>
              <button type="button" onClick={() => void openThemesFolder()} title="Open the folder where you can drop theme .json files" className={ghostBtn}>
                <FolderOpen size={12} /> Folder
              </button>
              <button type="button" onClick={() => void reloadThemeFolders()} title="Read the theme folders again" className={ghostBtn}>
                <RotateCcw size={12} /> Reload
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 p-5">
            {/* Theme grid */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2.5">Theme</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {allThemes.map((t) => {
                  const active = themeChoice === t.id;
                  return (
                    <div key={t.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => setThemeChoice(t.id)}
                        title={t.desc}
                        className={`w-full text-left rounded-xl border p-2.5 transition-all cursor-pointer ${
                          active ? 'border-accent bg-accent/10 ring-1 ring-accent/40' : 'border-border/30 hover:border-border/70 hover:bg-bg-tertiary/50'
                        }`}
                      >
                        <span className="flex h-7 rounded-md overflow-hidden border border-black/20 mb-2">
                          {t.swatch.map((c, i) => (
                            <span key={i} className="flex-1" style={{ backgroundColor: c }} />
                          ))}
                        </span>
                        <span className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-text-primary truncate">{t.label}</span>
                          {active && <Check size={12} className="text-accent shrink-0" />}
                        </span>
                      </button>
                      {t.customId && (
                        <button
                          type="button"
                          onClick={() => {
                            const ct = customThemes.find((x) => x.id === t.customId);
                            if (ct) setEditor({ initial: ct, restore: themeChoice });
                          }}
                          title="Edit this theme"
                          className="absolute top-1 right-8 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-bg-tertiary border border-border text-text-secondary hover:text-accent"
                        >
                          <Pencil size={10} />
                        </button>
                      )}
                      {t.customId && (
                        <button
                          type="button"
                          onClick={() => deleteCustomTheme(t.customId as string)}
                          title="Remove this custom theme"
                          className="absolute top-1 right-1 hidden group-hover:flex w-5 h-5 items-center justify-center rounded-full bg-bg-tertiary border border-border text-text-secondary hover:text-error"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {themeMessage && (
                <p className={`text-[11px] mt-3 ${themeMessage.ok ? 'text-success' : 'text-error'}`}>{themeMessage.text}</p>
              )}
            </div>

            {/* Preview + sliders */}
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2.5">Preview</p>
                <div className="rounded-xl border border-border/30 overflow-hidden" style={{ backgroundColor: sw[0] }}>
                  <div className="flex h-24">
                    <div className="w-8 border-r border-white/10 flex flex-col items-center gap-1.5 py-2">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-3 h-3 rounded" style={{ backgroundColor: i === 0 ? sw[1] : sw[3], opacity: i === 0 ? 1 : 0.35 }} />
                      ))}
                    </div>
                    <div className="flex-1 p-3 space-y-2">
                      <span className="block h-2 w-1/2 rounded" style={{ backgroundColor: sw[3] }} />
                      <span className="block h-1.5 w-3/4 rounded" style={{ backgroundColor: sw[3], opacity: 0.4 }} />
                      <div className="flex items-center gap-2 pt-1">
                        <span className="h-4 px-2 rounded text-[8px] font-bold flex items-center" style={{ backgroundColor: sw[1], color: sw[0] }}>Button</span>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sw[2] }} />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs font-semibold text-text-primary mt-2">{selectedTheme.label}</p>
                <p className="text-[11px] text-text-secondary leading-relaxed">{selectedTheme.desc}</p>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-text-primary">Window opacity</label>
                    <span className="text-[11px] text-text-secondary font-mono tabular-nums">{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    type="range" min="0.6" max="1" step="0.01" value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                    className="w-full h-1.5 accent-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-0.5"><span>60% (see-through)</span><span>100% (solid)</span></div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-text-primary">Background blur</label>
                    <span className="text-[11px] text-text-secondary font-mono tabular-nums">{blur}px</span>
                  </div>
                  <input
                    type="range" min="4" max="40" step="1" value={blur}
                    onChange={(e) => setBlur(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 accent-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-0.5"><span>Sharp</span><span>Frosted</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* General */}
        <section className="rounded-2xl border border-border/30 bg-bg-secondary/25">
          <div className="px-5 py-4 border-b border-border/20">
            <h2 className="text-sm font-bold text-text-primary">General</h2>
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-xs font-semibold text-text-primary">Activity bar for disabled modules</p>
              <p className="text-[11px] text-text-secondary mt-0.5">Choose whether turned-off modules are hidden from the sidebar or shown greyed out.</p>
            </div>
            <Select
              value={flags.sidebarUx}
              onChange={(val) => setSidebarUx(val as 'hidden' | 'disabled')}
              size="sm"
              containerClassName="w-32 shrink-0"
              options={[
                { value: 'hidden', label: 'Hidden' },
                { value: 'disabled', label: 'Greyed out' },
              ]}
            />
          </div>
        </section>

        {/* Modules header */}
        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-bg-primary/90 backdrop-blur border-b border-border/20">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="mr-auto">
              <h2 className="text-sm font-bold text-text-primary">Feature Modules</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-32 bg-bg-tertiary/40 rounded-full h-1.5 overflow-hidden border border-border/10">
                  <div className="bg-gradient-to-r from-accent to-accent-hover h-1.5 rounded-full transition-all duration-500 ease-out" style={{ width: `${percentEnabled}%` }} />
                </div>
                <span className="text-[11px] font-semibold text-accent">{enabledCount} of {totalCount} active</span>
              </div>
            </div>
            <div className="relative w-64 max-w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
              <input
                type="text"
                placeholder="Search modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-bg-secondary/40 border border-border/30 text-text-primary rounded-xl pl-9 pr-3.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all placeholder:text-text-muted"
              />
            </div>
            <button onClick={resetToDefaults} className={ghostBtn}>
              <RotateCcw size={12} /> Reset modules
            </button>
          </div>
        </div>

      {/* Feature Grid */}
      <div className="space-y-8">
        {/* Core Features (Always Enabled) */}
        {searchQuery === '' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xs font-bold tracking-wide uppercase text-success flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                Core Application Modules
              </h2>
              <p className="text-[11px] text-text-secondary mt-0.5">Essential built-in features that are locked on and always active.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ALL_FEATURES.filter((f) => ['servers', 'files', 'docker', 'deployModule', 'notes', 'aiAssistant', 'configCreators', 'serverAdmin'].includes(f.key)).map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.key}
                    className="relative flex gap-3 p-4 rounded-xl border border-border/30 bg-bg-secondary/30 hover:border-accent/30 hover:bg-bg-secondary/50 transition-all duration-200"
                  >
                    <div className="p-2 rounded-lg shrink-0 flex items-center justify-center bg-accent/10 text-accent border border-accent/20 shadow-sm h-9 w-9">
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-xs font-semibold text-text-primary">{item.title}</h3>
                        <span className="text-[8px] font-bold bg-success/8 text-success px-1.5 py-0.5 rounded-full border border-success/15 uppercase tracking-wider">
                          Always Enabled
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary leading-relaxed mt-1">{item.description}</p>
                    </div>
                    <div className="shrink-0 flex items-center">
                      <button
                        type="button"
                        disabled
                        aria-checked="true"
                        className="relative inline-flex h-5 w-9 shrink-0 bg-accent rounded-full transition-colors duration-200 ease-in-out cursor-not-allowed opacity-60"
                      >
                        <span
                          className="pointer-events-none absolute top-[2px] left-[2px] inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out translate-x-4"
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional Toggles Section */}
        <div className="space-y-8 pt-2">
          {searchQuery === '' && (
            <div className="border-t border-border pt-6">
              <h2 className="text-sm font-bold tracking-wide uppercase text-text-primary">Optional Feature Add-ons</h2>
              <p className="text-xs text-text-secondary mt-0.5">Toggle advanced capabilities, integrations, and deployment subsystems.</p>
            </div>
          )}
          {(Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>).map((catKey) => {
            const catFeatures = filteredFeatures.filter(
              (f) => f.category === catKey && !['servers', 'files', 'docker', 'deployModule', 'notes', 'aiAssistant', 'configCreators', 'serverAdmin'].includes(f.key)
            );
            if (catFeatures.length === 0) return null;
            return (
              <div key={catKey} className="space-y-4">
                <div>
                  <h2 className="text-xs font-bold tracking-wide uppercase text-accent">{CATEGORIES[catKey].name}</h2>
                  <p className="text-[11px] text-text-secondary mt-0.5">{CATEGORIES[catKey].desc}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {catFeatures.map((item) => {
                    const Icon = item.icon;
                    const isChecked = !!flags[item.key];
                    const isParentSuiteDisabled = item.isSubFeature && !flags.deployModule;
                    const isDisabled = isParentSuiteDisabled;
                    return (
                      <div
                        key={item.key}
                        className={`relative flex gap-3 p-4 rounded-xl border border-border/30 bg-bg-secondary/30 transition-all duration-200 ${
                          item.isSubFeature ? 'ml-6 border-dashed border-l-2' : ''
                        } ${isDisabled ? 'opacity-40' : 'hover:border-accent/30 hover:bg-bg-secondary/50'}`}
                      >
                        {item.isSubFeature && (
                          <div className="absolute left-[-16px] top-[50%] w-4 h-[1px] border-t border-dashed border-border/30 pointer-events-none" />
                        )}
                        <div className={`p-2 rounded-lg shrink-0 flex items-center justify-center h-9 w-9 border ${
                          isChecked && !isDisabled
                            ? 'bg-accent/10 text-accent border-accent/20'
                            : 'bg-bg-tertiary/40 text-text-secondary border-border/20'
                        }`}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0 pr-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-xs font-semibold text-text-primary">{item.title}</h3>
                            {isDisabled && (
                              <span className="flex items-center gap-0.5 text-[8px] font-bold bg-bg-tertiary/60 text-text-muted px-1.5 py-0.5 rounded-full border border-border/20 uppercase tracking-wider">
                                <Lock size={7} /> Locked
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-text-secondary leading-relaxed mt-1">{item.description}</p>
                        </div>
                        <div className="shrink-0 flex items-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isChecked && !isDisabled}
                            disabled={isDisabled}
                            onClick={() => handleToggle(item.key, item.isSubFeature)}
                            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-accent/30 ${
                              isChecked && !isDisabled ? 'bg-accent border-transparent' : 'bg-bg-tertiary border-border/30'
                            } ${
                              isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none absolute top-[2px] left-[2px] inline-block h-3.5 w-3.5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                                isChecked && !isDisabled ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {filteredFeatures.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-text-secondary bg-bg-secondary/30 rounded-lg border border-border border-dashed">
            <LayoutGrid className="text-text-muted mb-3" size={32} />
            <p className="text-sm">No modules matched your search query</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-3 text-xs text-accent hover:text-accent-hover font-semibold underline"
            >
              Clear search query
            </button>
          </div>
        )}
        {/* Advanced / Developer Section - Dev Mode only */}
        {process.env.NODE_ENV === 'development' && (
          <div className="border border-border bg-bg-secondary rounded-lg overflow-hidden shrink-0 mt-6">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full flex items-center justify-between px-5 py-4 text-left font-semibold text-sm text-text-primary hover:bg-bg-tertiary/50 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Bug size={16} className="text-error" />
                Advanced / Developer Settings
              </span>
              {advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            {advancedOpen && (
              <div className="p-5 border-t border-border space-y-4 bg-bg-primary/40">
                <p className="text-xs text-text-secondary mb-2">
                  Application debugging tools and diagnostic log paths.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleOpenDevTools}
                    className={`flex items-center gap-2 px-3 py-2 rounded border text-xs font-medium transition-all ${
                      devtoolsStatus === 'opened'
                        ? 'bg-success/10 border-success text-success'
                        : 'bg-bg-secondary border-border hover:border-accent text-text-primary hover:text-accent'
                    }`}
                  >
                    <Terminal size={14} />
                    {devtoolsStatus === 'opened' ? 'DevTools Opened!' : 'Open DevTools (Inspect App)'}
                  </button>

                  <button
                    type="button"
                    onClick={loadLogs}
                    className="flex items-center gap-2 px-3 py-2 rounded border bg-bg-secondary border-border hover:border-accent text-text-primary hover:text-accent text-xs font-medium transition-all"
                  >
                    <FileText size={14} className={logsLoading ? 'animate-spin' : ''} />
                    View Application Logs
                  </button>

                  <button
                    type="button"
                    onClick={handleClearLogs}
                    className="flex items-center gap-2 px-3 py-2 rounded border border-transparent hover:border-error/30 hover:bg-error/10 text-text-secondary hover:text-error text-xs font-medium transition-all"
                  >
                    <Trash2 size={14} />
                    Clear Log File
                  </button>
                </div>

                {logPath && (
                  <div className="pt-3 border-t border-border">
                    <span className="text-[10px] uppercase tracking-wider text-text-muted block mb-1">
                      Log File Path
                    </span>
                    <span
                      className="text-xs font-mono text-text-secondary break-all select-all hover:text-text-primary cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(logPath);
                        alert('Log path copied to clipboard');
                      }}
                    >
                      {logPath}
                    </span>
                  </div>
                )}

                {logsContent && (
                  <div className="mt-4 border border-border bg-bg-secondary rounded-md p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-bold text-text-primary">Application Log Contents:</span>
                      <button
                        type="button"
                        onClick={() => setLogsContent('')}
                        className="text-xs text-text-muted hover:text-text-primary font-semibold"
                      >
                        Close Logs
                      </button>
                    </div>
                    <pre className="font-mono text-[10px] text-text-secondary max-h-60 overflow-y-auto whitespace-pre-wrap break-all p-2 rounded bg-bg-primary">
                      {logsContent}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CLOUDINARY SETTINGS VIEW
───────────────────────────────────────────── */
function CloudinarySettingsView() {
  const [cloudName, setCloudName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    (async () => {
      if (!window.serverOperator?.cloudinaryLoadConfig) return;
      setLoading(true);
      const res = await window.serverOperator.cloudinaryLoadConfig();
      if (res.ok && res.config) {
        setCloudName(res.config.cloudName);
        setApiKey(res.config.apiKey);
        setHasConfig(true);
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!cloudName.trim() || !apiKey.trim() || !apiSecret.trim()) {
      setMessage({ type: 'error', text: 'All fields are required.' });
      return;
    }
    if (!window.serverOperator?.cloudinarySaveConfig) return;
    setSaving(true);
    setMessage(null);
    const res = await window.serverOperator.cloudinarySaveConfig({
      cloudName: cloudName.trim(),
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
    });
    setSaving(false);
    if (res.ok) {
      setHasConfig(true);
      setMessage({ type: 'success', text: 'Cloudinary configuration saved.' });
    } else {
      setMessage({ type: 'error', text: res.error || 'Failed to save' });
    }
  };

  const handleTest = async () => {
    if (!window.serverOperator?.cloudinaryListBackups) return;
    setTesting(true);
    setMessage(null);
    const res = await window.serverOperator.cloudinaryListBackups();
    setTesting(false);
    if (res.ok) {
      setMessage({ type: 'success', text: `Connection successful! ${res.backups?.length || 0} backup(s) found.` });
    } else {
      setMessage({ type: 'error', text: res.error || 'Connection failed' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted">
        <Loader2 size={16} className="animate-spin mr-2" />
        <span className="text-xs">Loading Cloudinary configuration...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2.5 rounded-xl bg-bg-tertiary text-accent border border-border/15">
          <Cloud size={18} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary">Cloudinary Backup</h2>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Connect Cloudinary to push and pull database backups across any SSH server.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border/20 bg-bg-secondary/35 p-5 space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted">Cloud Name</label>
          <input
            type="text"
            value={cloudName}
            onChange={(e) => setCloudName(e.target.value)}
            placeholder="your-cloud-name"
            className="w-full px-3.5 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted">API Key</label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="123456789012345"
            className="w-full px-3.5 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted">API Secret</label>
          <input
            type="password"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder={hasConfig ? '•••••••• (stored)' : 'your-api-secret'}
            className="w-full px-3.5 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover disabled:opacity-50 cursor-pointer transition-colors shadow-sm"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Credentials
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !hasConfig}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-xs font-semibold hover:border-border/60 hover:bg-bg-tertiary disabled:opacity-40 cursor-pointer transition-all"
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Cloud size={13} />}
            Test Connection
          </button>
        </div>

        {message && (
          <div className={`p-3 rounded-xl text-xs font-mono ${
            message.type === 'success' ? 'bg-success/10 border border-success/20 text-success' : 'bg-error/10 border border-error/20 text-error'
          }`}>
            {message.text}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border/20 bg-bg-secondary/35 p-5 space-y-3">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">How it works</h3>
        <ul className="text-[11px] text-text-secondary space-y-2 leading-relaxed">
          <li>1. Enter your Cloudinary credentials above and save them once.</li>
          <li>2. Open the <strong className="text-text-primary">Database</strong> tab and connect to any remote database.</li>
          <li>3. Click <strong className="text-text-primary">Get Backup</strong> to export and upload the database SQL to Cloudinary.</li>
          <li>4. Connect to a <strong className="text-text-primary">different SSH server</strong>, open the Database tab, and use <strong className="text-text-primary">Restore from Cloudinary</strong> to import the backup.</li>
        </ul>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN SETTINGS VIEW  (tab shell)
───────────────────────────────────────────── */
type SettingsTab = 'modules' | 'changelog' | 'cloudinary';

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('modules');

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'modules',   label: 'Feature Modules', icon: Sliders },
    { id: 'cloudinary', label: 'Cloudinary',      icon: Cloud },
    { id: 'changelog', label: 'Changelog',       icon: ScrollText },
  ];

  return (
    <div className="flex flex-col h-full bg-bg-primary text-text-primary font-sans overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/30 px-6 pt-5 pb-0 shrink-0 bg-bg-secondary/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4 pb-3.5">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Sliders className="text-accent" size={18} />
              Settings
            </h1>
            <p className="text-[11px] text-text-secondary mt-0.5">
              Manage feature modules, preferences, and view release notes.
            </p>
          </div>
          {/* Version badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider border border-indigo-500/20 bg-indigo-500/5 text-indigo-400"
            >
              v{packageJson.version}
            </span>
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-amber-500/20 bg-amber-500/5 text-amber-400 hidden sm:inline-flex"
            >
              ✦ {CHANGELOG[0].codename}
            </span>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1.5 pb-2.5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 ${
                activeTab === id
                  ? 'bg-bg-tertiary text-text-primary border border-border/25 shadow-md shadow-black/10'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/40'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {activeTab === 'modules'    && <ModulesView />}
        {activeTab === 'cloudinary' && <CloudinarySettingsView />}
        {activeTab === 'changelog'  && <ChangelogView />}
      </div>
    </div>
  );
}
