import { useState, useEffect, useMemo, useRef } from 'react';
import { Send, Plus, Trash2, Save, Copy, Check, X, Globe, Radar, Upload, Download, FolderPlus, Play, Square, ChevronRight, ChevronDown, Folder, Braces, CheckCircle2, XCircle } from 'lucide-react';
import { Select } from './Select';
import { confirmDialog } from '../utils/confirm';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { EmptyState } from './ui/EmptyState';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { parseImport, flatten, isFolder, exportCollection, exportEnv, downloadJson, type Row, type BodyKind, type AuthKind, type ApiRequest, type Node, type Collection, type Env } from '../utils/postman';
import { executeRequest, toCurl, substitute, unresolved, type Exec, type Vars, type VarMap } from '../utils/apiRun';
import { looksLikeCurl, parseCurl } from '../utils/curl';
import { DISCOVER_COMMAND, parseDiscovery, type FoundApi } from '../utils/discoverApis';
import type { ServerConnection, ProxySettings } from '../types';


const STORE = 'serop-api-requests';
const COLS = 'serop-api-collections';
const ENVS = 'serop-api-envs';
const ACTIVE_ENV = 'serop-api-active-env';
const GLOBALS = 'serop-api-globals';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((m) => ({ value: m, label: m }));
const emptyRow = (): Row => ({ key: '', value: '', on: true });

const blank = (): ApiRequest => ({
  id: String(Date.now()),
  name: '',
  method: 'GET',
  url: '',
  params: [emptyRow()],
  headers: [emptyRow()],
  bodyKind: 'none',
  body: '',
  authKind: 'none',
  token: '',
  user: '',
  pass: '',
  allowInsecure: false,
  pre: '',
  test: '',
});

function load<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
const loadSaved = () => { const v = load<ApiRequest[]>(STORE, []); return Array.isArray(v) ? v : []; };
const store = (key: string, v: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage full or blocked: saving is a convenience */ }
};

const mapTree = (items: Node[], fn: (r: ApiRequest) => ApiRequest): Node[] =>
  items.map((n) => (isFolder(n) ? { ...n, items: mapTree(n.items, fn) } : fn(n)));

// write script-changed variables back into the active environment, keeping row order and disabled rows
function mergeRows(rows: Row[], m: VarMap): Row[] {
  const seen = new Set<string>();
  const kept = rows
    .filter((r) => r.key.trim() && (!r.on || r.key.trim() in m))
    .map((r) => { const k = r.key.trim(); if (!r.on) return r; seen.add(k); return { ...r, value: m[k] }; });
  const extra = Object.keys(m).filter((k) => !seen.has(k)).map((k) => ({ key: k, value: m[k], on: true }));
  return [...kept, ...extra, emptyRow()];
}
const toMap = (rows: Row[]): VarMap => Object.fromEntries(rows.filter((r) => r.on && r.key.trim()).map((r) => [r.key.trim(), r.value]));

interface RunItem { req: ApiRequest; exec?: Exec }

const STATUS_WORDS: Record<number, string> = {
  200: 'Success', 201: 'Created', 204: 'Success, nothing to show', 301: 'Moved', 302: 'Moved', 304: 'Not changed',
  400: 'Bad request, the server did not understand it', 401: 'Not logged in, check your token or password',
  403: 'Not allowed', 404: 'Not found, check the URL', 405: 'Wrong method for this URL', 422: 'Data was rejected',
  429: 'Too many requests, slow down', 500: 'Server error, the problem is on the server', 502: 'Bad gateway, the app behind the server is down',
  503: 'Server unavailable', 504: 'The server took too long to answer',
};

function statusColor(s: number) {
  if (s < 300) return 'text-success bg-success/15';
  if (s < 400) return 'text-warning bg-warning/15';
  return 'text-error bg-error/15';
}

function prettyBody(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function formatSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function RowEditor({ rows, onChange, keyHint, valueHint }: { rows: Row[]; onChange: (r: Row[]) => void; keyHint: string; valueHint: string }) {
  const set = (i: number, patch: Partial<Row>) => {
    const next = rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
    // always keep one empty row at the end so there is somewhere to type
    if (next[next.length - 1].key || next[next.length - 1].value) next.push(emptyRow());
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="checkbox" checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} className="accent-[var(--color-accent)]" title="Use this row" />
          <Input size="sm" placeholder={keyHint} value={r.key} onChange={(e) => set(i, { key: e.target.value })} className="font-mono" />
          <Input size="sm" placeholder={valueHint} value={r.value} onChange={(e) => set(i, { value: e.target.value })} className="font-mono" />
          <button
            type="button"
            title="Remove row"
            onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [emptyRow()])}
            className="text-text-muted hover:text-error p-1"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-border/30">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 text-xs font-medium -mb-px border-b-2 ${value === t.id ? 'border-accent text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}
        >
          {t.label}
          {!!t.count && <span className="ml-1.5 text-[10px] text-accent">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ApiView({ currentServer, proxy }: { currentServer?: ServerConnection | null; proxy?: ProxySettings }) {
  const [saved, setSaved] = useState<ApiRequest[]>(loadSaved);
  const [cols, setCols] = useState<Collection[]>(() => load(COLS, []));
  const [envs, setEnvs] = useState<Env[]>(() => load(ENVS, []));
  const [envId, setEnvId] = useState<string>(() => load(ACTIVE_ENV, ''));
  const [globals, setGlobals] = useState<VarMap>(() => load(GLOBALS, {}));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [req, setReq] = useState<ApiRequest>(blank);
  const [tab, setTab] = useState<'params' | 'headers' | 'body' | 'auth' | 'scripts'>('params');
  const [resTab, setResTab] = useState<'body' | 'headers' | 'tests' | 'console'>('body');
  const [loading, setLoading] = useState(false);
  const [exec, setExec] = useState<Exec | null>(null);
  const [copied, setCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);
  const [found, setFound] = useState<FoundApi[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState('');
  const [note, setNote] = useState('');
  const [varsOpen, setVarsOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [run, setRun] = useState<{ title: string; items: RunItem[]; running: boolean } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const stopRun = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const result = exec?.result ?? null;
  const env = envs.find((e) => e.id === envId);

  useEffect(() => { setFound(null); setFindError(''); }, [currentServer?.id]);
  useEffect(() => store(STORE, saved), [saved]);
  useEffect(() => store(COLS, cols), [cols]);
  useEffect(() => store(ENVS, envs), [envs]);
  useEffect(() => store(ACTIVE_ENV, envId), [envId]);
  useEffect(() => store(GLOBALS, globals), [globals]);

  const findApis = async () => {
    if (!currentServer) return;
    setFinding(true);
    setFindError('');
    try {
      const res = await window.serverOperator.runCommand({ connection: currentServer, command: DISCOVER_COMMAND, proxy: proxy?.enabled ? proxy : undefined });
      if (res.code !== 0 && !res.stdout) throw new Error(res.stderr || `Exit ${res.code}`);
      setFound(parseDiscovery(res.stdout || ''));
    } catch (e) {
      setFound(null);
      setFindError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinding(false);
    }
  };

  const useFound = (f: FoundApi) => {
    const host = currentServer?.connectionType === 'local' ? 'localhost' : currentServer?.host || 'localhost';
    const defaultPort = (f.scheme === 'http' && f.port === 80) || (f.scheme === 'https' && f.port === 443);
    setReq({ ...blank(), name: f.name, url: `${f.scheme}://${host}${defaultPort ? '' : `:${f.port}`}/` });
    setExec(null);
  };

  /* ---------- variables ---------- */
  const varsFor = (r: ApiRequest, envOverride = env): Vars => ({
    env: envOverride ? toMap(envOverride.vars) : {},
    col: r.colId ? cols.find((c) => c.id === r.colId)?.vars ?? {} : globals,
    glob: r.colId ? globals : {},
  });
  const vars = varsFor(req);

  // write what scripts changed back into the environment / collection / globals
  const applyVars = (colId: string | undefined, v: Vars) => {
    let col = v.col;
    if (env) setEnvs((all) => all.map((e) => (e.id === env.id ? { ...e, vars: mergeRows(e.vars, v.env) } : e)));
    else col = { ...col, ...v.env }; // no environment picked: pm.environment.set lands next to the collection variables
    if (colId && cols.some((c) => c.id === colId)) {
      setCols((all) => all.map((c) => (c.id === colId ? { ...c, vars: col } : c)));
      setGlobals(v.glob);
    } else setGlobals(col);
  };

  const missing = useMemo(() => {
    const text = [req.url, req.token, req.body, ...req.params.concat(req.headers).filter((r) => r.on).flatMap((r) => [r.key, r.value])].join(' ');
    return unresolved(text, vars);
  }, [req, vars]);

  /* ---------- import ---------- */
  const importTexts = (items: { name: string; text: string }[]) => {
    const msgs: string[] = [];
    for (const { name, text } of items) {
      try {
        const p = parseImport(text);
        if (p.kind === 'env') {
          setEnvs((all) => [...all, p.env]);
          setEnvId(p.env.id);
          msgs.push(`Environment "${p.env.name}" added and selected.`);
        } else {
          setCols((all) => [...all, p.col]);
          setOpen((o) => new Set(o).add(p.col.id));
          msgs.push(`Collection "${p.col.name}" added with ${p.count} requests.`);
        }
      } catch (e) {
        msgs.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setNote(msgs.join(' '));
  };
  const importFiles = async (files: FileList | File[]) => {
    const items = await Promise.all(Array.from(files).map(async (f) => ({ name: f.name, text: await f.text() })));
    importTexts(items);
    if (fileInput.current) fileInput.current.value = '';
    setPasteOpen(false);
  };
  const importPasted = () => {
    importTexts(splitJson(pasteText).map((text, i) => ({ name: `Pasted JSON ${i + 1}`, text })));
    setPasteText('');
    setPasteOpen(false);
  };

  const newCollection = () => {
    const c: Collection = { id: `c${Date.now()}`, name: `Collection ${cols.length + 1}`, vars: {}, items: [] };
    setCols((all) => [...all, c]);
    setOpen((o) => new Set(o).add(c.id));
  };
  const addToCollection = (colId: string) => {
    const r: ApiRequest = { ...req, id: `r${Date.now()}`, name: req.name.trim() || `${req.method} ${req.url.trim() || 'request'}`, colId };
    setCols((all) => all.map((c) => (c.id === colId ? { ...c, items: [...c.items, r] } : c)));
    setOpen((o) => new Set(o).add(colId));
    setReq(r);
  };
  const ask = (what: string, then: () => void) => confirmDialog(`Delete ${what}? This cannot be undone.`, { server: null, confirmLabel: 'Delete' }).then((ok) => ok && then());
  const removeRequest = (id: string, name: string) => ask(`request "${name}"`, () => {
    const strip = (items: Node[]): Node[] => items.filter((n) => n.id !== id).map((n) => (isFolder(n) ? { ...n, items: strip(n.items) } : n));
    setCols((all) => all.map((c) => ({ ...c, items: strip(c.items) })));
  });
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /* ---------- send / run ---------- */
  const update = (patch: Partial<ApiRequest>) => setReq((r) => ({ ...r, ...patch }));
  // Pasting a curl command fills in the whole request.
  const onUrlChange = (v: string) => {
    const c = looksLikeCurl(v) ? parseCurl(v) : null;
    if (!c) return update({ url: v });
    const auth = c.headers.find((h) => h.key.toLowerCase() === 'authorization');
    const bearer = auth && /^bearer\s/i.test(auth.value) ? auth.value.replace(/^bearer\s+/i, '') : null;
    let isJson = false;
    try { JSON.parse(c.body); isJson = true; } catch { /* plain text body */ }
    setReq((r) => ({
      ...r,
      method: METHODS.some((m) => m.value === c.method) ? c.method : 'GET',
      url: c.url,
      headers: [...c.headers.filter((h) => h !== auth || !bearer).map((h) => ({ ...h, on: true })), emptyRow()],
      authKind: bearer ? 'bearer' : 'none',
      token: bearer || '',
      bodyKind: !c.body ? 'none' : isJson ? 'json' : 'text',
      body: isJson ? prettyBody(c.body) : c.body,
      allowInsecure: c.insecure,
    }));
    setTab(c.body ? 'body' : 'headers');
  };
  const filled = (rows: Row[]) => rows.filter((r) => r.on && r.key.trim());

  const send = async () => {
    if (!req.url.trim()) return;
    setLoading(true);
    setExec(null);
    try {
      const x = await executeRequest(req, vars);
      applyVars(req.colId, x.vars);
      setExec(x);
      setResTab(x.result.ok && x.tests.length ? 'tests' : 'body');
    } finally {
      setLoading(false);
    }
  };

  const runAll = async (title: string, reqs: ApiRequest[]) => {
    if (!reqs.length) return;
    stopRun.current = false;
    setExpanded(null);
    const items: RunItem[] = reqs.map((r) => ({ req: r }));
    setRun({ title, items: [...items], running: true });
    let cur = varsFor(reqs[0]);
    for (let i = 0; i < reqs.length; i++) {
      if (stopRun.current) break;
      // the collection can change between requests (scripts write to it), so only env + col/glob are threaded by hand
      const x = await executeRequest(reqs[i], { ...cur, col: reqs[i].colId === reqs[0].colId ? cur.col : varsFor(reqs[i]).col });
      cur = x.vars;
      applyVars(reqs[i].colId, x.vars);
      items[i] = { req: reqs[i], exec: x };
      setRun({ title, items: [...items], running: true });
    }
    setRun({ title, items: [...items], running: false });
  };

  const openFromRun = (r: ApiRequest, x?: Exec) => {
    setReq(r);
    setExec(x ?? null);
    setRun(null);
  };

  const save = () => {
    const name = req.name.trim() || `${req.method} ${req.url.trim() || 'request'}`;
    const next = { ...req, name };
    setReq(next);
    if (next.colId && cols.some((c) => c.id === next.colId)) {
      setCols((all) => all.map((c) => (c.id === next.colId ? { ...c, items: mapTree(c.items, (r) => (r.id === next.id ? next : r)) } : c)));
    } else {
      setSaved((s) => (s.some((x) => x.id === next.id) ? s.map((x) => (x.id === next.id ? next : x)) : [next, ...s]));
    }
  };

  const shown = useMemo(() => (result && result.ok ? prettyBody(result.body) : ''), [result]);
  const copyBody = () => {
    navigator.clipboard.writeText(shown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const copyCurl = () => {
    navigator.clipboard.writeText(toCurl(req, vars)).then(() => {
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 1200);
    });
  };

  const jsonError = useMemo(() => {
    if (req.bodyKind !== 'json' || !req.body.trim()) return null;
    try { JSON.parse(req.body); return null; } catch (e) { return (e as Error).message; }
  }, [req.bodyKind, req.body]);

  const passed = exec ? exec.tests.filter((t) => t.pass).length : 0;
  const resolvedUrl = req.url.includes('{{') ? substitute(req.url, vars) : '';

  const renderNodes = (items: Node[], depth: number) =>
    items.map((n) => {
      const pad = { paddingLeft: 8 + depth * 12 };
      if (isFolder(n)) {
        const isOpen = open.has(n.id);
        return (
          <div key={n.id}>
            <div className="group flex items-center gap-1 rounded-lg py-1 pr-1 cursor-pointer hover:bg-bg-tertiary/50" style={pad} onClick={() => toggle(n.id)}>
              {isOpen ? <ChevronDown size={12} className="text-text-muted shrink-0" /> : <ChevronRight size={12} className="text-text-muted shrink-0" />}
              <Folder size={12} className="text-text-muted shrink-0" />
              <span className="text-xs text-text-primary truncate flex-1">{n.name}</span>
              <button type="button" title="Run this folder" onClick={(e) => { e.stopPropagation(); runAll(n.name, flatten(n.items)); }} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent">
                <Play size={12} />
              </button>
            </div>
            {isOpen && renderNodes(n.items, depth + 1)}
          </div>
        );
      }
      return (
        <div
          key={n.id}
          className={`group flex items-center gap-2 rounded-lg py-1 pr-2 cursor-pointer ${n.id === req.id ? 'bg-accent/15' : 'hover:bg-bg-tertiary/50'}`}
          style={pad}
          onClick={() => { setReq(n); setExec(null); setRun(null); }}
        >
          <span className="text-[9px] font-bold text-accent w-9 shrink-0">{n.method}</span>
          <span className="text-xs text-text-primary truncate flex-1">{n.name}</span>
          <button type="button" title="Remove request" onClick={(e) => { e.stopPropagation(); removeRequest(n.id, n.name); }} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error">
            <Trash2 size={11} />
          </button>
        </div>
      );
    });

  const envOptions = [{ value: '', label: 'No environment' }, ...envs.map((e) => ({ value: e.id, label: e.name }))];

  return (
    <div className="flex-1 flex min-h-0 bg-bg-primary">
      {/* Collections + saved requests */}
      <div
        className="w-64 shrink-0 border-r border-border/30 flex flex-col min-h-0"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); importFiles(e.dataTransfer.files); }}
      >
        <div className="p-3 flex items-center gap-2">
          <Button size="sm" variant="soft" className="flex-1" onClick={() => setPasteOpen(true)} title="Paste the JSON or pick files (you can also drop .json files here)">
            <Upload size={12} /> Import Postman
          </Button>
          <Button size="sm" variant="ghost" onClick={newCollection} title="New empty collection">
            <FolderPlus size={12} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setReq(blank()); setExec(null); setRun(null); }} title="New request">
            <Plus size={12} />
          </Button>
          <input ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={(e) => e.target.files && importFiles(e.target.files)} />
        </div>
        {note && (
          <p className="mx-3 mb-2 text-[11px] text-text-secondary bg-bg-tertiary/50 rounded-lg px-2 py-1.5 flex gap-2">
            <span className="flex-1">{note}</span>
            <button type="button" onClick={() => setNote('')} className="text-text-muted hover:text-text-primary"><X size={12} /></button>
          </p>
        )}
        {currentServer && (
          <div className="px-3 pb-3 border-b border-border/30">
            <Button size="sm" variant="outline" className="w-full" onClick={findApis} loading={finding}>
              <Radar size={12} /> Find APIs on {currentServer.name}
            </Button>
            {findError && <p className="text-[11px] text-error mt-2 break-words">Could not look at the server: {findError}</p>}
            {found && found.length === 0 && <p className="text-[11px] text-text-muted mt-2">No web apps found. Nothing on this server answered over HTTP.</p>}
            {found && found.length > 0 && (
              <div className="mt-2 space-y-0.5 max-h-56 overflow-y-auto">
                <p className="text-[10px] text-text-muted mb-1">Click one to test it.</p>
                {found.map((f) => (
                  <button
                    key={f.port}
                    type="button"
                    onClick={() => useFound(f)}
                    title={f.exposed ? 'Open to the internet' : 'Only reachable from inside the server (not from your computer)'}
                    className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-bg-tertiary/50"
                  >
                    <span className="text-[11px] font-mono text-accent shrink-0">:{f.port}</span>
                    <span className="text-xs text-text-primary truncate flex-1">{f.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${f.exposed ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>{f.exposed ? 'Public' : 'Private'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-2 pb-2 pt-1 space-y-0.5">
          {cols.map((c) => {
            const isOpen = open.has(c.id);
            return (
              <div key={c.id}>
                <div className="group flex items-center gap-1 rounded-lg px-1 py-1 cursor-pointer hover:bg-bg-tertiary/50" onClick={() => toggle(c.id)}>
                  {isOpen ? <ChevronDown size={12} className="text-text-muted shrink-0" /> : <ChevronRight size={12} className="text-text-muted shrink-0" />}
                  <span className="text-xs font-semibold text-text-primary truncate flex-1">{c.name}</span>
                  <button type="button" title="Add the request in the editor to this collection" onClick={(e) => { e.stopPropagation(); addToCollection(c.id); }} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent">
                    <Plus size={12} />
                  </button>
                  <button type="button" title="Export as a Postman collection (.json)" onClick={(e) => { e.stopPropagation(); downloadJson(c.name, exportCollection(c)); }} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent">
                    <Download size={12} />
                  </button>
                  <button type="button" title="Run every request in order" onClick={(e) => { e.stopPropagation(); runAll(c.name, flatten(c.items)); }} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-accent">
                    <Play size={12} />
                  </button>
                  <button type="button" title="Remove collection" onClick={(e) => { e.stopPropagation(); ask(`collection "${c.name}" and its ${flatten(c.items).length} requests`, () => setCols((all) => all.filter((x) => x.id !== c.id))); }} className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error">
                    <Trash2 size={12} />
                  </button>
                </div>
                {isOpen && renderNodes(c.items, 1)}
              </div>
            );
          })}
          {cols.length === 0 && saved.length === 0 && <p className="text-[11px] text-text-muted px-2 py-3">Import a Postman collection (and its environment) to test it here, or build a request and press Save.</p>}
          {saved.length > 0 && <p className="text-[10px] uppercase tracking-wide text-text-muted px-2 pt-3 pb-1">Saved requests</p>}
          {saved.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${s.id === req.id ? 'bg-accent/15' : 'hover:bg-bg-tertiary/50'}`}
              onClick={() => { setReq(s); setExec(null); setRun(null); }}
            >
              <span className="text-[10px] font-bold text-accent w-10 shrink-0">{s.method}</span>
              <span className="text-xs text-text-primary truncate flex-1">{s.name}</span>
              <button
                type="button"
                title="Delete"
                onClick={(e) => { e.stopPropagation(); ask(`saved request "${s.name}"`, () => setSaved((all) => all.filter((x) => x.id !== s.id))); }}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Builder + response */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 p-4 gap-3 overflow-y-auto">
        <div className="flex gap-2 items-center">
          <Select value={req.method} onChange={(m) => update({ method: m })} options={METHODS} containerClassName="w-28 shrink-0" />
          <Input
            placeholder="Paste a URL or a curl command, e.g. https://api.example.com/users"
            value={req.url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            className="font-mono"
          />
          <Button onClick={send} loading={loading} disabled={!req.url.trim()}>
            <Send size={14} /> Send
          </Button>
          <Button variant="soft" onClick={save} disabled={!req.url.trim()} title="Save this request">
            <Save size={14} /> Save
          </Button>
          <Button variant="ghost" onClick={copyCurl} disabled={!req.url.trim()} title="Copy this request as a curl command, variables filled in">
            {curlCopied ? <Check size={14} /> : <Copy size={14} />} curl
          </Button>
          <div className="w-px h-6 bg-border/40 mx-1" />
          <Select value={envId} onChange={setEnvId} options={envOptions} containerClassName="w-44 shrink-0" title="Environment: where {{variables}} get their values" />
          <Button variant="ghost" onClick={() => setVarsOpen(true)} title="Edit environment and collection variables">
            <Braces size={14} />
          </Button>
        </div>
        {(missing.length > 0 || resolvedUrl) && (
          <div className="-mt-1 text-[11px] space-y-0.5">
            {resolvedUrl && <p className="font-mono text-text-muted truncate">→ {resolvedUrl}</p>}
            {missing.length > 0 && (
              <p className="text-warning">
                No value for {missing.map((k) => `{{${k}}}`).join(', ')}. {envs.length ? 'Pick an environment or fill it in under Variables.' : 'Import an environment or add them under Variables.'}
              </p>
            )}
          </div>
        )}

        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'params', label: 'Query params', count: filled(req.params).length },
            { id: 'headers', label: 'Headers', count: filled(req.headers).length },
            { id: 'body', label: 'Body' },
            { id: 'auth', label: 'Login' },
            { id: 'scripts', label: 'Scripts', count: (req.pre?.trim() ? 1 : 0) + (req.test?.trim() ? 1 : 0) },
          ]}
        />

        <div className="min-h-[120px]">
          {tab === 'params' && (
            <>
              <p className="text-[11px] text-text-muted mb-2">Added to the end of the URL as ?name=value. Use {'{{name}}'} to insert a variable.</p>
              <RowEditor rows={req.params} onChange={(params) => update({ params })} keyHint="name" valueHint="value" />
            </>
          )}
          {tab === 'headers' && (
            <>
              <p className="text-[11px] text-text-muted mb-2">Extra information sent with the request, such as Accept or X-Api-Key.</p>
              <RowEditor rows={req.headers} onChange={(headers) => update({ headers })} keyHint="Header name" valueHint="value" />
            </>
          )}
          {tab === 'body' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Select
                  value={req.bodyKind}
                  onChange={(v) => update({ bodyKind: v as BodyKind })}
                  options={[{ value: 'none', label: 'No body' }, { value: 'json', label: 'JSON' }, { value: 'text', label: 'Plain text' }]}
                  containerClassName="w-36"
                />
                {req.bodyKind === 'json' && (
                  <Button size="sm" variant="soft" disabled={!!jsonError || !req.body.trim()} onClick={() => update({ body: prettyBody(req.body) })}>
                    Tidy up JSON
                  </Button>
                )}
                {req.method === 'GET' && req.bodyKind !== 'none' && <span className="text-[11px] text-warning">GET requests do not send a body. Pick POST or PUT.</span>}
              </div>
              {req.bodyKind !== 'none' && (
                <Textarea rows={8} value={req.body} onChange={(e) => update({ body: e.target.value })} placeholder={req.bodyKind === 'json' ? '{\n  "name": "Serop"\n}' : 'Text to send'} />
              )}
              {jsonError && !req.body.includes('{{') && <p className="text-[11px] text-error">This is not valid JSON yet: {jsonError}</p>}
            </div>
          )}
          {tab === 'auth' && (
            <div className="space-y-2 max-w-md">
              <Select
                value={req.authKind}
                onChange={(v) => update({ authKind: v as AuthKind })}
                options={[{ value: 'none', label: 'No login' }, { value: 'bearer', label: 'Token (Bearer)' }, { value: 'basic', label: 'Username and password' }]}
                containerClassName="w-56"
              />
              {req.authKind === 'bearer' && <Input size="sm" placeholder="Paste your token, or {{token}}" value={req.token} onChange={(e) => update({ token: e.target.value })} className="font-mono" />}
              {req.authKind === 'basic' && (
                <>
                  <Input size="sm" placeholder="Username" value={req.user} onChange={(e) => update({ user: e.target.value })} />
                  <Input size="sm" type="password" placeholder="Password" value={req.pass} onChange={(e) => update({ pass: e.target.value })} />
                </>
              )}
              <label className="flex items-center gap-2 text-[11px] text-text-secondary pt-2 cursor-pointer">
                <input type="checkbox" checked={req.allowInsecure} onChange={(e) => update({ allowInsecure: e.target.checked })} className="accent-[var(--color-accent)]" />
                Allow untrusted certificate (for self-signed HTTPS on your own server)
              </label>
            </div>
          )}
          {tab === 'scripts' && (
            <div className="space-y-3">
              <p className="text-[11px] text-text-muted">
                Postman scripts work here: pm.test, pm.expect, pm.response.json(), pm.environment.set, pm.collectionVariables.set. They run in a sandbox. Imported collection and folder scripts are already merged in.
              </p>
              <div>
                <p className="text-[11px] font-semibold text-text-secondary mb-1">Before sending</p>
                <Textarea rows={5} className="font-mono" value={req.pre || ''} onChange={(e) => update({ pre: e.target.value })} placeholder="pm.collectionVariables.set('id', Date.now());" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-text-secondary mb-1">After the answer (tests)</p>
                <Textarea rows={5} className="font-mono" value={req.test || ''} onChange={(e) => update({ test: e.target.value })} placeholder="pm.test('is OK', () => pm.response.to.have.status(200));" />
              </div>
            </div>
          )}
        </div>

        {/* Response, or the collection runner */}
        <div className="flex-1 min-h-[200px] flex flex-col rounded-xl border border-border/30 overflow-hidden">
          {run && (
            <>
              <div className="flex items-center gap-3 px-3 py-2 border-b border-border/30 text-xs">
                <span className="font-semibold text-text-primary truncate">Run: {run.title}</span>
                <span className="text-text-secondary">
                  {run.items.filter((i) => i.exec).length}/{run.items.length} done ·{' '}
                  {run.items.reduce((n, i) => n + (i.exec?.tests.filter((t) => t.pass).length ?? 0), 0)} tests passed ·{' '}
                  {run.items.reduce((n, i) => n + (i.exec?.tests.filter((t) => !t.pass).length ?? 0), 0)} failed
                </span>
                <span className="ml-auto flex gap-2">
                  {run.running && <Button size="sm" variant="danger" onClick={() => { stopRun.current = true; }}><Square size={11} /> Stop</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setRun(null)}><X size={12} /> Close</Button>
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                {run.items.map((it, i) => {
                  const x = it.exec;
                  const r = x?.result;
                  const failed = !!x && (!r?.ok || x.tests.some((t) => !t.pass));
                  const isOpen = expanded === i;
                  return (
                    <div key={it.req.id} className="border-b border-border/20">
                      <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-bg-tertiary/40" onClick={() => setExpanded(isOpen ? null : i)}>
                        {!x ? <span className="w-3.5 text-[10px] text-text-muted">{run.running ? '…' : '–'}</span> : failed ? <XCircle size={14} className="text-error shrink-0" /> : <CheckCircle2 size={14} className="text-success shrink-0" />}
                        <span className="text-[10px] font-bold text-accent w-10 shrink-0">{it.req.method}</span>
                        <span className="text-xs text-text-primary truncate flex-1">{it.req.name}</span>
                        {r?.ok && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${statusColor(r.status)}`}>{r.status}</span>}
                        {r?.ok && <span className="text-[11px] text-text-muted w-16 text-right">{r.ms} ms</span>}
                        {x && x.tests.length > 0 && <span className="text-[11px] text-text-secondary w-12 text-right">{x.tests.filter((t) => t.pass).length}/{x.tests.length}</span>}
                      </div>
                      {isOpen && x && (
                        <div className="px-9 pb-2 space-y-1 text-[11px]">
                          <p className="font-mono text-text-muted break-all">{it.req.method} {x.url}</p>
                          {r && !r.ok && <p className="text-error">{r.error}</p>}
                          {x.warnings.map((w) => <p key={w} className="text-warning">{w}</p>)}
                          {x.tests.map((t, j) => (
                            <p key={j} className={t.pass ? 'text-success' : 'text-error'}>
                              {t.pass ? '✓' : '✗'} {t.name}{t.error && <span className="text-text-muted"> · {t.error}</span>}
                            </p>
                          ))}
                          {x.logs.map((l, j) => <p key={j} className="font-mono text-text-secondary">{l}</p>)}
                          <Button size="sm" variant="soft" onClick={() => openFromRun(it.req, x)}>Open this request</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {!run && loading && <EmptyState icon={Send} message="Sending..." />}
          {!run && !loading && !result && (
            <EmptyState icon={Globe} title="Response will show here" message="Type a URL above and press Send (or Enter). Works for public sites and apps running on this computer. Import a Postman collection on the left to run a whole flow." />
          )}
          {!run && !loading && result && !result.ok && (
            <div className="p-4">
              <p className="text-sm font-semibold text-error">Could not get an answer</p>
              <p className="text-xs text-text-secondary mt-1">{result.error}</p>
              {exec?.warnings.map((w) => <p key={w} className="text-xs text-warning mt-1">{w}</p>)}
            </div>
          )}
          {!run && !loading && exec && result && result.ok && (
            <>
              <div className="flex items-center gap-3 px-3 py-2 border-b border-border/30 text-xs">
                <span className={`px-2 py-0.5 rounded-md font-bold ${statusColor(result.status)}`}>{result.status} {result.statusText}</span>
                <span className="text-text-secondary truncate">{STATUS_WORDS[result.status] || ''}</span>
                {exec.tests.length > 0 && (
                  <span className={`px-2 py-0.5 rounded-md font-semibold ${passed === exec.tests.length ? 'text-success bg-success/15' : 'text-error bg-error/15'}`}>Tests {passed}/{exec.tests.length}</span>
                )}
                <span className="ml-auto text-text-muted shrink-0">{result.ms} ms · {formatSize(result.size)}</span>
                <Button size="sm" variant="ghost" onClick={copyBody}>
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              {exec.warnings.length > 0 && <div className="px-3 py-1.5 text-[11px] text-warning border-b border-border/30">{exec.warnings.join(' · ')}</div>}
              <Tabs
                value={resTab}
                onChange={setResTab}
                tabs={[
                  { id: 'body', label: 'Response' },
                  { id: 'headers', label: 'Headers', count: Object.keys(result.headers).length },
                  { id: 'tests', label: 'Tests', count: exec.tests.length },
                  { id: 'console', label: 'Console', count: exec.logs.length },
                ]}
              />
              <div className="flex-1 overflow-auto p-3">
                {resTab === 'body' && (
                  <>
                    {result.truncated && <p className="text-[11px] text-warning mb-2">Response is large, showing the first 5 MB.</p>}
                    <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-all">{shown || '(empty response)'}</pre>
                  </>
                )}
                {resTab === 'headers' && (
                  <table className="text-xs font-mono">
                    <tbody>
                      {Object.entries(result.headers).map(([k, v]) => (
                        <tr key={k} className="align-top">
                          <td className="pr-4 py-0.5 text-accent">{k}</td>
                          <td className="py-0.5 text-text-primary break-all">{Array.isArray(v) ? v.join(', ') : v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {resTab === 'tests' && (
                  exec.tests.length === 0 ? (
                    <p className="text-xs text-text-muted">No tests ran. Add pm.test(...) under the Scripts tab, or import a collection that has them.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {exec.tests.map((t, i) => (
                        <p key={i} className={`text-xs flex gap-2 ${t.pass ? 'text-success' : 'text-error'}`}>
                          {t.pass ? <CheckCircle2 size={14} className="shrink-0" /> : <XCircle size={14} className="shrink-0" />}
                          <span>{t.name}{t.error && <span className="block text-text-muted font-mono">{t.error}</span>}</span>
                        </p>
                      ))}
                    </div>
                  )
                )}
                {resTab === 'console' && (
                  exec.logs.length === 0
                    ? <p className="text-xs text-text-muted">console.log output from your scripts shows here.</p>
                    : <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-all">{exec.logs.join('\n')}</pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import from Postman</DialogTitle>
            <DialogDescription>Paste the collection and/or environment JSON (both can go in together), or choose the files.</DialogDescription>
          </DialogHeader>
          <Textarea rows={12} className="font-mono" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder='{ "info": { "name": "My collection" }, "item": [...] }' />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => fileInput.current?.click()}><Upload size={14} /> Choose files…</Button>
            <Button onClick={importPasted} disabled={!pasteText.trim()}>Import pasted</Button>
          </div>
        </DialogContent>
      </Dialog>

      <VarsDialog open={varsOpen} onClose={() => setVarsOpen(false)} envs={envs} setEnvs={setEnvs} envId={envId} setEnvId={setEnvId} cols={cols} setCols={setCols} activeColId={req.colId} />
    </div>
  );
}

// a paste can hold several JSON documents back to back (a collection and its environment): split on top-level braces
function splitJson(text: string): string[] {
  const out: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && depth > 0 && --depth === 0) out.push(text.slice(start, i + 1));
  }
  return out.length ? out : [text];
}

function VarsDialog({ open, onClose, envs, setEnvs, envId, setEnvId, cols, setCols, activeColId }: {
  open: boolean;
  onClose: () => void;
  envs: Env[];
  setEnvs: (f: (all: Env[]) => Env[]) => void;
  envId: string;
  setEnvId: (id: string) => void;
  cols: Collection[];
  setCols: (f: (all: Collection[]) => Collection[]) => void;
  activeColId?: string;
}) {
  const [which, setWhich] = useState<'env' | 'col'>('env');
  const [colId, setColId] = useState('');
  const env = envs.find((e) => e.id === envId);
  const col = cols.find((c) => c.id === (colId || activeColId)) ?? cols[0];

  const addEnv = () => {
    const e: Env = { id: String(Date.now()), name: `Environment ${envs.length + 1}`, vars: [emptyRow()] };
    setEnvs((all) => [...all, e]);
    setEnvId(e.id);
    setWhich('env');
  };
  const colRows = col ? [...Object.entries(col.vars).map(([key, value]) => ({ key, value, on: true })), emptyRow()] : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Variables</DialogTitle>
          <DialogDescription>Use them anywhere as {'{{name}}'}. An empty environment value falls back to the collection value. Scripts update these as they run.</DialogDescription>
        </DialogHeader>
        <Tabs value={which} onChange={setWhich} tabs={[{ id: 'env', label: 'Environment' }, { id: 'col', label: 'Collection' }]} />
        <div className="max-h-[50vh] overflow-y-auto space-y-3">
          {which === 'env' && (
            <>
              <div className="flex items-center gap-2">
                <Select value={envId} onChange={setEnvId} options={[{ value: '', label: 'No environment' }, ...envs.map((e) => ({ value: e.id, label: e.name }))]} containerClassName="w-52" />
                <Button size="sm" variant="soft" onClick={addEnv}><Plus size={12} /> New</Button>
                {env && (
                  <>
                    <Input size="sm" value={env.name} onChange={(e) => setEnvs((all) => all.map((x) => (x.id === env.id ? { ...x, name: e.target.value } : x)))} />
                    <Button size="sm" variant="soft" onClick={() => downloadJson(env.name, exportEnv(env))} title="Export as a Postman environment (.json)"><Download size={12} /></Button>
                    <Button size="sm" variant="danger" onClick={() => confirmDialog(`Delete environment "${env.name}"? This cannot be undone.`, { server: null, confirmLabel: 'Delete' }).then((ok) => { if (ok) { setEnvs((all) => all.filter((x) => x.id !== env.id)); setEnvId(''); } })} title="Delete this environment"><Trash2 size={12} /></Button>
                  </>
                )}
              </div>
              {env
                ? <RowEditor rows={env.vars} onChange={(vars) => setEnvs((all) => all.map((x) => (x.id === env.id ? { ...x, vars } : x)))} keyHint="Variable" valueHint="Value" />
                : <p className="text-xs text-text-muted">Pick an environment, make a new one, or import a Postman environment file.</p>}
            </>
          )}
          {which === 'col' && (col ? (
            <>
              <div className="flex items-center gap-2">
                <Select value={col.id} onChange={setColId} options={cols.map((c) => ({ value: c.id, label: c.name }))} containerClassName="w-64" />
                <Input size="sm" value={col.name} title="Collection name" onChange={(e) => setCols((all) => all.map((c) => (c.id === col.id ? { ...c, name: e.target.value } : c)))} />
              </div>
              <RowEditor
                rows={colRows}
                onChange={(rows) => setCols((all) => all.map((c) => (c.id === col.id ? { ...c, vars: Object.fromEntries(rows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value])) } : c)))}
                keyHint="Variable"
                valueHint="Value"
              />
            </>
          ) : <p className="text-xs text-text-muted">Import a collection to see its variables.</p>)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
