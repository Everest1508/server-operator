import { useId, useMemo, useState } from 'react';
import {
  Server, Shield, Plus, Trash2, Edit2, LogIn, Key, Lock, AlertCircle, Check, MonitorCog, FolderOpen, Search, X, Cloud, Loader2,
} from 'lucide-react';
import EyeIcon from './icons/EyeIcon';
import EyeOffIcon from './icons/EyeOffIcon';
import type { ServerConnection, ProxySettings, ConnectionType } from '../types';
import { Tooltip } from './Tooltip';
import { createPortal } from 'react-dom';

const inputClass =
  'px-3 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none text-xs w-full min-w-0 transition-all duration-150 font-sans';

type TabId = 'servers' | 'proxy';

const TYPE_META: Record<ConnectionType, { label: string; short: string; hint: string; Icon: typeof Key; tone: string }> = {
  ec2: { label: 'SSH Key', short: 'SSH Key', hint: 'Private key file (AWS EC2, VPS)', Icon: Key, tone: 'text-success bg-success/10 border-success/25' },
  password: { label: 'SSH Password', short: 'Password', hint: 'Username and password', Icon: Lock, tone: 'text-accent bg-accent/10 border-accent/25' },
  cloudflare: { label: 'Cloudflare Tunnel', short: 'Tunnel', hint: 'SSH through cloudflared', Icon: Cloud, tone: 'text-warning bg-warning/10 border-warning/25' },
  local: { label: 'Local Workspace', short: 'Local', hint: 'A folder on this computer', Icon: MonitorCog, tone: 'text-sky-300 bg-sky-500/10 border-sky-500/25' },
};

const typeOf = (s: ServerConnection): ConnectionType => s.connectionType ?? (s.privateKeyPath ? 'ec2' : 'password');

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div
      // Tie the label to the first input inside, however it is wrapped.
      ref={(el) => {
        const input = el?.querySelector('input');
        if (input && !input.id) input.id = id;
      }}
    >
      <label htmlFor={id} className="block text-xs font-semibold text-text-primary mb-1.5">{label}</label>
      {children}
      {error ? (
        <p className="text-[11px] text-error mt-1 flex items-center gap-1"><AlertCircle size={11} />{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-text-muted mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

interface Draft {
  name: string;
  host: string;
  username: string;
  type: ConnectionType;
  cfAuth: 'key' | 'password';
  privateKeyPath: string;
  password: string;
  projectPath: string;
  useProxy: boolean;
}

function ServerDrawer({
  server, onClose, onSubmit,
}: {
  server: ServerConnection | null;
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const editing = !!server;
  const [d, setD] = useState<Draft>(() =>
    server
      ? {
          name: server.name,
          host: server.host,
          username: server.username,
          type: typeOf(server),
          cfAuth: server.privateKeyPath !== undefined ? 'key' : server.password !== undefined || server.passwordEnc ? 'password' : 'key',
          privateKeyPath: server.privateKeyPath ?? '',
          password: '',
          projectPath: server.projectPath ?? '',
          useProxy: !!server.useProxy,
        }
      : { name: '', host: '', username: '', type: 'ec2', cfAuth: 'key', privateKeyPath: '', password: '', projectPath: '', useProxy: false },
  );
  const [showPwd, setShowPwd] = useState(false);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const usesKey = d.type === 'ec2' || (d.type === 'cloudflare' && d.cfAuth === 'key');
  const usesPwd = d.type === 'password' || (d.type === 'cloudflare' && d.cfAuth === 'password');
  const hadPassword = !!(server && (server.password || server.passwordEnc));
  const remote = d.type !== 'local';

  const errors = {
    name: !d.name.trim() ? 'Give this server a name' : '',
    host: remote && !d.host.trim() ? 'Enter a hostname or IP' : '',
    username: remote && !d.username.trim() ? 'Enter a username' : '',
    key: usesKey && !d.privateKeyPath.trim() ? 'Enter the path to your private key' : '',
    password: usesPwd && !d.password && !(editing && hadPassword) ? 'Enter a password' : '',
    folder: d.type === 'local' && !d.projectPath.trim() ? 'Choose a folder' : '',
  };
  const err = (k: keyof typeof errors) => (tried ? errors[k] : '');
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasErrors) return setTried(true);
    onSubmit(d);
  };

  const errBorder = (k: keyof typeof errors) => (err(k) ? 'border-error/60 bg-error/5' : '');

  return createPortal(
    <>
      <div className="fixed inset-0 top-10 z-40 bg-black/40" onClick={onClose} />
      <form
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-label={editing ? `Edit ${server!.name}` : 'Add a server'}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="fixed top-10 right-0 bottom-0 z-50 w-[460px] max-w-full flex flex-col popover-surface border-l border-border shadow-2xl select-text"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
          <div>
            <h3 className="text-sm font-bold text-text-primary">{editing ? `Edit ${server!.name}` : 'Add a server'}</h3>
            <p className="text-[11px] text-text-secondary mt-0.5">
              {editing ? 'Changes apply the next time you connect.' : 'Choose how you connect, then fill in the details.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <div>
            <p className="text-xs font-semibold text-text-primary mb-2">Connection type</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TYPE_META) as ConnectionType[]).map((t) => {
                const { label, hint, Icon } = TYPE_META[t];
                const active = d.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('type', t)}
                    className={`text-left rounded-xl border p-3 transition-all cursor-pointer ${
                      active ? 'border-accent bg-accent/10 ring-1 ring-accent/40' : 'border-border/30 hover:border-border/70 hover:bg-bg-tertiary/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                      <Icon size={14} className={active ? 'text-accent' : 'text-text-secondary'} />
                      {label}
                    </span>
                    <span className="block text-[10px] text-text-muted mt-1 leading-snug">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-text-primary">Details</p>
            <Field label="Name" error={err('name')} hint="Shown in the sidebar and tabs.">
              <input className={`${inputClass} ${errBorder('name')}`} value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Production App" autoFocus />
            </Field>

            {remote && (
              <div className="grid grid-cols-[1fr_140px] gap-3">
                <Field label="Hostname / IP" error={err('host')}>
                  <input className={`${inputClass} ${errBorder('host')}`} value={d.host} onChange={(e) => set('host', e.target.value)} placeholder="203.0.113.10" />
                </Field>
                <Field label="Username" error={err('username')}>
                  <input className={`${inputClass} ${errBorder('username')}`} value={d.username} onChange={(e) => set('username', e.target.value)} placeholder="ubuntu" />
                </Field>
              </div>
            )}

            {d.type === 'cloudflare' && (
              <div className="flex rounded-lg border border-border/40 overflow-hidden text-[11px] font-semibold">
                {(['key', 'password'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => set('cfAuth', a)}
                    className={`flex-1 py-1.5 ${d.cfAuth === a ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-bg-tertiary'}`}
                  >
                    {a === 'key' ? 'Sign in with key' : 'Sign in with password'}
                  </button>
                ))}
              </div>
            )}

            {usesKey && (
              <Field label="Private key path" error={err('key')} hint="Path on this computer, for example ~/.ssh/id_rsa.">
                <input className={`${inputClass} ${errBorder('key')}`} value={d.privateKeyPath} onChange={(e) => set('privateKeyPath', e.target.value)} placeholder="~/.ssh/id_rsa" />
              </Field>
            )}

            {usesPwd && (
              <Field label="Password" error={err('password')} hint={editing && hadPassword ? 'Leave blank to keep the saved password.' : undefined}>
                <div className="relative flex items-center">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className={`${inputClass} pr-10 ${errBorder('password')}`}
                    value={d.password}
                    onChange={(e) => set('password', e.target.value)}
                    placeholder={editing && hadPassword ? '••••••••  (saved)' : '••••••••'}
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 text-text-secondary hover:text-text-primary cursor-pointer">
                    {showPwd ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                  </button>
                </div>
              </Field>
            )}

            <Field
              label={d.type === 'local' ? 'Local folder' : 'Project folder (optional)'}
              error={err('folder')}
              hint={d.type === 'local' ? undefined : 'Where the file explorer and terminals start on the server.'}
            >
              <div className="flex gap-2">
                <input
                  className={`${inputClass} ${errBorder('folder')}`}
                  value={d.projectPath}
                  onChange={(e) => set('projectPath', e.target.value)}
                  placeholder={d.type === 'local' ? '/home/you/my-app' : '/var/www/app'}
                />
                {d.type === 'local' && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await window.serverOperator?.pickLocalFolder?.();
                      if (res?.ok && !res.canceled && res.folderPath) setD((x) => ({ ...x, projectPath: res.folderPath || '' }));
                    }}
                    className="flex items-center gap-1.5 px-3 rounded-xl bg-bg-tertiary/60 hover:bg-bg-tertiary border border-border/30 text-text-primary text-xs font-semibold cursor-pointer shrink-0"
                  >
                    <FolderOpen size={13} /> Browse
                  </button>
                )}
              </div>
            </Field>
          </div>

          {remote && (
            <button
              type="button"
              onClick={() => set('useProxy', !d.useProxy)}
              className="w-full flex items-center justify-between gap-3 rounded-xl border border-border/30 hover:border-border/60 px-3.5 py-3 text-left cursor-pointer"
            >
              <span>
                <span className="block text-xs font-semibold text-text-primary">Route through SOCKS proxy</span>
                <span className="block text-[11px] text-text-muted mt-0.5">Uses the proxy from the SOCKS Proxy tab.</span>
              </span>
              <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${d.useProxy ? 'bg-accent border-transparent' : 'bg-bg-tertiary border-border/30'}`}>
                <span className={`absolute top-[2px] left-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${d.useProxy ? 'translate-x-4' : ''}`} />
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border/40">
          {tried && hasErrors ? <span className="text-[11px] text-error">Fix the highlighted fields.</span> : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-border/40 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-tertiary cursor-pointer">
              Cancel
            </button>
            <button type="submit" className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover shadow-sm cursor-pointer">
              {editing ? <Check size={14} /> : <Plus size={14} />}
              {editing ? 'Save changes' : 'Add server'}
            </button>
          </div>
        </div>
      </form>
    </>
    , document.body);
}

interface NoServerViewProps {
  servers: ServerConnection[];
  proxy: ProxySettings;
  connectingTo: string | null;
  connectionError: string | null;
  onAddServer: (s: ServerConnection) => void;
  onUpdateServer: (id: string, patch: Partial<ServerConnection>) => void;
  onRemoveServer: (id: string) => void;
  onSelectServer: (s: ServerConnection) => void;
  onProxyChange: (p: ProxySettings) => void;
  onDismissError: () => void;
  onViewGuide?: (guideId: string) => void;
}

export function NoServerView({
  servers,
  proxy,
  connectingTo,
  connectionError,
  onAddServer,
  onUpdateServer,
  onRemoveServer,
  onSelectServer,
  onProxyChange,
  onDismissError,
  onViewGuide,
}: NoServerViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('servers');
  const [drawer, setDrawer] = useState<{ server: ServerConnection | null } | null>(null);
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter((s) => [s.name, s.host, s.username, s.projectPath ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [servers, query]);

  const handleSubmit = (d: Draft) => {
    const local = d.type === 'local';
    const key = d.type === 'ec2' || (d.type === 'cloudflare' && d.cfAuth === 'key');
    const pwd = d.type === 'password' || (d.type === 'cloudflare' && d.cfAuth === 'password');
    const base = {
      name: d.name.trim(),
      host: local ? 'localhost' : d.host.trim(),
      username: local ? 'local' : d.username.trim(),
      connectionType: d.type,
      projectPath: d.projectPath.trim() || undefined,
      cwd: d.projectPath.trim() || undefined,
      useProxy: local ? false : d.useProxy,
    };
    if (drawer?.server) {
      const patch: Partial<ServerConnection> = { ...base, privateKeyPath: key ? d.privateKeyPath.trim() : undefined };
      if (pwd) {
        if (d.password) patch.password = d.password;
      } else {
        patch.password = undefined;
        patch.passwordEnc = undefined;
      }
      onUpdateServer(drawer.server.id, patch);
    } else {
      onAddServer({
        id: crypto.randomUUID(),
        ...base,
        ...(key ? { privateKeyPath: d.privateKeyPath.trim() } : {}),
        ...(pwd ? { password: d.password } : {}),
      });
    }
    setDrawer(null);
  };

  const authSummary = (s: ServerConnection) => {
    const t = typeOf(s);
    if (t === 'local') return 'Local shell + Docker';
    if (t === 'ec2') return s.privateKeyPath || 'No key set';
    if (t === 'cloudflare') return s.privateKeyPath !== undefined ? `Key · ${s.privateKeyPath || 'not set'}` : 'Password';
    return 'Password';
  };

  const tabClass = (id: TabId) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer ${
      activeTab === id
        ? 'bg-bg-primary border-border/40 text-accent shadow-sm'
        : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
    }`;

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-h-0 select-none">
      <div className="flex bg-bg-secondary/35 border-b border-border/20 px-3 py-1.5 gap-1 shrink-0">
        <button type="button" onClick={() => setActiveTab('servers')} className={tabClass('servers')}>
          <Server size={13} /> Servers
        </button>
        <button type="button" onClick={() => setActiveTab('proxy')} className={tabClass('proxy')}>
          <Shield size={13} /> SOCKS Proxy
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 w-full">
        {activeTab === 'servers' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <h2 className="text-base font-bold text-text-primary">Your servers</h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  {servers.length === 0 ? 'Add a server to get started.' : `${servers.length} saved connection${servers.length === 1 ? '' : 's'}`}
                </p>
              </div>
              {servers.length > 4 && (
                <div className="relative w-60 max-w-full">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search servers…" aria-label="Search servers"
                    className={`${inputClass} pl-9 select-text`}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setDrawer({ server: null })}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover shadow-sm cursor-pointer"
              >
                <Plus size={14} /> Add server
              </button>
            </div>

            {servers.length === 0 ? (
              <div className="flex flex-col items-center text-center rounded-2xl border border-dashed border-border/40 bg-bg-secondary/20 py-16 px-6">
                <div className="p-3 rounded-2xl bg-accent/10 text-accent mb-4"><Server size={26} /></div>
                <h3 className="text-sm font-bold text-text-primary">No servers yet</h3>
                <p className="text-xs text-text-secondary mt-1 max-w-sm">
                  Connect with an SSH key, a password, a Cloudflare Tunnel, or open a folder on this computer.
                </p>
                <button
                  type="button"
                  onClick={() => setDrawer({ server: null })}
                  className="mt-5 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover cursor-pointer"
                >
                  <Plus size={14} /> Add your first server
                </button>
              </div>
            ) : visible.length === 0 ? (
              <p className="text-xs text-text-secondary text-center py-10">No servers match “{query}”.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {visible.map((s) => {
                  const t = typeOf(s);
                  const meta = TYPE_META[t];
                  const connecting = connectingTo === s.id;
                  const proxyLabel = t === 'local' ? null : !proxy.enabled ? 'Proxy off' : s.useProxy !== false ? 'Via proxy' : 'Proxy bypassed';
                  return (
                    <div
                      key={s.id}
                      className="group flex flex-col rounded-xl border border-border/30 bg-bg-secondary/35 hover:border-accent/40 hover:bg-bg-secondary/55 transition-colors p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl border shrink-0 ${meta.tone}`}><meta.Icon size={16} /></div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-text-primary truncate" title={s.name}>{s.name}</h3>
                          <p className="text-[11px] font-mono text-text-secondary truncate select-text" title={`${s.username}@${s.host}`}>
                            {t === 'local' ? 'This computer' : `${s.username}@${s.host}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <Tooltip content="Edit" position="top">
                            <button type="button" onClick={() => setDrawer({ server: s })} aria-label={`Edit ${s.name}`} className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary/60 hover:text-accent cursor-pointer">
                              <Edit2 size={13} />
                            </button>
                          </Tooltip>
                          {confirmDelete === s.id ? (
                            <button
                              type="button"
                              onClick={() => { onRemoveServer(s.id); setConfirmDelete(null); }}
                              onBlur={() => setConfirmDelete(null)}
                              autoFocus
                              className="px-2 py-1 rounded-lg bg-error/15 text-error text-[11px] font-semibold cursor-pointer"
                            >
                              Confirm remove
                            </button>
                          ) : (
                            <Tooltip content="Remove" position="top">
                              <button type="button" onClick={() => setConfirmDelete(s.id)} aria-label={`Remove ${s.name}`} className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary/60 hover:text-error cursor-pointer">
                                <Trash2 size={13} />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      </div>

                      <dl className="mt-3 space-y-1 text-[11px]">
                        <div className="flex gap-2"><dt className="w-12 text-text-muted shrink-0">Auth</dt><dd className="text-text-secondary truncate font-mono" title={authSummary(s)}>{authSummary(s)}</dd></div>
                        <div className="flex gap-2"><dt className="w-12 text-text-muted shrink-0">Folder</dt><dd className="text-text-secondary truncate font-mono" title={s.projectPath || ''}>{s.projectPath || '—'}</dd></div>
                      </dl>

                      <div className="mt-4 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${meta.tone}`}>{meta.short}</span>
                          {proxyLabel && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-border/30 text-text-muted">{proxyLabel}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelectServer(s)}
                          disabled={connectingTo !== null}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors disabled:opacity-60 cursor-pointer"
                        >
                          {connecting ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
                          {connecting ? 'Connecting…' : t === 'local' ? 'Open' : 'Connect'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Offline Guide banner */}
            <div className="p-5 rounded-2xl border border-dashed border-border/25 bg-bg-secondary/30 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">Feature guides</h4>
                <p className="text-xs text-text-secondary mt-1 max-w-2xl leading-relaxed">
                  How SQL tunnels, Git deploys, rollbacks and auto-updates work. They open offline, no connection needed.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onViewGuide?.('database')}
                className="px-3.5 py-1.5 rounded-xl bg-bg-tertiary/50 hover:bg-bg-tertiary border border-border/30 text-text-primary text-xs font-semibold shrink-0 transition-colors cursor-pointer"
              >
                Open guides
              </button>
            </div>
          </div>
        )}

        {activeTab === 'proxy' && (
          <div className="max-w-xl rounded-xl border border-border/30 bg-bg-secondary/35 p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-1">SOCKS proxy</h3>
            <p className="text-xs text-text-secondary mb-4 leading-relaxed font-sans">
              Send SSH connections through a SOCKS5 proxy, such as Tor running on 127.0.0.1:9050. This is the same as running <code className="text-xs text-text-secondary bg-bg-tertiary px-1 py-0.5 rounded font-mono">torsocks ssh user@host</code>. A server can opt out in its own settings.
            </p>
            <div className="space-y-4 select-text">
              <button
                type="button"
                role="switch"
                aria-checked={proxy.enabled}
                onClick={() => onProxyChange({ ...proxy, enabled: !proxy.enabled })}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-border/30 hover:border-border/60 px-3.5 py-3 text-left cursor-pointer"
              >
                <span className="text-xs font-semibold text-text-primary">Use proxy for SSH connections</span>
                <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${proxy.enabled ? 'bg-accent border-transparent' : 'bg-bg-tertiary border-border/30'}`}>
                  <span className={`absolute top-[2px] left-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${proxy.enabled ? 'translate-x-4' : ''}`} />
                </span>
              </button>
              <div>
                <label htmlFor="proxy-host" className="block text-xs font-semibold text-text-primary mb-1.5">Host</label>
                <input
                  id="proxy-host"
                  type="text"
                  value={proxy.host}
                  onChange={(e) => onProxyChange({ ...proxy, host: e.target.value })}
                  placeholder="127.0.0.1"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="proxy-port" className="block text-xs font-semibold text-text-primary mb-1.5">Port</label>
                <input
                  id="proxy-port"
                  type="number"
                  value={proxy.port}
                  onChange={(e) => onProxyChange({ ...proxy, port: Number(e.target.value) || 9050 })}
                  placeholder="9050"
                  className={inputClass}
                />
              </div>
              <p className="text-xs text-text-muted leading-relaxed">Tor listens on port 9050 by default.</p>
            </div>
          </div>
        )}
      </div>
      {drawer && <ServerDrawer server={drawer.server} onClose={() => setDrawer(null)} onSubmit={handleSubmit} />}
    </div>
  );
}
