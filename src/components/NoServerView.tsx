import { useState } from 'react';
import { Server, Shield, Plus, Trash2, Edit2, LogIn, Key, Lock } from 'lucide-react';
import EyeIcon from './icons/EyeIcon';
import EyeOffIcon from './icons/EyeOffIcon';
import type { ServerConnection, ProxySettings, ConnectionType } from '../types';
import { Tooltip } from './Tooltip';

const inputClass =
  'px-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm w-full min-w-0';

type TabId = 'servers' | 'proxy';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [connectionType, setConnectionType] = useState<ConnectionType>('ec2');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [form, setForm] = useState({
    name: '',
    host: '',
    username: '',
    privateKeyPath: '',
    password: '',
    projectPath: '',
    useProxy: false,
  });

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) return;
    if (connectionType === 'ec2' && !form.privateKeyPath.trim()) return;
    if (connectionType === 'password' && !form.password) return;
    // cloudflare requires no extra credentials — hostname is sufficient
    onAddServer({
      id: crypto.randomUUID(),
      name: form.name.trim(),
      host: form.host.trim(),
      username: form.username.trim(),
      connectionType,
      ...(connectionType === 'ec2'
        ? { privateKeyPath: form.privateKeyPath.trim() }
        : { password: form.password }),
      projectPath: form.projectPath.trim() || undefined,
      cwd: form.projectPath.trim() || undefined,
      useProxy: form.useProxy,
    });
    setForm({ name: '', host: '', username: '', privateKeyPath: '', password: '', projectPath: '', useProxy: false });
  };

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)] min-h-0">
      <div className="flex border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('servers')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'servers'
              ? 'border-[var(--accent)] text-[var(--text-primary)] bg-[var(--bg-primary)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Server size={16} />
          Servers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('proxy')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'proxy'
              ? 'border-[var(--accent)] text-[var(--text-primary)] bg-[var(--bg-primary)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Shield size={16} />
          Tor SOCKS Proxy
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'servers' && (
          <div className="space-y-6">


            {/* Add new server */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Add new server</h3>
              <div className="flex flex-wrap gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setConnectionType('ec2')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    connectionType === 'ec2'
                      ? 'bg-[var(--bg-tertiary)] text-[var(--accent)] border border-[var(--accent)]/50'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  <Key size={16} />
                  EC2 (SSH key)
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionType('password')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    connectionType === 'password'
                      ? 'bg-[var(--bg-tertiary)] text-[var(--accent)] border border-[var(--accent)]/50'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  <Lock size={16} />
                  Password (username + password)
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionType('cloudflare')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    connectionType === 'cloudflare'
                      ? 'bg-[var(--bg-tertiary)] text-[var(--warning,#f59e0b)] border border-[var(--warning,#f59e0b)]/50'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] border border-transparent'
                  }`}
                >
                  <Shield size={16} />
                  Cloudflare Tunnel SSH
                </button>
              </div>
              <form onSubmit={submitAdd} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_2fr_2fr_auto_auto] gap-3 items-end">
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="My Server"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Host / IP</label>
                    <input
                      type="text"
                      value={form.host}
                      onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                      placeholder="192.168.1.10 or ec2-xx-xx.compute.amazonaws.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Username</label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                      placeholder="ec2-user, root, ubuntu..."
                      className={inputClass}
                    />
                  </div>
                  {connectionType === 'ec2' ? (
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">SSH key path</label>
                      <input
                        type="text"
                        value={form.privateKeyPath}
                        onChange={(e) => setForm((f) => ({ ...f, privateKeyPath: e.target.value }))}
                        placeholder="/home/user/.ssh/id_rsa"
                        className={inputClass}
                      />
                    </div>
                  ) : connectionType === 'password' ? (
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">Password</label>
                      <div className="relative flex items-center">
                        <input
                          type={showFormPassword ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                          placeholder="••••••••"
                          className={`${inputClass} pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowFormPassword(!showFormPassword)}
                          className="absolute right-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none"
                        >
                          {showFormPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* cloudflare: tunnel via cloudflared, SSH auth still needs a password */
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">SSH Password</label>
                      <div className="relative flex items-center">
                        <input
                          type={showFormPassword ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                          placeholder="••••••••"
                          className={`${inputClass} pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowFormPassword(!showFormPassword)}
                          className="absolute right-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none"
                        >
                          {showFormPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Project path (optional)</label>
                    <input
                      type="text"
                      value={form.projectPath}
                      onChange={(e) => setForm((f) => ({ ...f, projectPath: e.target.value }))}
                      placeholder="/var/www/app"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-center justify-center min-h-[34px]" title="Use proxy">
                    <input
                      type="checkbox"
                      checked={form.useProxy}
                      onChange={(e) => setForm((f) => ({ ...f, useProxy: e.target.checked }))}
                      className="rounded border-[var(--border)] bg-[var(--bg-primary)] text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4 cursor-pointer"
                      title="Use proxy"
                    />
                  </div>
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors shrink-0"
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </div>
              </form>
            </div>

            {/* Table */}
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] px-4 py-3 border-b border-[var(--border)]">
                Configured servers
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">Name</th>
                      <th className="px-4 py-2.5 font-medium">Host</th>
                      <th className="px-4 py-2.5 font-medium">Username</th>
                      <th className="px-4 py-2.5 font-medium">Auth</th>
                      <th className="px-4 py-2.5 font-medium">Project path</th>
                      <th className="px-4 py-2.5 font-medium">Proxy</th>
                      <th className="px-4 py-2.5 font-medium w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-[var(--text-secondary)]">
                          No servers yet. Add one above.
                        </td>
                      </tr>
                    )}
                    {servers.map((s) => {
                      const type = s.connectionType ?? (s.privateKeyPath ? 'ec2' : 'password');
                      return (
                        <tr
                          key={s.id}
                          className="border-b border-[var(--border)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                          {editingId === s.id ? (
                            <>
                              <td className="px-4 py-2">
                                <span className="text-xs text-[var(--text-secondary)]">{type === 'ec2' ? 'EC2' : type === 'cloudflare' ? 'CF Tunnel' : 'Password'}</span>
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  type="text"
                                  value={s.name}
                                  onChange={(e) => onUpdateServer(s.id, { name: e.target.value })}
                                  className={inputClass}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  type="text"
                                  value={s.host}
                                  onChange={(e) => onUpdateServer(s.id, { host: e.target.value })}
                                  className={inputClass}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  type="text"
                                  value={s.username}
                                  onChange={(e) => onUpdateServer(s.id, { username: e.target.value })}
                                  className={inputClass}
                                />
                              </td>
                              <td className="px-4 py-2">
                                {type === 'ec2' ? (
                                  <input
                                    type="text"
                                    value={s.privateKeyPath ?? ''}
                                    onChange={(e) => onUpdateServer(s.id, { privateKeyPath: e.target.value })}
                                    placeholder="Key path"
                                    className={inputClass}
                                  />
                                ) : type === 'password' ? (
                                  <div className="relative flex items-center">
                                    <input
                                      type={showEditPassword ? 'text' : 'password'}
                                      value={s.password ?? ''}
                                      onChange={(e) => onUpdateServer(s.id, { password: e.target.value })}
                                      placeholder="••••••••"
                                      className={`${inputClass} pr-10`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowEditPassword(!showEditPassword)}
                                      className="absolute right-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none"
                                    >
                                      {showEditPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="relative flex items-center">
                                    <input
                                      type={showEditPassword ? 'text' : 'password'}
                                      value={s.password ?? ''}
                                      onChange={(e) => onUpdateServer(s.id, { password: e.target.value })}
                                      placeholder="••••••••"
                                      className={`${inputClass} pr-10`}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setShowEditPassword(!showEditPassword)}
                                      className="absolute right-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus:outline-none"
                                    >
                                      {showEditPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  type="text"
                                  value={s.projectPath ?? ''}
                                  onChange={(e) =>
                                    onUpdateServer(s.id, {
                                      projectPath: e.target.value || undefined,
                                      cwd: e.target.value || undefined,
                                    })
                                  }
                                  placeholder="optional"
                                  className={inputClass}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <div className="flex items-center justify-center w-full" title="Use proxy">
                                  <input
                                    type="checkbox"
                                    checked={s.useProxy !== false}
                                    onChange={(e) => onUpdateServer(s.id, { useProxy: e.target.checked })}
                                    className="rounded border-[var(--border)] bg-[var(--bg-primary)] text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4 cursor-pointer"
                                    title="Use proxy"
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="text-xs text-[var(--accent)] hover:underline"
                                >
                                  Done
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-2.5">
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  type === 'ec2'
                                    ? 'bg-[var(--success)]/20 text-[var(--success)]'
                                    : type === 'cloudflare'
                                    ? 'bg-orange-500/20 text-orange-400'
                                    : 'bg-[var(--accent)]/20 text-[var(--accent)]'
                                }`}>
                                  {type === 'ec2' ? 'EC2' : type === 'cloudflare' ? 'CF Tunnel' : 'Password'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-[var(--text-primary)]">{s.name}</td>
                              <td className="px-4 py-2.5 text-[var(--text-secondary)] font-mono">{s.host}</td>
                              <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.username}</td>
                              <td className="px-4 py-2.5 text-[var(--text-secondary)] font-mono truncate max-w-[120px]" title={type === 'ec2' ? (s.privateKeyPath ?? '') : type === 'cloudflare' ? 'via cloudflared' : '••••••••'}>
                                {type === 'ec2' ? (s.privateKeyPath ?? '—') : type === 'cloudflare' ? <span className="italic text-xs">cloudflared</span> : '••••••••'}
                              </td>
                              <td className="px-4 py-2.5 text-[var(--text-secondary)] font-mono truncate max-w-[120px]" title={s.projectPath || '-'}>
                                {s.projectPath || '—'}
                              </td>
                              <td className="px-4 py-2.5">
                                {!proxy.enabled ? (
                                  <span className="text-xs text-[var(--text-muted)]" title="Global proxy is disabled">Off</span>
                                ) : s.useProxy !== false ? (
                                  <span className="text-xs text-[var(--success)]" title="Using global proxy">On</span>
                                ) : (
                                  <span className="text-xs text-[var(--text-secondary)]" title="Opted out of proxy">Off</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1">
                                  <Tooltip content={connectingTo === s.id ? 'Connecting…' : 'Connect via SSH'} position="top">
                                    <button
                                      type="button"
                                      onClick={() => onSelectServer(s)}
                                      disabled={connectingTo !== null}
                                      className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--success)] transition-colors disabled:opacity-60"
                                    >
                                      <LogIn size={14} />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="Edit server" position="top">
                                    <button
                                      type="button"
                                      onClick={() => { setShowEditPassword(false); setEditingId(s.id); }}
                                      className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-colors"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="Remove server" position="top">
                                    <button
                                      type="button"
                                      onClick={() => onRemoveServer(s.id)}
                                      className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--error)] transition-colors"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </Tooltip>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Offline Guide banner */}
            <div className="mt-6 p-5 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Offline Feature Guides</h4>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Learn how the Database Manager, Git Pipeline, SQLite Rollbacks, and Auto-Updates work under the hood. No server connection is required to browse our detailed documentation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onViewGuide?.('database')}
                className="px-4 py-2 rounded-md bg-[var(--bg-tertiary)] hover:bg-[var(--border)] text-[var(--text-primary)] text-xs font-semibold shrink-0 transition-colors cursor-pointer"
              >
                Read Feature Guides ↗
              </button>
            </div>
          </div>
        )}

        {activeTab === 'proxy' && (
          <div className="max-w-xl rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Tor SOCKS proxy (current system)</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              When enabled, SSH connections use this SOCKS5 proxy (e.g. Tor at 127.0.0.1:9050), like <code className="text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-1 rounded">torsocks ssh user@host</code>. Uncheck “Use proxy” on a server to connect directly.
            </p>
            <div className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={proxy.enabled}
                  onChange={(e) => onProxyChange({ ...proxy, enabled: e.target.checked })}
                  className="rounded border-[var(--border)] bg-[var(--bg-primary)] text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                <span className="text-sm text-[var(--text-primary)]">Enable Tor SOCKS proxy</span>
              </label>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Proxy host</label>
                <input
                  type="text"
                  value={proxy.host}
                  onChange={(e) => onProxyChange({ ...proxy, host: e.target.value })}
                  placeholder="127.0.0.1"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Proxy port</label>
                <input
                  type="number"
                  value={proxy.port}
                  onChange={(e) => onProxyChange({ ...proxy, port: Number(e.target.value) || 9050 })}
                  placeholder="9050"
                  className={inputClass}
                />
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Default Tor SOCKS port is 9050. Servers use this proxy by default when enabled; uncheck “Use proxy” on a server to bypass.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
