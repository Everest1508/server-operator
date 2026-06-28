import { useState } from 'react';
import { Server, Shield, Plus, Trash2, Edit2, LogIn, Key, Lock, AlertCircle, Check, MonitorCog, FolderOpen } from 'lucide-react';
import EyeIcon from './icons/EyeIcon';
import EyeOffIcon from './icons/EyeOffIcon';
import type { ServerConnection, ProxySettings, ConnectionType } from '../types';
import { Tooltip } from './Tooltip';

const inputClass =
  'px-3 py-2 rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted focus:border-accent focus:ring-1 focus:ring-accent outline-none text-xs w-full min-w-0 transition-all duration-150 font-sans';

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
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [cfAuthType, setCfAuthType] = useState<'key' | 'password'>('key');
  const [form, setForm] = useState({
    name: '',
    host: '',
    username: '',
    privateKeyPath: '',
    password: '',
    projectPath: '',
    useProxy: false,
  });

  const getInputClass = (val: string) => {
    const isError = showValidationErrors && !val.trim();
    return `${inputClass} ${
      isError
        ? 'border-error/45 bg-error/5 focus:border-error/65 focus:ring-error/25 text-error placeholder-error/40 shadow-sm shadow-error/5'
        : ''
    }`;
  };

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const isNameEmpty = !form.name.trim();
    const isHostEmpty = connectionType !== 'local' && !form.host.trim();
    const isUserEmpty = connectionType !== 'local' && !form.username.trim();
    const isKeyEmpty = (connectionType === 'ec2' || (connectionType === 'cloudflare' && cfAuthType === 'key')) && !form.privateKeyPath.trim();
    const isPassEmpty = (connectionType === 'password' || (connectionType === 'cloudflare' && cfAuthType === 'password')) && !form.password;
    const isLocalPathEmpty = connectionType === 'local' && !form.projectPath.trim();

    if (isNameEmpty || isHostEmpty || isUserEmpty || isKeyEmpty || isPassEmpty || isLocalPathEmpty) {
      setShowValidationErrors(true);
      return;
    }
    onAddServer({
      id: crypto.randomUUID(),
      name: form.name.trim(),
      host: connectionType === 'local' ? 'localhost' : form.host.trim(),
      username: connectionType === 'local' ? 'local' : form.username.trim(),
      connectionType,
      ...(connectionType === 'ec2'
        ? { privateKeyPath: form.privateKeyPath.trim() }
        : connectionType === 'password'
          ? { password: form.password }
          : connectionType === 'cloudflare'
            ? (cfAuthType === 'key'
              ? { privateKeyPath: form.privateKeyPath.trim() }
              : { password: form.password })
            : {}),
      projectPath: form.projectPath.trim() || undefined,
      cwd: form.projectPath.trim() || undefined,
      useProxy: form.useProxy,
    });
    setForm({ name: '', host: '', username: '', privateKeyPath: '', password: '', projectPath: '', useProxy: false });
  };

  return (
    <div className="flex-1 flex flex-col bg-bg-primary min-h-0 select-none">
      <div className="flex bg-bg-secondary/35 border-b border-border/20 px-3 py-1.5 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('servers')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer ${
            activeTab === 'servers'
              ? 'bg-bg-primary border-border/40 text-accent font-semibold shadow-sm'
              : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
          }`}
        >
          <Server size={13} />
          Servers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('proxy')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer ${
            activeTab === 'proxy'
              ? 'bg-bg-primary border-border/40 text-accent font-semibold shadow-sm'
              : 'bg-transparent border-transparent text-text-secondary hover:bg-bg-tertiary/20 hover:text-text-primary'
          }`}
        >
          <Shield size={13} />
          SOCKS Proxy
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 max-w-7xl w-full mx-auto">
        {activeTab === 'servers' && (
          <div className="space-y-6">
            {/* Add new server */}
            <div className="rounded-xl border border-border/20 bg-bg-secondary/35 p-5 shadow-sm backdrop-blur-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-primary mb-3">Register connection</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setConnectionType('ec2')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                    connectionType === 'ec2'
                      ? 'bg-bg-tertiary border-border/40 text-accent font-bold shadow-sm'
                      : 'text-text-secondary hover:bg-bg-tertiary/30 hover:text-text-primary border-transparent'
                  }`}
                >
                  <Key size={13} />
                  SSH Key (EC2)
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionType('password')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                    connectionType === 'password'
                      ? 'bg-bg-tertiary border-border/40 text-accent font-bold shadow-sm'
                      : 'text-text-secondary hover:bg-bg-tertiary/30 hover:text-text-primary border-transparent'
                  }`}
                >
                  <Lock size={13} />
                  SSH Password
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionType('cloudflare')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                    connectionType === 'cloudflare'
                      ? 'bg-bg-tertiary border-border/40 text-warning font-bold shadow-sm'
                      : 'text-text-secondary hover:bg-bg-tertiary/30 hover:text-text-primary border-transparent'
                  }`}
                >
                  <Shield size={13} />
                  Cloudflare Tunnel
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionType('local')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                    connectionType === 'local'
                      ? 'bg-bg-tertiary border-border/40 text-success font-bold shadow-sm'
                      : 'text-text-secondary hover:bg-bg-tertiary/30 hover:text-text-primary border-transparent'
                  }`}
                >
                  <MonitorCog size={13} />
                  Local Workspace
                </button>
              </div>
              <form onSubmit={submitAdd} noValidate className="space-y-3 select-text">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_2fr_1.5fr_2fr_2fr_auto_auto] gap-3 items-end">
                  <div>
                    <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5">Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Production App"
                      className={getInputClass(form.name)}
                    />
                  </div>
                  <div className={connectionType === 'local' ? 'hidden' : ''}>
                    <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5">Hostname / IP</label>
                    <input
                      type="text"
                      value={form.host}
                      onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                      placeholder="ec2-xxx.compute.amazonaws.com"
                      className={getInputClass(form.host)}
                    />
                  </div>
                  <div className={connectionType === 'local' ? 'hidden' : ''}>
                    <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5">Username</label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                      placeholder="ubuntu, root..."
                      className={getInputClass(form.username)}
                    />
                  </div>
                  {connectionType === 'ec2' ? (
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5">SSH key path</label>
                      <input
                        type="text"
                        value={form.privateKeyPath}
                        onChange={(e) => setForm((f) => ({ ...f, privateKeyPath: e.target.value }))}
                        placeholder="~/.ssh/id_rsa"
                        className={getInputClass(form.privateKeyPath)}
                      />
                    </div>
                  ) : connectionType === 'password' ? (
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5">Password</label>
                      <div className="relative flex items-center">
                        <input
                          type={showFormPassword ? 'text' : 'password'}
                          value={form.password}
                          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                          placeholder="••••••••"
                          className={`${getInputClass(form.password)} pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowFormPassword(!showFormPassword)}
                          className="absolute right-3 text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
                        >
                          {showFormPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                        </button>
                      </div>
                    </div>
                  ) : connectionType === 'cloudflare' ? (
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted">
                          {cfAuthType === 'key' ? 'SSH key path' : 'SSH Password'}
                        </label>
                        <button
                          type="button"
                          onClick={() => setCfAuthType(cfAuthType === 'key' ? 'password' : 'key')}
                          className="text-[9px] font-bold text-accent hover:underline cursor-pointer select-none"
                        >
                          Use {cfAuthType === 'key' ? 'Password' : 'Key'}
                        </button>
                      </div>
                      {cfAuthType === 'key' ? (
                        <input
                          type="text"
                          value={form.privateKeyPath}
                          onChange={(e) => setForm((f) => ({ ...f, privateKeyPath: e.target.value }))}
                          placeholder="~/.ssh/id_rsa"
                          className={getInputClass(form.privateKeyPath)}
                        />
                      ) : (
                        <div className="relative flex items-center">
                          <input
                            type={showFormPassword ? 'text' : 'password'}
                            value={form.password}
                            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                            placeholder="••••••••"
                            className={`${getInputClass(form.password)} pr-10`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowFormPassword(!showFormPassword)}
                            className="absolute right-3 text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
                          >
                            {showFormPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : <div className="hidden lg:block" />}
                  <div>
                    <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5">
                      {connectionType === 'local' ? 'Local folder' : 'Project path (optional)'}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={form.projectPath}
                        onChange={(e) => setForm((f) => ({ ...f, projectPath: e.target.value }))}
                        placeholder={connectionType === 'local' ? '/home/user/my-app' : '/var/www/app'}
                        className={connectionType === 'local' ? getInputClass(form.projectPath) : inputClass}
                      />
                      {connectionType === 'local' && (
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await window.serverOperator?.pickLocalFolder?.();
                            if (res?.ok && !res.canceled && res.folderPath) {
                              setForm((f) => ({ ...f, projectPath: res.folderPath || '', host: 'localhost', username: 'local' }));
                            }
                          }}
                          className="px-3 py-2 rounded-xl bg-bg-tertiary/60 hover:bg-bg-tertiary border border-border/30 text-text-primary text-xs font-semibold transition-all duration-150 cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5"><FolderOpen size={13} />Browse</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center justify-center min-h-[36px] ${connectionType === 'local' ? 'opacity-40 pointer-events-none' : ''}`} title="Tunnel via Tor SOCKS proxy">
                    <Tooltip content="Route via Proxy" position="top">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, useProxy: !form.useProxy }))}
                        className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all duration-150 cursor-pointer ${
                          form.useProxy
                            ? 'bg-accent border-accent text-white shadow-sm shadow-accent/20'
                            : 'bg-bg-primary/50 border-border/30 hover:border-accent/40 text-transparent'
                        }`}
                        title="Route via Proxy"
                      >
                        {form.useProxy && <Check size={10} strokeWidth={3} className="shrink-0" />}
                      </button>
                    </Tooltip>
                  </div>
                  <button
                    type="submit"
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors shadow-sm shrink-0 cursor-pointer"
                  >
                    <Plus size={14} />
                    Add Server
                  </button>
                </div>
                {showValidationErrors && (
                  <div className="text-[10px] text-error/90 font-medium flex items-center gap-1.5 mt-2.5 bg-error/5 border border-error/20 px-3 py-2 rounded-xl">
                    <AlertCircle size={13} className="shrink-0 text-error animate-pulse" />
                    <span>Please fill in the required fields marked in red.</span>
                  </div>
                )}
              </form>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border/20 bg-bg-secondary/35 overflow-hidden shadow-sm backdrop-blur-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted px-4 py-3 bg-bg-secondary/25 border-b border-border/20">
                Registered profiles
              </h3>
              <div className="overflow-x-auto select-text">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border/20 text-text-secondary select-none">
                      <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">Hostname</th>
                      <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">Authentication</th>
                      <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">Default Path</th>
                      <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">SOCKS</th>
                      <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider w-28 text-right pr-6">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.length === 0 && (
                      <tr className="select-none">
                        <td colSpan={8} className="px-4 py-8 text-center text-text-secondary italic">
                          No servers configured. Fill out the registration form above to get started.
                        </td>
                      </tr>
                    )}
                    {servers.map((s) => {
                      const type = s.connectionType ?? (s.privateKeyPath ? 'ec2' : 'password');
                      const isLocal = type === 'local';
                      return (
                        <tr
                          key={s.id}
                          className="border-b border-border/10 hover:bg-bg-tertiary/15 transition-colors duration-150"
                        >
                          {editingId === s.id ? (
                            <>
                              <td className="px-4 py-2">
                                <span className="text-[10px] font-bold text-text-secondary">{type === 'ec2' ? 'EC2' : type === 'cloudflare' ? 'CF' : type === 'local' ? 'LOCAL' : 'PWD'}</span>
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
                                  disabled={isLocal}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  type="text"
                                  value={s.username}
                                  onChange={(e) => onUpdateServer(s.id, { username: e.target.value })}
                                  className={inputClass}
                                  disabled={isLocal}
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
                                ) : type === 'local' ? (
                                  <span className="text-xs italic text-text-muted">local folder mode</span>
                                ) : type === 'cloudflare' ? (
                                  <div className="flex flex-col gap-1.5 w-full">
                                    <div className="flex justify-between items-center text-[9px] font-bold text-text-muted select-none">
                                      <span>{s.privateKeyPath !== undefined ? 'Key path' : 'Password'}</span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (s.privateKeyPath !== undefined) {
                                            onUpdateServer(s.id, { privateKeyPath: undefined, password: '' });
                                          } else {
                                            onUpdateServer(s.id, { password: undefined, privateKeyPath: '' });
                                          }
                                        }}
                                        className="text-accent hover:underline cursor-pointer"
                                      >
                                        Use {s.privateKeyPath !== undefined ? 'Password' : 'Key'}
                                      </button>
                                    </div>
                                    {s.privateKeyPath !== undefined ? (
                                      <input
                                        type="text"
                                        value={s.privateKeyPath}
                                        onChange={(e) => onUpdateServer(s.id, { privateKeyPath: e.target.value })}
                                        placeholder="~/.ssh/id_rsa"
                                        className={inputClass}
                                      />
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
                                          className="absolute right-3 text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
                                        >
                                          {showEditPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                                        </button>
                                      </div>
                                    )}
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
                                      className="absolute right-3 text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
                                    >
                                      {showEditPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
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
                                <div className="flex items-center justify-center w-full">
                                  <button
                                    type="button"
                                    onClick={() => onUpdateServer(s.id, { useProxy: !s.useProxy })}
                                    className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all duration-150 cursor-pointer ${
                                      s.useProxy
                                        ? 'bg-accent border-accent text-white shadow-sm shadow-accent/20'
                                        : 'bg-bg-primary/50 border-border/30 hover:border-accent/40 text-transparent'
                                    }`}
                                    title="Route proxy"
                                  >
                                    {s.useProxy && <Check size={10} strokeWidth={3} className="shrink-0" />}
                                  </button>
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right pr-6">
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="text-xs text-accent hover:underline font-semibold cursor-pointer"
                                >
                                  Done
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 select-none">
                                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-lg border uppercase tracking-wider ${
                                  type === 'ec2'
                                    ? 'bg-success/10 text-success border-success/20'
                                    : type === 'cloudflare'
                                    ? 'bg-warning/10 text-warning border-warning/20'
                                    : type === 'local'
                                    ? 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                                    : 'bg-accent/10 text-accent border-accent/20'
                                }`}>
                                  {type === 'ec2' ? 'SSH Key' : type === 'cloudflare' ? 'Tunnel' : type === 'local' ? 'Local' : 'Password'}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-text-primary">{s.name}</td>
                              <td className="px-4 py-3 text-text-secondary font-mono truncate max-w-[150px]" title={s.host}>{s.host}</td>
                              <td className="px-4 py-3 text-text-secondary">{s.username}</td>
                              <td className="px-4 py-3 text-text-secondary font-mono">
                                {type === 'ec2' ? (
                                  <div className="truncate max-w-[120px]" title={s.privateKeyPath ?? ''}>
                                    {s.privateKeyPath ?? '—'}
                                  </div>
                                ) : type === 'cloudflare' ? (
                                  s.privateKeyPath !== undefined ? (
                                    <div className="truncate max-w-[120px] text-text-secondary" title={`Tunnel via Key: ${s.privateKeyPath}`}>
                                      CF Key: {s.privateKeyPath || '—'}
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-between gap-2 max-w-[120px] group/pwd">
                                      <span className="truncate" title={revealedPasswords[s.id] ? s.password : 'Password hidden'}>
                                        CF: {revealedPasswords[s.id] ? s.password : '••••••••'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setRevealedPasswords((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                                        className="shrink-0 p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors opacity-0 group-hover/pwd:opacity-100 focus:opacity-100 focus:outline-none cursor-pointer"
                                        title={revealedPasswords[s.id] ? 'Hide password' : 'Show password'}
                                      >
                                        {revealedPasswords[s.id] ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
                                      </button>
                                    </div>
                                  )
                                ) : type === 'local' ? (
                                  <span className="italic text-xs text-text-muted select-none">local shell + docker</span>
                                ) : (
                                  <div className="flex items-center justify-between gap-2 max-w-[120px] group/pwd">
                                    <span className="truncate" title={revealedPasswords[s.id] ? s.password : 'Password hidden'}>
                                      {revealedPasswords[s.id] ? s.password : '••••••••'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setRevealedPasswords((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                                      className="shrink-0 p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-tertiary/60 transition-colors opacity-0 group-hover/pwd:opacity-100 focus:opacity-100 focus:outline-none cursor-pointer"
                                      title={revealedPasswords[s.id] ? 'Hide password' : 'Show password'}
                                    >
                                      {revealedPasswords[s.id] ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-text-secondary font-mono truncate max-w-[120px]" title={s.projectPath || '-'}>
                                {s.projectPath || '—'}
                              </td>
                              <td className="px-4 py-3 select-none">
                                {!proxy.enabled ? (
                                  <span className="text-[10px] text-text-muted font-bold uppercase" title="Global proxy is disabled">Disabled</span>
                                ) : s.useProxy !== false ? (
                                  <span className="text-[10px] text-success font-bold uppercase" title="Using global proxy">Enabled</span>
                                ) : (
                                  <span className="text-[10px] text-text-secondary font-bold uppercase" title="Opted out of proxy">Bypassed</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right pr-6 select-none">
                                <div className="flex items-center justify-end gap-1">
                                  <Tooltip content={connectingTo === s.id ? 'Connecting…' : (isLocal ? 'Open local workspace' : 'Connect via SSH')} position="top">
                                    <button
                                      type="button"
                                      onClick={() => onSelectServer(s)}
                                      disabled={connectingTo !== null}
                                      className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary/60 hover:text-success transition-colors disabled:opacity-60 cursor-pointer"
                                    >
                                      <LogIn size={13} />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="Edit profile" position="top">
                                    <button
                                      type="button"
                                      onClick={() => { setShowEditPassword(false); setEditingId(s.id); }}
                                      className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary/60 hover:text-accent transition-colors cursor-pointer"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                  </Tooltip>
                                  <Tooltip content="Remove profile" position="top">
                                    <button
                                      type="button"
                                      onClick={() => onRemoveServer(s.id)}
                                      className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-tertiary/60 hover:text-error transition-colors cursor-pointer"
                                    >
                                      <Trash2 size={13} />
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
            <div className="mt-6 p-6 rounded-xl border border-dashed border-border/25 bg-bg-secondary/30 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-sm select-none">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">Offline Feature Documentation</h4>
                <p className="text-xs text-text-secondary mt-1 max-w-2xl leading-relaxed">
                  Understand how our secure SQL client tunnels, Git-based non-interactive deployment hooks, SQLite transaction rollback logs, and silent GitHub semver auto-updates are engineered under the hood. Browse docs anytime without setting up remote SSH connections.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onViewGuide?.('database')}
                className="px-3.5 py-1.5 rounded-xl bg-bg-tertiary/50 hover:bg-bg-tertiary border border-border/30 text-text-primary text-xs font-semibold shrink-0 transition-colors cursor-pointer"
              >
                Read Feature Guides
              </button>
            </div>
          </div>
        )}

        {activeTab === 'proxy' && (
          <div className="max-w-xl rounded-xl border border-border/20 bg-bg-secondary/35 p-6 shadow-sm backdrop-blur-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-primary mb-1">Global Tor SOCKS proxy</h3>
            <p className="text-xs text-text-secondary mb-4 leading-relaxed font-sans">
              When checked, SSH connections hook through a secure SOCKS5 network layer (e.g., standard local Tor package running at 127.0.0.1:9050). Equivalent to tunneling terminal operations via <code className="text-xs text-text-secondary bg-bg-tertiary px-1 py-0.5 rounded font-mono">torsocks ssh user@host</code>.
            </p>
            <div className="space-y-4 select-text">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <button
                  type="button"
                  onClick={() => onProxyChange({ ...proxy, enabled: !proxy.enabled })}
                  className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all duration-150 cursor-pointer ${
                    proxy.enabled
                      ? 'bg-accent border-accent text-white shadow-sm shadow-accent/20'
                      : 'bg-bg-primary/50 border-border/30 hover:border-accent/40 text-transparent'
                  }`}
                >
                  {proxy.enabled && <Check size={10} strokeWidth={3} className="shrink-0" />}
                </button>
                <span className="text-xs font-semibold text-text-primary">Enable proxy route</span>
              </label>
              <div>
                <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5 select-none">Proxy host</label>
                <input
                  type="text"
                  value={proxy.host}
                  onChange={(e) => onProxyChange({ ...proxy, host: e.target.value })}
                  placeholder="127.0.0.1"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-1.5 select-none">Proxy port</label>
                <input
                  type="number"
                  value={proxy.port}
                  onChange={(e) => onProxyChange({ ...proxy, port: Number(e.target.value) || 9050 })}
                  placeholder="9050"
                  className={inputClass}
                />
              </div>
              <p className="text-xs text-text-muted italic leading-relaxed select-none">
                Default Tor daemon port is 9050. Check individual server profiles to override global proxy settings.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
