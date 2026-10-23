import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Pause, Play, Trash2, Download, ScrollText, Crosshair, X, ChevronRight, ChevronDown, RefreshCw, Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { EmptyState } from './ui/EmptyState';
import { levelOf, isContinuation, segments, type Entry, type Level } from '../utils/logParse';
import { escapeShellSingleQuotes as esc } from '../utils/shellQuote';
import type { ServerConnection, ProxySettings } from '../types';

type Kind = 'docker' | 'systemd' | 'file';
interface Source { key: string; kind: Kind; name: string }

const MAX_ENTRIES = 20000;
const SHOW = 1500; // ponytail: no virtualised list, only the last 1500 matches are drawn
const LEVELS: { id: Level; label: string; on: string }[] = [
  { id: 'error', label: 'Errors', on: 'bg-error/20 text-error' },
  { id: 'warn', label: 'Warnings', on: 'bg-warning/20 text-warning' },
  { id: 'info', label: 'Info', on: 'bg-accent/20 text-accent' },
  { id: 'debug', label: 'Debug', on: 'bg-bg-tertiary text-text-secondary' },
];
const ROW: Record<Level, string> = {
  error: 'border-error bg-error/10 text-text-primary',
  warn: 'border-warning bg-warning/5 text-text-primary',
  info: 'border-transparent text-text-primary',
  debug: 'border-transparent text-text-muted',
};

const COMMANDS: Record<Kind, (n: string) => string> = {
  docker: (n) => `__DOCKER__ logs -f --tail 200 --timestamps '${esc(n)}' 2>&1`,
  systemd: (n) => `journalctl -u '${esc(n)}' -f -n 200 -o short-iso --no-pager 2>&1`,
  file: (n) => `tail -n 200 -F '${esc(n)}' 2>&1`,
};
const KIND_LABEL: Record<Kind, string> = { docker: 'Containers', systemd: 'Services', file: 'Log files' };
const color = (src: string) => {
  let h = 0;
  for (const c of src) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 62%)`;
};
const srcKey = (kind: Kind, name: string) => `${kind}:${name}`;

export function LogsView({ currentServer, proxy }: { currentServer?: ServerConnection | null; proxy?: ProxySettings }) {
  const [available, setAvailable] = useState<Source[]>([]);
  const [live, setLive] = useState<Record<string, string>>({}); // source key -> streamId
  const [loadingSources, setLoadingSources] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const [search, setSearch] = useState('');
  const [regex, setRegex] = useState(false);
  const [exclude, setExclude] = useState('');
  const [levels, setLevels] = useState<Record<Level, boolean>>({ error: true, warn: true, info: true, debug: true });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [trace, setTrace] = useState('');
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [customPath, setCustomPath] = useState('');

  // incoming lines pile up in refs and reach React ~7 times a second, so a chatty container can't freeze the UI
  const buf = useRef<Entry[]>([]);
  const partial = useRef<Record<string, string>>({});
  const idSeq = useRef(0);
  const streams = useRef<Record<string, string>>({}); // streamId -> source key
  const pausedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  pausedRef.current = paused;

  const addLines = useCallback((src: string, data: string) => {
    const text = (partial.current[src] || '') + data;
    const lines = text.split(/\r?\n/);
    partial.current[src] = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
      if (!line.trim()) continue;
      const last = buf.current[buf.current.length - 1];
      if (last && last.src === src && isContinuation(line)) {
        last.extra.push(line);
        continue;
      }
      buf.current.push({ id: idSeq.current++, src, text: line, extra: [], level: levelOf(line) });
    }
    if (buf.current.length > MAX_ENTRIES) buf.current = buf.current.slice(-MAX_ENTRIES);
  }, []);

  useEffect(() => {
    const onData = (e: Event) => {
      const { streamId, data } = (e as CustomEvent).detail || {};
      const src = streams.current[streamId];
      if (src) addLines(src, String(data));
    };
    const onEnd = (e: Event) => {
      const { streamId } = (e as CustomEvent).detail || {};
      const src = streams.current[streamId];
      if (!src) return;
      delete streams.current[streamId];
      setLive((l) => { const n = { ...l }; delete n[src]; return n; });
    };
    window.addEventListener('compose-logs-data', onData);
    window.addEventListener('compose-logs-stream-ended', onEnd);
    const t = setInterval(() => { if (!pausedRef.current) setEntries([...buf.current]); }, 150);
    return () => {
      window.removeEventListener('compose-logs-data', onData);
      window.removeEventListener('compose-logs-stream-ended', onEnd);
      clearInterval(t);
    };
  }, [addLines]);

  const stopAll = useCallback(() => {
    Object.keys(streams.current).forEach((id) => window.serverOperator.stopComposeLogsStream({ streamId: id }));
    streams.current = {};
    setLive({});
  }, []);

  // new server: drop everything
  useEffect(() => {
    stopAll();
    buf.current = [];
    setEntries([]);
    setAvailable([]);
    setError('');
    setTrace('');
    return stopAll;
  }, [currentServer?.id, stopAll]);

  const discover = async () => {
    if (!currentServer) return;
    setLoadingSources(true);
    setError('');
    const run = (command: string) => window.serverOperator.runCommand({ connection: currentServer, command, proxy: proxy?.enabled ? proxy : undefined }).catch(() => null);
    const lines = (r: Awaited<ReturnType<typeof run>>) => (r?.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
    try {
      const [docker, sd, files] = await Promise.all([
        window.serverOperator.getDockerPs({ connection: currentServer, proxy: proxy?.enabled ? proxy : undefined }).catch(() => null),
        run("systemctl list-units --type=service --state=running --no-legend --plain 2>/dev/null | awk '{print $1}'"),
        run('ls /var/log/nginx/*.log /var/log/syslog /var/log/auth.log /var/log/messages 2>/dev/null; ls /var/log/*.log 2>/dev/null | head -20'),
      ]);
      const containers = ((docker?.containers || []) as { Names?: string; State?: string }[]).filter((c) => c.Names && (!c.State || c.State === 'running'));
      const list: Source[] = [
        ...containers.map((c) => ({ key: srcKey('docker', c.Names!), kind: 'docker' as Kind, name: c.Names! })),
        ...lines(sd).map((n) => ({ key: srcKey('systemd', n), kind: 'systemd' as Kind, name: n })),
        ...[...new Set(lines(files))].map((n) => ({ key: srcKey('file', n), kind: 'file' as Kind, name: n })),
      ];
      setAvailable((prev) => [...list, ...prev.filter((p) => !list.some((l) => l.key === p.key))]);
      if (!list.length) setError('Nothing found. Add a log file path below, or check that Docker/systemd are available on this server.');
    } finally {
      setLoadingSources(false);
    }
  };
  useEffect(() => { if (currentServer) discover(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentServer?.id]);

  const toggleSource = async (s: Source) => {
    if (!currentServer) return;
    if (live[s.key]) {
      window.serverOperator.stopComposeLogsStream({ streamId: live[s.key] });
      delete streams.current[live[s.key]];
      setLive((l) => { const n = { ...l }; delete n[s.key]; return n; });
      return;
    }
    const streamId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    streams.current[streamId] = s.name;
    setLive((l) => ({ ...l, [s.key]: streamId }));
    const r = await window.serverOperator.startLogStream({ streamId, connection: currentServer, command: COMMANDS[s.kind](s.name), proxy: proxy?.enabled ? proxy : undefined });
    if (!r.ok) {
      delete streams.current[streamId];
      setLive((l) => { const n = { ...l }; delete n[s.key]; return n; });
      setError(`${s.name}: ${r.error || 'could not start'}`);
    }
  };

  const addCustom = () => {
    const p = customPath.trim();
    if (!p) return;
    const s: Source = { key: srcKey('file', p), kind: 'file', name: p };
    setAvailable((a) => (a.some((x) => x.key === s.key) ? a : [...a, s]));
    setCustomPath('');
    toggleSource(s);
  };

  /* ---------- filtering ---------- */
  const searchRe = useMemo(() => {
    if (!search) return null;
    try { return new RegExp(regex ? search : search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); } catch { return null; }
  }, [search, regex]);
  const excludeRe = useMemo(() => {
    if (!exclude.trim()) return null;
    try { return new RegExp(exclude, 'i'); } catch { return null; }
  }, [exclude]);
  const badRegex = (regex && search && !searchRe) || (exclude.trim() && !excludeRe);

  const shownAll = useMemo(() => entries.filter((e) => {
    if (!levels[e.level] || hidden.has(e.src)) return false;
    const full = e.extra.length ? `${e.text}\n${e.extra.join('\n')}` : e.text;
    if (trace && !full.includes(trace)) return false;
    if (excludeRe && excludeRe.test(e.text)) return false;
    if (searchRe) { searchRe.lastIndex = 0; if (!searchRe.test(full)) return false; }
    return true;
  }), [entries, levels, hidden, trace, excludeRe, searchRe]);
  const shown = shownAll.slice(-SHOW);

  const counts = useMemo(() => {
    const c = { error: 0, warn: 0 };
    entries.forEach((e) => { if (e.level === 'error') c.error++; else if (e.level === 'warn') c.warn++; });
    return c;
  }, [entries]);

  useEffect(() => {
    if (follow && !paused && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [shown, follow, paused]);

  const exportLog = () => {
    const text = shownAll.map((e) => `[${e.src}] ${[e.text, ...e.extra].join('\n')}`).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const clear = () => { buf.current = []; setEntries([]); setOpenIds(new Set()); };
  const toggleOpen = (id: number) => setOpenIds((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (!currentServer) {
    return <div className="flex-1 flex bg-bg-primary"><EmptyState icon={ScrollText} title="Connect to a server" message="Pick a server to tail its container, service and file logs in one place." /></div>;
  }

  const srcNames = [...new Set(entries.map((e) => e.src))];
  const grouped = (['docker', 'systemd', 'file'] as Kind[]).map((k) => ({ k, items: available.filter((s) => s.kind === k) })).filter((g) => g.items.length);

  return (
    <div className="flex-1 flex min-h-0 bg-bg-primary">
      {/* Sources */}
      <div className="w-64 shrink-0 border-r border-border/30 flex flex-col min-h-0">
        <div className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-text-primary">Log sources</span>
          <Button size="sm" variant="ghost" onClick={discover} loading={loadingSources} title="Look again"><RefreshCw size={12} /></Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {grouped.map((g) => (
            <div key={g.k} className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted px-2 pb-1">{KIND_LABEL[g.k]}</p>
              {g.items.map((s) => (
                <label key={s.key} className="flex items-center gap-2 rounded-lg px-2 py-1 cursor-pointer hover:bg-bg-tertiary/50" title={s.name}>
                  <input type="checkbox" checked={!!live[s.key]} onChange={() => toggleSource(s)} className="accent-[var(--color-accent)]" />
                  <span className="size-2 rounded-full shrink-0" style={{ background: color(s.name) }} />
                  <span className="text-xs text-text-primary truncate">{s.kind === 'file' ? s.name.replace(/^\/var\/log\//, '') : s.name}</span>
                </label>
              ))}
            </div>
          ))}
          {!grouped.length && !loadingSources && <p className="text-[11px] text-text-muted px-2 py-2">No sources yet.</p>}
          {error && <p className="text-[11px] text-warning px-2 py-2 break-words">{error}</p>}
        </div>
        <div className="p-3 border-t border-border/30 flex gap-2">
          <Input size="sm" placeholder="/path/to/app.log" value={customPath} onChange={(e) => setCustomPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} className="font-mono" />
          <Button size="sm" variant="soft" onClick={addCustom} disabled={!customPath.trim()} title="Tail this file"><Plus size={12} /></Button>
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        <div className="p-3 space-y-2 border-b border-border/30">
          <div className="flex items-center gap-2 flex-wrap">
            <Input size="sm" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
            <button type="button" onClick={() => setRegex((r) => !r)} title="Treat the search as a regular expression" className={`text-[11px] font-mono px-2 py-1 rounded-lg ${regex ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-primary'}`}>.*</button>
            <Input size="sm" placeholder="Hide lines matching (regex)" value={exclude} onChange={(e) => setExclude(e.target.value)} className="w-52" />
            {badRegex && <span className="text-[11px] text-error">Invalid regex</span>}
            <div className="flex gap-1 ml-1">
              {LEVELS.map((l) => (
                <button key={l.id} type="button" onClick={() => setLevels((v) => ({ ...v, [l.id]: !v[l.id] }))} className={`text-[11px] px-2 py-1 rounded-lg font-medium ${levels[l.id] ? l.on : 'text-text-muted line-through'}`}>
                  {l.label}{l.id === 'error' && counts.error > 0 ? ` ${counts.error}` : l.id === 'warn' && counts.warn > 0 ? ` ${counts.warn}` : ''}
                </button>
              ))}
            </div>
            <span className="ml-auto flex gap-1">
              <Button size="sm" variant={paused ? 'primary' : 'soft'} onClick={() => setPaused((p) => !p)}>{paused ? <><Play size={12} /> Resume</> : <><Pause size={12} /> Pause</>}</Button>
              <Button size="sm" variant="ghost" onClick={exportLog} disabled={!shownAll.length} title="Save the lines you see (after filters) to a file"><Download size={12} /></Button>
              <Button size="sm" variant="ghost" onClick={clear} title="Clear the screen"><Trash2 size={12} /></Button>
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap min-h-[22px]">
            {trace && (
              <span className="inline-flex items-center gap-1.5 text-[11px] bg-accent/15 text-accent rounded-lg px-2 py-1">
                <Crosshair size={11} /> Tracing <span className="font-mono">{trace.length > 28 ? `${trace.slice(0, 28)}…` : trace}</span> across all sources
                <button type="button" onClick={() => setTrace('')}><X size={11} /></button>
              </span>
            )}
            {srcNames.map((n) => (
              <button
                key={n}
                type="button"
                title="Show or hide this source"
                onClick={() => setHidden((h) => { const x = new Set(h); if (x.has(n)) x.delete(n); else x.add(n); return x; })}
                className={`inline-flex items-center gap-1.5 text-[11px] rounded-lg px-2 py-0.5 border border-border/30 ${hidden.has(n) ? 'opacity-40 line-through' : ''}`}
              >
                <span className="size-2 rounded-full" style={{ background: color(n) }} />{n.replace(/^\/var\/log\//, '')}
              </button>
            ))}
            {!trace && entries.length > 0 && <span className="text-[11px] text-text-muted ml-auto">Tip: click a highlighted ID or IP to follow it across every source.</span>}
          </div>
        </div>

        <div
          ref={listRef}
          onScroll={(e) => { const el = e.currentTarget; setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }}
          className="flex-1 overflow-auto font-mono text-[11.5px] leading-[1.45] py-1"
        >
          {entries.length === 0 && (
            <EmptyState icon={ScrollText} title="Pick something to watch" message="Tick a container, service or log file on the left. Lines stream in here, colour-coded, and you can search and filter them live." />
          )}
          {entries.length > 0 && shown.length === 0 && <p className="p-4 text-xs text-text-muted font-sans">Nothing matches the filters.</p>}
          {shownAll.length > SHOW && <p className="px-3 py-1 text-[11px] text-text-muted font-sans">Showing the latest {SHOW} of {shownAll.length} matching lines. Narrow the filters or export to see all.</p>}
          {shown.map((e) => {
            const open = openIds.has(e.id);
            return (
              <div key={e.id} className={`flex gap-2 px-3 border-l-2 hover:bg-bg-tertiary/40 ${ROW[e.level]}`}>
                <span className="w-24 shrink-0 truncate select-none" style={{ color: color(e.src) }} title={e.src}>{e.src.replace(/^\/var\/log\//, '')}</span>
                <div className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                  {e.extra.length > 0 && (
                    <button type="button" onClick={() => toggleOpen(e.id)} className="inline-flex items-center text-text-muted hover:text-text-primary mr-1 align-middle" title={open ? 'Hide the stack trace' : `Show ${e.extra.length} more lines`}>
                      {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                  )}
                  <Line text={e.text} re={searchRe} onFollow={setTrace} />
                  {e.extra.length > 0 && !open && <span className="text-text-muted"> (+{e.extra.length} lines)</span>}
                  {open && e.extra.map((x, i) => <div key={i} className="text-text-secondary"><Line text={x} re={searchRe} onFollow={setTrace} /></div>)}
                </div>
              </div>
            );
          })}
        </div>
        {!follow && entries.length > 0 && (
          <button type="button" onClick={() => { setFollow(true); if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }} className="absolute bottom-4 right-6 text-[11px] bg-accent text-white rounded-full px-3 py-1 shadow">
            Jump to latest
          </button>
        )}
      </div>
    </div>
  );
}

function Line({ text, re, onFollow }: { text: string; re: RegExp | null; onFollow: (v: string) => void }) {
  return (
    <>
      {segments(text, re).map((s, i) => (
        <span key={i} className={s.cls} onClick={s.follow ? () => onFollow(s.follow!) : undefined} style={s.follow ? { cursor: 'pointer' } : undefined} title={s.follow ? 'Click to trace this across all sources' : undefined}>
          {s.text}
        </span>
      ))}
    </>
  );
}
