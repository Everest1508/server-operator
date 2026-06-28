import { useState, useCallback } from 'react';
import { ShieldCheck, ShieldOff, RefreshCw, Plus, Trash2, AlertTriangle, Lock, Unlock, Globe, Layers, ScanSearch } from 'lucide-react';
import type { ServerConnection, ProxySettings } from '../types';
import { Select } from './Select';

interface FirewallViewProps {
  currentServer: ServerConnection;
  proxy?: ProxySettings;
}

interface OpenPort {
  proto: string;
  localAddress: string;
  port: string;
  process: string;
  state: string;
}

interface UfwRule {
  to: string;
  action: string;
  from: string;
}

interface SecurityGroup {
  name: string;
  rules: { port: string; proto: string; from: string; action?: string }[];
}

const PRESET_GROUPS: SecurityGroup[] = [
  { name: 'Web Server', rules: [{ port: '80', proto: 'tcp', from: 'any' }, { port: '443', proto: 'tcp', from: 'any' }] },
  { name: 'SSH Only', rules: [{ port: '22', proto: 'tcp', from: 'any' }] },
  { name: 'Database (Local)', rules: [{ port: '3306', proto: 'tcp', from: '127.0.0.1' }, { port: '5432', proto: 'tcp', from: '127.0.0.1' }] },
  { name: 'Mail Server', rules: [{ port: '25', proto: 'tcp', from: 'any' }, { port: '587', proto: 'tcp', from: 'any' }, { port: '993', proto: 'tcp', from: 'any' }] },
];

export function FirewallView({ currentServer, proxy }: FirewallViewProps) {
  const [openPorts, setOpenPorts] = useState<OpenPort[]>([]);
  const [portsLoading, setPortsLoading] = useState(false);
  const [portsError, setPortsError] = useState<string | null>(null);

  const [ufwStatus, setUfwStatus] = useState<string | null>(null);
  const [ufwRules, setUfwRules] = useState<UfwRule[]>([]);
  const [ufwLoading, setUfwLoading] = useState(false);
  const [ufwError, setUfwError] = useState<string | null>(null);
  const [ufwEnabled, setUfwEnabled] = useState<boolean | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Add rule form
  const [rulePort, setRulePort] = useState('');
  const [ruleProto, setRuleProto] = useState<'tcp' | 'udp' | 'any'>('tcp');
  const [ruleAction, setRuleAction] = useState<'allow' | 'deny'>('allow');
  const [ruleFrom, setRuleFrom] = useState('any');

  // Security group tab
  const [tab, setTab] = useState<'ports' | 'firewall' | 'groups' | 'scanner'>('ports');

  // Network scanner
  const [scanCidr, setScanCidr] = useState('');
  const [scanPort, setScanPort] = useState('22');
  const [scanResults, setScanResults] = useState<{ ip: string; open: boolean }[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanTool, setScanTool] = useState<'nmap' | 'bash'>('nmap');

  // Active tunnels from scanner
  const [activeTunnels, setActiveTunnels] = useState<Record<string, { localPort: number; tunnelId: string }>>({});
  const [tunnelLoading, setTunnelLoading] = useState<string | null>(null);

  const run = useCallback(async (command: string) => {
    if (!window.serverOperator) throw new Error('Not available');
    const res = await window.serverOperator.runCommand({
      connection: currentServer,
      command,
      proxy: proxy?.enabled ? proxy : undefined,
    });
    if (res.code !== 0 && !res.stdout) throw new Error(res.stderr || `Exit ${res.code}`);
    return res.stdout || res.stderr || '';
  }, [currentServer, proxy]);

  const loadOpenPorts = useCallback(async () => {
    setPortsLoading(true);
    setPortsError(null);
    try {
      // Try ss first, fall back to netstat
      let out = '';
      try {
        out = await run("ss -tlnup 2>/dev/null || netstat -tlnup 2>/dev/null");
      } catch {
        out = await run("cat /proc/net/tcp /proc/net/tcp6 2>/dev/null | head -100");
      }
      const ports = parseListenPorts(out);
      setOpenPorts(ports);
    } catch (e: any) {
      setPortsError(e.message);
    } finally {
      setPortsLoading(false);
    }
  }, [run]);

  const loadUfw = useCallback(async () => {
    setUfwLoading(true);
    setUfwError(null);
    try {
      const out = await run('sudo ufw status verbose 2>&1');
      setUfwStatus(out);
      setUfwEnabled(out.toLowerCase().includes('status: active'));
      setUfwRules(parseUfwRules(out));
    } catch (e: any) {
      setUfwError(e.message);
    } finally {
      setUfwLoading(false);
    }
  }, [run]);

  const ufwAction = async (cmd: string, key: string) => {
    setActionLoading(key);
    setActionMsg(null);
    try {
      const out = await run(cmd);
      setActionMsg({ type: 'ok', text: out.trim().split('\n').pop() || 'Done' });
      await loadUfw();
    } catch (e: any) {
      setActionMsg({ type: 'err', text: e.message });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddRule = () => {
    const portPart = ruleProto === 'any' ? rulePort : `${rulePort}/${ruleProto}`;
    const fromPart = ruleFrom && ruleFrom !== 'any' ? ` from ${ruleFrom}` : '';
    ufwAction(`sudo ufw ${ruleAction}${fromPart} to any port ${portPart} 2>&1`, 'add');
  };

  const handleDeleteRule = (rule: UfwRule, idx: number) => {
    ufwAction(`echo y | sudo ufw delete ${idx + 1} 2>&1`, `del-${idx}`);
  };

  const handleToggleUfw = () => {
    const cmd = ufwEnabled ? 'echo y | sudo ufw disable 2>&1' : 'echo y | sudo ufw enable 2>&1';
    ufwAction(cmd, 'toggle');
  };

  const applySecurityGroup = (group: SecurityGroup) => {
    const cmds = group.rules.map(r => {
      const fromPart = r.from !== 'any' ? ` from ${r.from}` : '';
      return `sudo ufw allow${fromPart} to any port ${r.port}/${r.proto}`;
    }).join(' && ');
    ufwAction(`${cmds} 2>&1`, `group-${group.name}`);
  };

  const handleScan = async () => {
    if (!scanCidr.trim() || !scanPort.trim()) return;
    setScanLoading(true);
    setScanError(null);
    setScanResults([]);
    try {
      if (scanTool === 'nmap') {
        const out = await run(`nmap -p ${scanPort} --open -T4 ${scanCidr} 2>&1`);
        const hosts: { ip: string; open: boolean }[] = [];
        let lastIp = '';
        for (const line of out.split('\n')) {
          const ipMatch = line.match(/report for (?:\S+ \()?([\d.]+)\)?/);
          if (ipMatch) { lastIp = ipMatch[1]; continue; }
          if (lastIp && /open/.test(line)) { hosts.push({ ip: lastIp, open: true }); lastIp = ''; }
        }
        setScanResults(hosts);
      } else {
        // bash /dev/tcp fallback — derive base from CIDR, scan .1–.254
        const base = scanCidr.replace(/\.(\d+)(\/\d+)?$/, '');
        const out = await run(
          `for i in $(seq 1 254); do (timeout 0.5 bash -c "echo >/dev/tcp/${base}.$i/${scanPort}" 2>/dev/null && echo "OPEN ${base}.$i") & done; wait`
        );
        setScanResults(out.split('\n').filter(l => l.startsWith('OPEN ')).map(l => ({ ip: l.slice(5).trim(), open: true })));
      }
    } catch (e: any) {
      setScanError(e.message);
    } finally {
      setScanLoading(false);
    }
  };

  const autoDetectCidr = async () => {
    try {
      const out = await run("ip -o -f inet addr show | awk '/scope global/ {print $4}' | head -1");
      const cidr = out.trim();
      if (cidr) setScanCidr(cidr);
    } catch { /* ignore */ }
  };

  const tunnelKey = (ip: string) => `${ip}:${scanPort}`;

  const handleTunnelToggle = async (ip: string) => {
    const key = tunnelKey(ip);
    const existing = activeTunnels[key];
    if (existing) {
      // Close tunnel
      setTunnelLoading(key);
      try {
        await window.serverOperator?.closeTunnel({ tunnelId: existing.tunnelId });
        setActiveTunnels(prev => { const n = { ...prev }; delete n[key]; return n; });
      } finally { setTunnelLoading(null); }
    } else {
      // Open tunnel
      setTunnelLoading(key);
      try {
        const res = await window.serverOperator?.openTunnel({
          connection: currentServer,
          proxy: proxy?.enabled ? proxy : undefined,
          remoteHost: ip,
          remotePort: Number(scanPort),
        });
        if (res?.ok && res.localPort && res.tunnelId) {
          setActiveTunnels(prev => ({ ...prev, [key]: { localPort: res.localPort!, tunnelId: res.tunnelId! } }));
        } else {
          setScanError(res?.error || 'Tunnel failed');
        }
      } finally { setTunnelLoading(null); }
    }
  };

  const connectHint = (localPort: number) => {
    const p = Number(scanPort);
    if (p === 3389) return `mstsc /v:127.0.0.1:${localPort}  (or Remmina / MS Remote Desktop)`;
    if (p === 5900 || p === 5901) return `vncviewer 127.0.0.1:${localPort}`;
    if (p === 22) return `ssh -p ${localPort} user@127.0.0.1`;
    return `Connect to 127.0.0.1:${localPort}`;
  };

  return (
    <div className="flex-grow flex flex-col bg-bg-primary text-text-primary min-h-0 font-sans">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/20 bg-bg-secondary/35 px-6 py-4 shrink-0 select-none">
        <div className="p-2.5 rounded-xl bg-bg-tertiary text-accent border border-border/15">
          <ShieldCheck size={18} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-text-primary">Firewall & Port Manager</h2>
          <p className="text-[11px] text-text-secondary mt-0.5">{currentServer.name} — {currentServer.username}@{currentServer.host}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border/20 shrink-0 select-none bg-bg-secondary/20">
        {([['ports', 'Open Ports'], ['firewall', 'UFW Rules'], ['groups', 'Security Groups'], ['scanner', 'Network Scanner']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTab(id); if (id === 'ports' && openPorts.length === 0) loadOpenPorts(); if (id === 'firewall' && ufwStatus === null) loadUfw(); }}
            className={`px-5 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === id ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6 min-h-0">

        {/* ── Open Ports ── */}
        {tab === 'ports' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between select-none">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Listening Ports</h3>
              <button type="button" onClick={loadOpenPorts} disabled={portsLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border/30 rounded-xl hover:bg-bg-tertiary disabled:opacity-50 cursor-pointer">
                <RefreshCw size={12} className={portsLoading ? 'animate-spin text-accent' : ''} /> Refresh
              </button>
            </div>

            {portsError && <ErrorBox text={portsError} />}

            {openPorts.length === 0 && !portsLoading && !portsError && (
              <EmptyState icon={<Globe size={20} />} text='Click "Refresh" to scan listening ports on this server.' />
            )}

            {portsLoading && <LoadingRow />}

            {openPorts.length > 0 && (
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-border/20 bg-bg-secondary/35 text-text-secondary text-[10px] uppercase tracking-wider select-none">
                    {['Port', 'Protocol', 'Local Address', 'State', 'Process'].map(h => (
                      <th key={h} className="px-3 py-2 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {openPorts.map((p, i) => (
                    <tr key={i} className="hover:bg-bg-tertiary/20">
                      <td className="px-3 py-1.5 font-bold text-accent">{p.port}</td>
                      <td className="px-3 py-1.5 text-text-secondary">{p.proto}</td>
                      <td className="px-3 py-1.5 text-text-muted">{p.localAddress}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${p.state === 'LISTEN' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                          {p.state}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-text-muted truncate max-w-[180px]">{p.process || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── UFW Rules ── */}
        {tab === 'firewall' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between select-none">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">UFW Firewall</h3>
                {ufwEnabled !== null && (
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${ufwEnabled ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20'}`}>
                    {ufwEnabled ? 'Active' : 'Inactive'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {ufwEnabled !== null && (
                  <button type="button" onClick={handleToggleUfw} disabled={actionLoading === 'toggle'} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border cursor-pointer disabled:opacity-50 transition-colors ${ufwEnabled ? 'border-error/30 text-error hover:bg-error/10' : 'border-success/30 text-success hover:bg-success/10'}`}>
                    {actionLoading === 'toggle' ? <RefreshCw size={11} className="animate-spin" /> : ufwEnabled ? <ShieldOff size={11} /> : <ShieldCheck size={11} />}
                    {ufwEnabled ? 'Disable UFW' : 'Enable UFW'}
                  </button>
                )}
                <button type="button" onClick={loadUfw} disabled={ufwLoading} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border/30 rounded-xl hover:bg-bg-tertiary disabled:opacity-50 cursor-pointer">
                  <RefreshCw size={12} className={ufwLoading ? 'animate-spin text-accent' : ''} /> Refresh
                </button>
              </div>
            </div>

            {ufwError && <ErrorBox text={ufwError} />}
            {actionMsg && <ActionMsg msg={actionMsg} />}
            {ufwLoading && <LoadingRow />}

            {/* Add rule form */}
            {ufwStatus !== null && (
              <div className="border border-border/20 rounded-xl p-4 bg-bg-secondary/20 flex flex-col gap-3">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-muted select-none">Add Rule</h4>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-extrabold uppercase text-text-muted">Action</label>
                    <Select
                      value={ruleAction}
                      onChange={val => setRuleAction(val as any)}
                      size="sm"
                      containerClassName="w-24"
                      options={[
                        { value: 'allow', label: 'Allow' },
                        { value: 'deny', label: 'Deny' },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-extrabold uppercase text-text-muted">Port</label>
                    <input type="text" value={rulePort} onChange={e => setRulePort(e.target.value)} placeholder="80 or 8000:9000" className="w-32 px-2.5 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-extrabold uppercase text-text-muted">Proto</label>
                    <Select
                      value={ruleProto}
                      onChange={val => setRuleProto(val as any)}
                      size="sm"
                      containerClassName="w-20"
                      options={[
                        { value: 'tcp', label: 'TCP' },
                        { value: 'udp', label: 'UDP' },
                        { value: 'any', label: 'Any' },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-extrabold uppercase text-text-muted">From (IP or "any")</label>
                    <input type="text" value={ruleFrom} onChange={e => setRuleFrom(e.target.value)} placeholder="any" className="w-36 px-2.5 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent" />
                  </div>
                  <button type="button" onClick={handleAddRule} disabled={!rulePort.trim() || actionLoading === 'add'} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-xl disabled:opacity-40 cursor-pointer shadow-sm">
                    {actionLoading === 'add' ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                    Add Rule
                  </button>
                </div>
              </div>
            )}

            {/* Rules table */}
            {ufwRules.length > 0 && (
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-border/20 bg-bg-secondary/35 text-text-secondary text-[10px] uppercase tracking-wider select-none">
                    <th className="px-3 py-2 font-bold">#</th>
                    <th className="px-3 py-2 font-bold">To</th>
                    <th className="px-3 py-2 font-bold">Action</th>
                    <th className="px-3 py-2 font-bold">From</th>
                    <th className="px-3 py-2 font-bold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {ufwRules.map((r, i) => (
                    <tr key={i} className="hover:bg-bg-tertiary/20">
                      <td className="px-3 py-1.5 text-text-muted">{i + 1}</td>
                      <td className="px-3 py-1.5 font-bold text-text-primary">{r.to}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${r.action.includes('ALLOW') ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                          {r.action}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-text-muted">{r.from}</td>
                      <td className="px-3 py-1.5">
                        <button type="button" onClick={() => handleDeleteRule(r, i)} disabled={actionLoading === `del-${i}`} className="p-1 rounded-lg text-error/60 hover:bg-error/10 hover:text-error disabled:opacity-40 cursor-pointer transition-colors">
                          {actionLoading === `del-${i}` ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {ufwStatus !== null && ufwRules.length === 0 && !ufwLoading && (
              <EmptyState icon={<Lock size={18} />} text="No UFW rules configured." />
            )}
          </div>
        )}

        {/* ── Security Groups ── */}
        {tab === 'groups' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between select-none">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Security Group Presets</h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">Apply a preset to batch-allow the standard ports for a given role. Each preset adds UFW allow rules. You can review and delete individual rules in the UFW Rules tab.</p>

            {actionMsg && <ActionMsg msg={actionMsg} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESET_GROUPS.map(group => (
                <div key={group.name} className="border border-border/20 rounded-xl p-4 bg-bg-secondary/20 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-accent" />
                      <span className="text-xs font-bold text-text-primary">{group.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => applySecurityGroup(group)}
                      disabled={actionLoading === `group-${group.name}`}
                      className="flex items-center gap-1.5 px-3 py-1 bg-accent/15 hover:bg-accent text-accent hover:text-white text-[10px] font-semibold rounded-lg border border-accent/30 hover:border-transparent disabled:opacity-50 cursor-pointer transition-all"
                    >
                      {actionLoading === `group-${group.name}` ? <RefreshCw size={10} className="animate-spin" /> : <Unlock size={10} />}
                      Apply
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.rules.map((r, i) => (
                      <span key={i} className="text-[10px] font-mono bg-bg-tertiary border border-border/20 px-2 py-0.5 rounded-lg text-text-secondary">
                        {r.action ?? 'allow'} :{r.port}/{r.proto} {r.from !== 'any' ? `from ${r.from}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Network Scanner ── */}
        {tab === 'scanner' && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between select-none">
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">Network Port Scanner</h3>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Scan all IPs in a subnet for a specific open port. Runs on the remote server using <strong className="text-text-secondary">nmap</strong> (preferred) or a pure bash fallback.
            </p>

            {/* Scan form */}
            <div className="border border-border/20 rounded-xl p-4 bg-bg-secondary/20 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-extrabold uppercase text-text-muted">CIDR / Range</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={scanCidr}
                      onChange={e => setScanCidr(e.target.value)}
                      placeholder="192.168.1.0/24"
                      className="w-40 px-2.5 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent font-mono"
                    />
                    <button type="button" onClick={autoDetectCidr} title="Auto-detect from server" className="px-2.5 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-secondary hover:text-accent hover:border-accent cursor-pointer transition-colors">
                      Auto
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-extrabold uppercase text-text-muted">Port</label>
                  <input
                    type="text"
                    value={scanPort}
                    onChange={e => setScanPort(e.target.value)}
                    placeholder="22"
                    className="w-20 px-2.5 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-extrabold uppercase text-text-muted">Tool</label>
                  <Select
                    value={scanTool}
                    onChange={val => setScanTool(val as any)}
                    size="sm"
                    containerClassName="w-36"
                    options={[
                      { value: 'nmap', label: 'nmap' },
                      { value: 'bash', label: 'bash (fallback)' },
                    ]}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleScan}
                  disabled={scanLoading || !scanCidr.trim() || !scanPort.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-xl disabled:opacity-40 cursor-pointer shadow-sm"
                >
                  {scanLoading ? <RefreshCw size={12} className="animate-spin" /> : <ScanSearch size={12} />}
                  {scanLoading ? 'Scanning…' : 'Scan'}
                </button>
              </div>
            </div>

            {scanError && <ErrorBox text={scanError} />}

            {scanLoading && (
              <div className="flex items-center gap-2 py-6 justify-center text-xs text-text-muted select-none">
                <RefreshCw size={14} className="animate-spin text-accent" />
                Scanning {scanCidr} for port {scanPort}… this may take a moment.
              </div>
            )}

            {!scanLoading && scanResults.length === 0 && !scanError && !scanLoading && (
              <EmptyState icon={<ScanSearch size={20} />} text="No results yet. Enter a CIDR range and port, then click Scan." />
            )}

            {scanResults.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 select-none">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Results</span>
                  <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-success/10 text-success border border-success/20">{scanResults.length} host{scanResults.length !== 1 ? 's' : ''} found</span>
                </div>
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-border/20 bg-bg-secondary/35 text-text-secondary text-[10px] uppercase tracking-wider select-none">
                      <th className="px-3 py-2 font-bold">IP Address</th>
                      <th className="px-3 py-2 font-bold">Port {scanPort}</th>
                      <th className="px-3 py-2 font-bold">Tunnel / Connect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/10">
                    {scanResults.map((r, i) => {
                      const key = tunnelKey(r.ip);
                      const tunnel = activeTunnels[key];
                      const loading = tunnelLoading === key;
                      return (
                        <tr key={i} className="hover:bg-bg-tertiary/20">
                          <td className="px-3 py-1.5 font-bold text-text-primary">{r.ip}</td>
                          <td className="px-3 py-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-success/10 text-success">open</span>
                          </td>
                          <td className="px-3 py-1.5">
                            {tunnel ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-lg">
                                    127.0.0.1:{tunnel.localPort}
                                  </span>
                                  <button type="button" onClick={() => handleTunnelToggle(r.ip)} disabled={loading} className="px-2 py-0.5 text-[9px] font-semibold rounded-lg bg-error/10 text-error border border-error/20 hover:bg-error/20 cursor-pointer disabled:opacity-50">
                                    Close
                                  </button>
                                </div>
                                <span className="text-[9px] text-text-muted select-text">{connectHint(tunnel.localPort)}</span>
                              </div>
                            ) : (
                              <button type="button" onClick={() => handleTunnelToggle(r.ip)} disabled={loading} className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 cursor-pointer disabled:opacity-50 transition-colors">
                                {loading ? <RefreshCw size={10} className="animate-spin" /> : <Globe size={10} />}
                                Forward Port
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseListenPorts(raw: string): OpenPort[] {
  const ports: OpenPort[] = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    // ss output: Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
    const ssMatch = line.match(/^(tcp|udp)\s+(\w+)\s+\d+\s+\d+\s+([\d.*:\[\]]+):(\d+)\s+/i);
    if (ssMatch) {
      ports.push({ proto: ssMatch[1].toLowerCase(), state: ssMatch[2], localAddress: ssMatch[3], port: ssMatch[4], process: line.split('users:')[1]?.replace(/[(),"]/g, '').trim() || '' });
      continue;
    }
    // netstat output: tcp 0 0 0.0.0.0:22 0.0.0.0:* LISTEN 1234/sshd
    const nsMatch = line.match(/^(tcp6?|udp6?)\s+\d+\s+\d+\s+([\d.*:\[\]]+):(\d+)\s+[\d.*:]+\s+(\w+)\s*([\d/\w-]*)/i);
    if (nsMatch) {
      ports.push({ proto: nsMatch[1].replace('6', '').toLowerCase(), state: nsMatch[4], localAddress: nsMatch[2], port: nsMatch[3], process: nsMatch[5] || '' });
    }
  }
  // Deduplicate by port+proto
  const seen = new Set<string>();
  return ports.filter(p => { const k = `${p.port}-${p.proto}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function parseUfwRules(raw: string): UfwRule[] {
  const rules: UfwRule[] = [];
  const lines = raw.split('\n');
  let inRules = false;
  for (const line of lines) {
    if (line.includes('--') && line.includes('Action')) { inRules = true; continue; }
    if (!inRules) continue;
    const m = line.match(/^(.+?)\s+(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT)?\s*(.*)/i);
    if (m) {
      rules.push({ to: m[1].trim(), action: (m[2] + (m[3] ? ' ' + m[3] : '')).trim(), from: m[4].trim() || 'Anywhere' });
    }
  }
  return rules;
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex gap-1.5 items-start font-mono">
      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

function ActionMsg({ msg }: { msg: { type: 'ok' | 'err'; text: string } }) {
  return (
    <div className={`p-2.5 rounded-xl text-xs font-mono ${msg.type === 'ok' ? 'bg-success/10 text-success border border-success/20' : 'bg-error/10 text-error border border-error/20'}`}>
      {msg.text}
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-muted select-none">
      {icon}
      <p className="text-xs">{text}</p>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-8 gap-2 text-text-muted text-xs select-none">
      <RefreshCw size={14} className="animate-spin text-accent" />
      Running…
    </div>
  );
}
