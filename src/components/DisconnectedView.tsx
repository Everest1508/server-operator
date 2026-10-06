import {
  FolderOpen, Box, Database, ShieldCheck, CloudUpload, FileText, Check, LogIn, Loader2, Plus, Server, MonitorCog,
} from 'lucide-react';
import type { ServerConnection, ViewId } from '../types';

type FeatureView = Extract<ViewId, 'files' | 'docker' | 'database' | 'firewall' | 'deploy' | 'notes'>;

const CONTENT: Record<FeatureView, { icon: typeof Box; title: string; tagline: string; points: string[]; needs: string }> = {
  files: {
    icon: FolderOpen,
    title: 'File Explorer',
    tagline: 'Browse and edit files on your server as if they were local.',
    points: [
      'Remote file tree with a Monaco editor (the editor from VS Code)',
      'Upload and download files straight from the tree',
      'Create, rename, copy, move and delete files and folders',
      'Save protected files with sudo when you need to',
    ],
    needs: 'Pick a server to load its files.',
  },
  docker: {
    icon: Box,
    title: 'Docker Console',
    tagline: 'See what is running and control it without typing docker commands.',
    points: [
      'All containers with live status',
      'Docker Compose services: start, stop, restart, rebuild',
      'Stream container logs and open a shell inside a container',
      'Add compose files per server and keep them for next time',
    ],
    needs: 'Pick a server to list its containers.',
  },
  database: {
    icon: Database,
    title: 'Database Manager',
    tagline: 'Query MySQL, PostgreSQL and Redis through a secure SSH tunnel.',
    points: [
      'Connect to databases that are not exposed to the internet',
      'Run SQL, browse tables and inspect results',
      'Open SQLite files that live on the server',
      'Push and pull backups with Cloudinary',
    ],
    needs: 'Pick a server to reach its databases.',
  },
  firewall: {
    icon: ShieldCheck,
    title: 'Firewall & Ports',
    tagline: 'Check which ports are open and change UFW rules safely.',
    points: [
      'Review the current UFW status and rules',
      'Allow or deny a port with a click',
      'Scan ports with nmap to see what is reachable',
      'Quick reference for common ports and UFW commands',
    ],
    needs: 'Pick a server to inspect its firewall.',
  },
  deploy: {
    icon: CloudUpload,
    title: 'Deploy',
    tagline: 'Ship code with Git pulls, builds and one-click shortcuts.',
    points: [
      'Pull and build a project on the server',
      'Run shortcuts from your project’s .server-operator folder',
      'Deployment history with logs and rollbacks',
      'Run everything in a terminal so you can watch it',
    ],
    needs: 'Pick a server to deploy to.',
  },
  notes: {
    icon: FileText,
    title: 'Notes & Debug',
    tagline: 'Keep notes and checklists next to the server they are about.',
    points: [
      'Markdown notes saved for each server',
      'Server checklists and runbooks',
      'Open and edit notes in the same editor as your files',
      'Debug helpers for the app itself',
    ],
    needs: 'General notes and debug tools on the left work without a server. Pick one for server notes.',
  },
};

interface Props {
  view: FeatureView;
  servers: ServerConnection[];
  connectingTo: string | null;
  onSelectServer: (s: ServerConnection) => void;
  onManageServers: () => void;
}

export function DisconnectedView({ view, servers, connectingTo, onSelectServer, onManageServers }: Props) {
  const c = CONTENT[view];
  const Icon = c.icon;

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-bg-primary select-none">
      <div className="min-h-full w-full max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-10 p-8 items-center">
        {/* What this does */}
        <div>
          <div className="inline-flex p-3.5 rounded-2xl bg-accent/10 text-accent border border-accent/20 mb-5">
            <Icon size={28} />
          </div>
          <h1 className="text-xl font-bold text-text-primary">{c.title}</h1>
          <p className="text-sm text-text-secondary mt-1.5 leading-relaxed">{c.tagline}</p>
          <ul className="mt-6 space-y-3">
            {c.points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-xs text-text-primary leading-relaxed">
                <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-success/15 text-success flex items-center justify-center">
                  <Check size={10} strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Connect */}
        <div className="rounded-2xl border border-border/30 bg-bg-secondary/35 p-5 w-full">
          <h2 className="text-sm font-bold text-text-primary">Connect to a server</h2>
          <p className="text-[11px] text-text-secondary mt-0.5">{c.needs}</p>

          {servers.length === 0 ? (
            <div className="mt-5 flex flex-col items-center text-center py-6">
              <div className="p-3 rounded-xl bg-bg-tertiary/50 text-text-secondary mb-3"><Server size={20} /></div>
              <p className="text-xs text-text-secondary">You have no saved servers yet.</p>
              <button
                type="button"
                onClick={onManageServers}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover cursor-pointer"
              >
                <Plus size={14} /> Add a server
              </button>
            </div>
          ) : (
            <>
              <ul className="mt-4 space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {servers.map((s) => {
                  const local = s.connectionType === 'local';
                  const busy = connectingTo === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onSelectServer(s)}
                        disabled={connectingTo !== null}
                        className="w-full flex items-center gap-3 rounded-xl border border-border/30 hover:border-accent/50 hover:bg-bg-tertiary/40 px-3 py-2.5 text-left transition-all disabled:opacity-60 cursor-pointer"
                      >
                        <span className="p-1.5 rounded-lg bg-bg-primary/50 border border-border/30 text-text-secondary shrink-0">
                          {local ? <MonitorCog size={14} /> : <Server size={14} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-text-primary truncate">{s.name}</span>
                          <span className="block text-[11px] text-text-muted font-mono truncate">
                            {local ? 'This computer' : `${s.username}@${s.host}`}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-accent shrink-0">
                          {busy ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
                          {busy ? 'Connecting…' : local ? 'Open' : 'Connect'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={onManageServers}
                className="mt-4 text-[11px] font-semibold text-text-secondary hover:text-accent cursor-pointer"
              >
                Add or edit servers →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
