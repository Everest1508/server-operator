import React, { useState, useEffect } from 'react';
import { useFeatureFlags } from '../contexts/FeatureFlagContext';
import { FeatureFlags, CloudinaryConfig } from '../types';
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
} from 'lucide-react';

import { CHANGELOG, ChangeEntry } from './changelogData';
import { Select } from './Select';
import packageJson from '../../package.json';

const THEME_STORAGE_KEY = 'server-operator:theme';
const OPACITY_STORAGE_KEY = 'server-operator:opacity';
const BLUR_STORAGE_KEY = 'server-operator:blur';

function loadThemeChoice(): 'default' | 'glassy' {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'glassy' ? 'glassy' : 'default';
  } catch {
    return 'default';
  }
}

function applyThemeChoice(theme: 'default' | 'glassy') {
  document.documentElement.dataset.appTheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore
  }
}

function loadOpacity(): number {
  try {
    const raw = localStorage.getItem(OPACITY_STORAGE_KEY);
    if (raw === null) return 0.92;
    const v = parseFloat(raw);
    return isFinite(v) ? Math.max(0.6, Math.min(1, v)) : 0.92;
  } catch {
    return 0.92;
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
  const [themeChoice, setThemeChoice] = useState<'default' | 'glassy'>(loadThemeChoice);
  const [opacity, setOpacity] = useState<number>(loadOpacity);
  const [blur, setBlur] = useState<number>(loadBlur);

  React.useEffect(() => {
    if (window.serverOperator?.getLogFilePath) {
      window.serverOperator.getLogFilePath().then((path: string) => setLogPath(path || ''));
    }
  }, []);

  useEffect(() => {
    applyThemeChoice(themeChoice);
  }, [themeChoice]);

  useEffect(() => {
    saveOpacity(opacity);
    window.serverOperator?.setWindowOpacity?.(opacity);
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

  return (
    <>
      {/* Search & Global Prefs */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 px-6 pt-4 pb-2 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
          <input
            type="text"
            placeholder="Search settings & modules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-bg-secondary/40 border border-border/30 text-text-primary rounded-xl pl-9 pr-3.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all placeholder:text-text-muted"
          />
        </div>
        <div className="flex items-center gap-2.5 bg-bg-secondary/40 px-3 py-1.5 rounded-xl border border-border/30 self-start md:self-auto">
          <span className="text-[11px] text-text-secondary font-semibold whitespace-nowrap">Activity Bar:</span>
          <Select
            value={flags.sidebarUx}
            onChange={(val) => setSidebarUx(val as 'hidden' | 'disabled')}
            size="sm"
            containerClassName="w-24"
            options={[
              { value: 'hidden', label: 'Hidden' },
              { value: 'disabled', label: 'Disabled' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2.5 bg-bg-secondary/40 px-3 py-1.5 rounded-xl border border-border/30 self-start md:self-auto">
          <span className="text-[11px] text-text-secondary font-semibold whitespace-nowrap">Appearance:</span>
          <Select
            value={themeChoice}
            onChange={(val) => setThemeChoice(val as 'default' | 'glassy')}
            size="sm"
            containerClassName="w-36"
            options={[
              { value: 'default', label: 'Default' },
              { value: 'glassy', label: 'Glassy Terminal' },
            ]}
          />
        </div>
        <button
          onClick={resetToDefaults}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-tertiary/60 hover:bg-bg-tertiary border border-border/30 hover:border-border/60 text-text-primary rounded-xl text-xs font-semibold transition-all duration-150 self-start md:self-auto"
        >
          <RotateCcw size={13} />
          Reset Defaults
        </button>
      </div>

      {/* Progress Bar */}
      <div className="px-6 pb-4 shrink-0">
        <div className="mb-3 rounded-xl border border-border/20 bg-bg-secondary/25 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-text-primary">Theme Preview</p>
              <p className="text-[11px] text-text-secondary mt-0.5">
                {themeChoice === 'glassy'
                  ? 'Transparent layered panels with a Linux-terminal-style glass look.'
                  : 'Standard dark operator theme with solid panels.'}
              </p>
            </div>
            <div className={`h-12 w-24 rounded-xl border border-border/20 shadow-sm ${themeChoice === 'glassy' ? 'bg-white/8 backdrop-blur-md' : 'bg-bg-primary/80'}`}>
              <div className="h-full w-full rounded-xl bg-[radial-gradient(circle_at_top_left,rgba(0,120,212,0.28),transparent_55%)]" />
            </div>
          </div>
        </div>
        <div className="mb-3 rounded-xl border border-border/20 bg-bg-secondary/25 px-3.5 py-2.5 flex items-center gap-3">
          <span className="text-[11px] text-text-secondary font-semibold whitespace-nowrap">Opacity</span>
          <input
            type="range"
            min="0.6"
            max="1"
            step="0.01"
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="flex-1 h-1.5 accent-accent cursor-pointer"
          />
          <span className="text-[11px] text-text-primary font-mono tabular-nums w-8 text-right">{Math.round(opacity * 100)}%</span>
        </div>
        <div className="mb-3 rounded-xl border border-border/20 bg-bg-secondary/25 px-3.5 py-2.5 flex items-center gap-3">
          <span className="text-[11px] text-text-secondary font-semibold whitespace-nowrap">Blur</span>
          <input
            type="range"
            min="4"
            max="40"
            step="1"
            value={blur}
            onChange={(e) => setBlur(parseInt(e.target.value, 10))}
            className="flex-1 h-1.5 accent-accent cursor-pointer"
          />
          <span className="text-[11px] text-text-primary font-mono tabular-nums w-8 text-right">{blur}px</span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-semibold mb-1">
          <span className="text-text-secondary">Modules Active</span>
          <span className="text-accent">{enabledCount} / {totalCount} ({percentEnabled}%)</span>
        </div>
        <div className="w-full bg-bg-tertiary/40 rounded-full h-1.5 overflow-hidden border border-border/10">
          <div
            className="bg-gradient-to-r from-accent to-accent-hover h-1.5 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentEnabled}%` }}
          />
        </div>
      </div>

      {/* Feature Grid */}
      <div className="p-6 pt-2 space-y-8 flex-1 overflow-y-auto">
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
    </>
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
              ✦ Iron Forge
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
