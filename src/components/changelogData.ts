import { Database, GitBranch, History, TerminalSquare, Sliders, Shield, Sparkles } from 'lucide-react';
import React from 'react';

export interface ChangeEntry {
  type: 'feat' | 'fix' | 'improve' | 'core';
  text: string;
}

export interface ChangeGroup {
  label: string;
  icon: React.ComponentType<any>;
  color: string;
  items: ChangeEntry[];
}

export interface ChangelogVersion {
  version: string;
  codename: string;
  date: string;
  summary: string;
  groups: ChangeGroup[];
}

export const CHANGELOG: ChangelogVersion[] = [
  {
    version: '2.0.1',
    codename: 'Glass Harbor',
    date: '2026-06-12',
    summary:
      'This release adds real local workspace support, the new `serop` folder launcher, inline SQL row editing, a glassy terminal-style appearance option, and a much more capable deploy assistant with cleaner chat rendering and project-aware command suggestions.',
    groups: [
      {
        label: 'Local Workspace Mode',
        icon: TerminalSquare,
        color: '#93c5fd',
        items: [
          { type: 'feat', text: 'Added a Local Workspace connection type so you can open a folder from your own machine inside Server Operator without SSH.' },
          { type: 'feat', text: 'Local workspaces now support file browsing, terminal access, Docker inspection, compose logs, database tooling, deploy commands, and `.serop` shortcuts.' },
          { type: 'feat', text: 'Added startup folder handoff so launching the app with a folder automatically opens it as a local workspace profile.' },
          { type: 'feat', text: 'Added the new `serop` launcher flow so `serop .` opens Server Operator directly in the current directory.' },
        ],
      },
      {
        label: 'Deploy Assistant & Shortcuts',
        icon: Sparkles,
        color: '#f0abfc',
        items: [
          { type: 'improve', text: 'Deploy AI chat now returns real answers plus optional runnable commands instead of command-only output.' },
          { type: 'improve', text: 'Added response parsing, malformed-tag recovery, model fallback on Groq rate limits, and cleaner command presentation cards.' },
          { type: 'fix', text: 'Normalized deploy project paths to absolute remote paths so project switching no longer breaks with relative `cd` commands.' },
          { type: 'feat', text: 'Moved deploy project chips, context, and `.serop` shortcuts into the main sidebar with accordion-based command editing and direct run actions.' },
        ],
      },
      {
        label: 'Database Editing & Appearance',
        icon: Database,
        color: '#6ee7b7',
        items: [
          { type: 'feat', text: 'Added first-pass inline table editing for SQL databases, including row update, insert, and delete actions for table browse views.' },
          { type: 'improve', text: 'Table metadata is now used to detect primary keys and build safer row predicates for edits and deletes.' },
          { type: 'feat', text: 'Added a new Glassy Terminal appearance mode for a transparent, blurred, Linux-terminal-inspired desktop theme.' },
        ],
      },
    ],
  },
  {
    version: '1.0.1',
    codename: 'Amber Anchor',
    date: '2026-06-02',
    summary:
      'This release introduces critical SSH stability improvements, a connection queuing manager to prevent session exhaustion, custom toggles, password visibility eye toggles, multi-architecture macOS build support, Tailwind CSS v4 styling migration, and significant CPU optimization by removing redundant periodic uptime monitoring loops.',
    groups: [
      {
        label: 'SSH Stability & Queuing',
        icon: Shield,
        color: '#a7f3d0',
        items: [
          { type: 'feat', text: 'Implemented a sequential FIFO Promise queue (connectionQueues) to serialize remote execution requests and prevent MaxSessions channel open failures.' },
          { type: 'feat', text: 'Added SSH keepalive heartbeats (keepaliveInterval: 10000, keepaliveCountMax: 3) to automatically teardown dead or timed-out connection sockets.' },
          { type: 'fix', text: 'Cleared connection queue state upon socket closure, errors, or idle timeout evictions to prevent reference memory leaks.' },
          { type: 'improve', text: 'Completely removed the 60-second periodic background uptime monitoring checks to eliminate unnecessary SSH load on servers.' },
        ],
      },
      {
        label: 'Visual Refinements & Controls',
        icon: Sliders,
        color: '#f0abfc',
        items: [
          { type: 'feat', text: 'Integrated an interactive eye icon visibility toggle for masked server passwords under the Authentication table column.' },
          { type: 'feat', text: 'Replaced native browser checkboxes across server configuration forms, Docker views, and settings with sleek custom React buttons.' },
          { type: 'fix', text: 'Fixed bottom terminal active checks to prevent active SSH stream sessions from unmounting and disconnecting during drawer toggles.' },
          { type: 'improve', text: 'Migrated custom UI styling and theme colors to Tailwind CSS v4 design specifications.' },
        ],
      },
      {
        label: 'Deployment & Core Infrastructure',
        icon: Sparkles,
        color: '#fb923c',
        items: [
          { type: 'feat', text: 'Configured explicit multi-arch macOS targets supporting both Apple Silicon (ARM64) and Intel (x64) architectures.' },
          { type: 'improve', text: 'Refined Certbot automatic SSL detection and status verification logic for server domains.' },
          { type: 'improve', text: 'Optimized Tor SOCKS5 proxy toggle defaults for SSH connections.' },
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    codename: 'Cobalt Catalyst',
    date: '2026-05-27',
    summary:
      'The first full release of Serop — a desktop server management suite built on Electron, React, and SSH. Cobalt Catalyst introduces an auto-updating notification system, a custom app logo icon, and a default-disabled feature toggling mechanism.',
    groups: [
      {
        label: 'Auto-Update System',
        icon: Sparkles,
        color: '#a7f3d0',
        items: [
          { type: 'feat', text: 'GitHub Releases API silent check to automatically check for new versions on launch' },
          { type: 'feat', text: 'Non-intrusive floating toast alerts for new release tags with an expandable changelog body' },
          { type: 'feat', text: 'Persistent version dismissals stored in local storage to prevent duplicate alerts' },
          { type: 'feat', text: 'Check for Updates option inside the application Help menu' },
        ],
      },
      {
        label: 'Visual Identity & Custom Icon',
        icon: Sliders,
        color: '#f0abfc',
        items: [
          { type: 'feat', text: 'New custom-designed squircle brand logo mark deployed at all standard system icon sizes' },
          { type: 'feat', text: 'Support for dynamic Dock icon loading at runtime during macOS development' },
        ],
      },
      {
        label: 'Disabled-by-Default Feature Suite',
        icon: Sliders,
        color: '#fb923c',
        items: [
          { type: 'feat', text: 'All optional server and deployment modules disabled by default on clean installations' },
          { type: 'feat', text: 'On-demand opt-in control panel allowing users to only turn on features they require' },
        ],
      },
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
