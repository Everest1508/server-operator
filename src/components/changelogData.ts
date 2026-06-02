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
