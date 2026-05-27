import React, { useState } from 'react';
import { useFeatureFlags } from '../contexts/FeatureFlagContext';
import { FeatureFlags } from '../types';
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
  GitBranch,
  Database,
  Shield,
  TerminalSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

/* ─────────────────────────────────────────────
   CHANGELOG DATA
───────────────────────────────────────────── */
interface ChangeEntry {
  type: 'feat' | 'fix' | 'improve' | 'core';
  text: string;
}

interface ChangeGroup {
  label: string;
  icon: React.ComponentType<any>;
  color: string;
  items: ChangeEntry[];
}

interface ChangelogVersion {
  version: string;
  codename: string;
  date: string;
  summary: string;
  groups: ChangeGroup[];
}

const CHANGELOG: ChangelogVersion[] = [
  {
    version: '1.0.0',
    codename: 'Iron Forge',
    date: '2026-05-27',
    summary:
      'The first full release of Serop — a desktop server management suite built on Electron, React, and SSH. Iron Forge ships every foundational module, from live SSH terminals to AI-assisted diagnostics.',
    groups: [
      {
        label: 'SQL Query Runner',
        icon: Database,
        color: '#6ee7b7',
        items: [
          { type: 'feat', text: 'Monaco Editor input with SQL syntax highlighting for MySQL and PostgreSQL' },
          { type: 'feat', text: 'Run button that executes queries over the SSH-tunneled database connection' },
          { type: 'feat', text: 'Paginated results table with row count and execution time display' },
          { type: 'feat', text: 'Inline error reporting for database and connection failures' },
          { type: 'feat', text: 'Autocomplete for table names pulled from the live schema' },
        ],
      },
      {
        label: 'Git Deployment Pipeline',
        icon: GitBranch,
        color: '#93c5fd',
        items: [
          { type: 'feat', text: 'Server + project directory selector with one-click Deploy action' },
          { type: 'feat', text: 'SSHes in and runs git pull, npm install / pip install, migrations, and service restart' },
          { type: 'feat', text: 'Supports pm2 restart and systemctl restart as service managers' },
          { type: 'feat', text: 'Real-time output streamed into the integrated terminal during deployment' },
          { type: 'feat', text: 'Terminal input is locked while a deployment is in progress' },
        ],
      },
      {
        label: 'Deployment History & Rollbacks',
        icon: History,
        color: '#fbbf24',
        items: [
          { type: 'feat', text: 'All deploys logged to a local SQLite table (timestamp, branch, commit hash, status, output)' },
          { type: 'feat', text: 'Per-server/project deploy history list with colored success/failure badges' },
          { type: 'feat', text: 'Visual log viewer with expandable terminal output per deploy entry' },
          { type: 'feat', text: 'Rollback button — SSHes in, runs git checkout <commit>, and restarts the service' },
        ],
      },
      {
        label: 'Terminal Snippet Library',
        icon: TerminalSquare,
        color: '#d8b4fe',
        items: [
          { type: 'feat', text: 'Save commands with a title, description, and body to a persistent local library' },
          { type: 'feat', text: 'Searchable side panel with instant fuzzy filtering across all snippets' },
          { type: 'feat', text: 'Click a snippet to paste it directly into the active terminal' },
          { type: 'feat', text: 'Variable placeholder support: {{domain}}, {{port}}, etc. — prompts for values before pasting' },
          { type: 'feat', text: 'Copy-to-clipboard button on every snippet card' },
          { type: 'feat', text: 'Seed snippets included out of the box (nginx reload, pm2 status, docker prune, etc.)' },
        ],
      },
      {
        label: 'Feature Settings & Module Toggles',
        icon: Sliders,
        color: '#fb923c',
        items: [
          { type: 'feat', text: 'Dedicated Feature Modules Settings screen accessible from the activity bar' },
          { type: 'feat', text: 'Every major feature individually toggleable with live hot-swap (no restart required)' },
          { type: 'feat', text: 'Hierarchical flag logic: disabling the Deploy Suite auto-disables all sub-features' },
          { type: 'feat', text: 'Activity bar behavior setting: hide disabled icons OR gray them out with a padlock' },
          { type: 'feat', text: 'Full-text search across all module names and descriptions' },
          { type: 'feat', text: 'Progress bar showing percentage of active modules' },
          { type: 'feat', text: 'Flags persisted to features.json in Electron userData — survive restarts' },
          { type: 'feat', text: 'Sidebar auto-hides when Settings is the active view for a clean full-width layout' },
        ],
      },
      {
        label: 'Core Infrastructure',
        icon: Shield,
        color: '#34d399',
        items: [
          { type: 'core', text: 'Electron + React + TypeScript foundation with Vite bundler' },
          { type: 'core', text: 'SSH connection manager with EC2 key-pair, password, and Cloudflare Tunnel modes' },
          { type: 'core', text: 'Tor SOCKS5 proxy support for anonymous SSH connections' },
          { type: 'core', text: 'Remote file explorer with Monaco editor, uploads, downloads, and search' },
          { type: 'core', text: 'Docker container monitor — logs, rebuilds, and service status management' },
          { type: 'core', text: 'Server admin panel with OS info, service controller, and performance charts' },
          { type: 'core', text: 'Config creator wizards for systemd units and Nginx reverse-proxy blocks' },
          { type: 'core', text: 'AI assistant integration for shell diagnostics and query optimization' },
          { type: 'core', text: 'Persistent markdown notes synced with the Monaco editor workspace' },
        ],
      },
    ],
  },
];

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
    key: 'shortcuts',
    title: 'Quick Command Shortcuts',
    description: 'Define and trigger quick commands, hotkeys, and shell hooks directly on your active server connections.',
    category: 'advanced',
    icon: Sliders,
  },
  {
    key: 'serverAdmin',
    title: 'Server Admin Tools',
    description: 'Deep operating system manager, service status controller, performance monitoring history charts, and alerts dashboard.',
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
  {
    key: 'snippetLibrary',
    title: 'Snippet Library',
    description: 'Library to save, search, and paste reusable commands. Prompts dynamically for variable parameters like {{domain}}.',
    category: 'deploy',
    icon: Terminal,
    isSubFeature: true,
  },
];

const CATEGORIES = {
  core: { name: 'Core Modules', desc: 'Essential connection and tree operations' },
  advanced: { name: 'Advanced Operations', desc: 'Enhanced container, config, and system monitors' },
  integrations: { name: 'Integrations', desc: 'Intelligent assistants and notes engines' },
  deploy: { name: 'Deploy & Server Tools', desc: 'Pipelines, history rollbacks, and snippet triggers' },
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
            className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6 p-5 rounded-xl border border-[var(--border)] relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(var(--accent-rgb,99,102,241),0.08) 0%, transparent 70%)' }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse at 0% 0%, rgba(99,102,241,0.12) 0%, transparent 60%)'
            }} />
            <div className="relative flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-widest border"
                  style={{ color: '#a5b4fc', borderColor: 'rgba(165,180,252,0.3)', background: 'rgba(165,180,252,0.08)' }}
                >
                  v{ver.version}
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                  style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)' }}
                >
                  ✦ {ver.codename}
                </span>
                <span className="text-xs text-[var(--text-muted)] ml-auto">{ver.date}</span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">{ver.summary}</p>
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
                  className="rounded-lg border border-[var(--border)] overflow-hidden bg-[var(--bg-secondary)]"
                >
                  {/* Group Header */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-tertiary)]/50 transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ background: `${group.color}18`, color: group.color }}
                    >
                      <GroupIcon size={15} />
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-primary)] flex-1">{group.label}</span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                      style={{ color: group.color, borderColor: `${group.color}30`, background: `${group.color}10` }}
                    >
                      {group.items.length} changes
                    </span>
                    {isOpen
                      ? <ChevronUp size={14} className="text-[var(--text-muted)] shrink-0" />
                      : <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />
                    }
                  </button>

                  {/* Items */}
                  {isOpen && (
                    <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)]/50">
                      {group.items.map((entry, i) => {
                        const badge = TYPE_BADGE[entry.type];
                        return (
                          <li key={i} className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--bg-tertiary)]/30 transition-colors">
                            <span
                              className="mt-0.5 shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider"
                              style={{ color: badge.color, background: badge.bg }}
                            >
                              {badge.label}
                            </span>
                            <span className="text-xs text-[var(--text-secondary)] leading-relaxed">{entry.text}</span>
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
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 px-6 pt-4 pb-2 shrink-0">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
          <input
            type="text"
            placeholder="Search settings & modules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] rounded-md pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="flex items-center gap-3 bg-[var(--bg-secondary)] px-3 py-1.5 rounded-md border border-[var(--border)] self-start md:self-auto">
          <span className="text-xs text-[var(--text-secondary)] font-medium whitespace-nowrap">Activity Bar Behavior:</span>
          <select
            value={flags.sidebarUx}
            onChange={(e) => setSidebarUx(e.target.value as 'hidden' | 'disabled')}
            className="bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="hidden">Hidden (Hide Disabled Icons)</option>
            <option value="disabled">Disabled (Gray Out with Padlock)</option>
          </select>
        </div>
        <button
          onClick={resetToDefaults}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text-primary)] rounded-md text-xs font-medium transition-colors self-start md:self-auto"
        >
          <RotateCcw size={14} />
          Reset
        </button>
      </div>

      {/* Progress Bar */}
      <div className="px-6 pb-3 shrink-0">
        <div className="flex items-center justify-between text-xs font-semibold mb-1">
          <span className="text-[var(--text-secondary)]">Modules Active</span>
          <span className="text-[var(--accent)]">{enabledCount} / {totalCount} ({percentEnabled}%)</span>
        </div>
        <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden border border-[var(--border)]">
          <div
            className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] h-1.5 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percentEnabled}%` }}
          />
        </div>
      </div>

      {/* Feature Grid */}
      <div className="p-6 pt-2 space-y-8 flex-1 overflow-y-auto">
        {(Object.keys(CATEGORIES) as Array<keyof typeof CATEGORIES>).map((catKey) => {
          const catFeatures = filteredFeatures.filter((f) => f.category === catKey);
          if (catFeatures.length === 0) return null;
          return (
            <div key={catKey} className="space-y-4">
              <div>
                <h2 className="text-sm font-bold tracking-wide uppercase text-[var(--accent)]">{CATEGORIES[catKey].name}</h2>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">{CATEGORIES[catKey].desc}</p>
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
                      className={`relative flex gap-3 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] transition-all duration-150 ${
                        item.isSubFeature ? 'ml-6 border-dashed border-l-2' : ''
                      } ${isDisabled ? 'opacity-40' : 'hover:border-[var(--text-muted)]/40 hover:bg-[var(--bg-secondary)]/60'}`}
                    >
                      {item.isSubFeature && (
                        <div className="absolute left-[-16px] top-[50%] w-4 h-[1px] border-t border-dashed border-[var(--border)] pointer-events-none" />
                      )}
                      <div className={`p-2 rounded-md shrink-0 flex items-center justify-center ${
                        isChecked && !isDisabled ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                      }`}>
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-semibold truncate text-[var(--text-primary)]">{item.title}</h3>
                          {isDisabled && (
                            <span className="flex items-center gap-0.5 text-[10px] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-1 py-0.5 rounded border border-[var(--border)]">
                              <Lock size={8} /> Parent Off
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">{item.description}</p>
                      </div>
                      <div className="shrink-0 flex items-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked && !isDisabled}
                          disabled={isDisabled}
                          onClick={() => handleToggle(item.key, item.isSubFeature)}
                          style={{
                            background: isChecked && !isDisabled ? 'var(--accent)' : 'var(--bg-tertiary)',
                            border: isChecked && !isDisabled ? '1px solid transparent' : '1px solid var(--border)',
                          }}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                            isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              transform: isChecked && !isDisabled ? 'translateX(20px)' : 'translateX(2px)',
                            }}
                            className="pointer-events-none absolute top-[2px] inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out"
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

        {filteredFeatures.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)] bg-[var(--bg-secondary)]/30 rounded-lg border border-[var(--border)] border-dashed">
            <LayoutGrid className="text-[var(--text-muted)] mb-3" size={32} />
            <p className="text-sm">No modules matched your search query</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-3 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-semibold underline"
            >
              Clear search query
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
   MAIN SETTINGS VIEW  (tab shell)
───────────────────────────────────────────── */
type SettingsTab = 'modules' | 'changelog';

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('modules');

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'modules',   label: 'Feature Modules', icon: Sliders },
    { id: 'changelog', label: 'Changelog',        icon: ScrollText },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans overflow-hidden">
      {/* ── Header ─────────────────────────────── */}
      <div className="border-b border-[var(--border)] px-6 pt-6 pb-0 shrink-0 bg-[var(--bg-secondary)]/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between gap-4 pb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Sliders className="text-[var(--accent)]" size={22} />
              Settings
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Manage feature modules, preferences, and view release notes.
            </p>
          </div>
          {/* Version badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="px-2.5 py-1 rounded-full text-xs font-bold tracking-widest border"
              style={{ color: '#a5b4fc', borderColor: 'rgba(165,180,252,0.3)', background: 'rgba(165,180,252,0.08)' }}
            >
              v1.0.0
            </span>
            <span
              className="px-2.5 py-1 rounded-full text-xs font-semibold border hidden sm:inline-flex"
              style={{ color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.08)' }}
            >
              ✦ Iron Forge
            </span>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-0">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors duration-150 ${
                activeTab === id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {activeTab === 'modules'   && <ModulesView />}
        {activeTab === 'changelog' && <ChangelogView />}
      </div>
    </div>
  );
}
