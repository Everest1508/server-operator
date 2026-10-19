import { useState, useEffect, useMemo } from 'react';
import { Send, Plus, Trash2, Save, Copy, Check, X, Globe, Radar } from 'lucide-react';
import { Select } from './Select';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Textarea } from './ui/Textarea';
import { EmptyState } from './ui/EmptyState';
import { looksLikeCurl, parseCurl } from '../utils/curl';
import { DISCOVER_COMMAND, parseDiscovery, type FoundApi } from '../utils/discoverApis';
import type { ServerConnection, ProxySettings } from '../types';

type Row = { key: string; value: string; on: boolean };
type BodyKind = 'none' | 'json' | 'text';
type AuthKind = 'none' | 'bearer' | 'basic';

interface ApiRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  params: Row[];
  headers: Row[];
  bodyKind: BodyKind;
  body: string;
  authKind: AuthKind;
  token: string;
  user: string;
  pass: string;
  allowInsecure: boolean;
}

type Result = Awaited<ReturnType<Window['serverOperator']['apiRequest']>>;

const STORE = 'serop-api-requests';
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
});

function loadSaved(): ApiRequest[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

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
  const [req, setReq] = useState<ApiRequest>(blank);
  const [tab, setTab] = useState<'params' | 'headers' | 'body' | 'auth'>('params');
  const [resTab, setResTab] = useState<'body' | 'headers'>('body');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [found, setFound] = useState<FoundApi[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState('');

  useEffect(() => { setFound(null); setFindError(''); }, [currentServer?.id]);

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
    setResult(null);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(saved));
    } catch { /* storage full or blocked: saving is a convenience */ }
  }, [saved]);

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
    let url = req.url.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`; // "localhost:3000" just works
    const params = filled(req.params);
    if (params.length) {
      const u = new URL(url);
      params.forEach((p) => u.searchParams.append(p.key.trim(), p.value));
      url = u.toString();
    }
    const headers: Record<string, string> = {};
    filled(req.headers).forEach((h) => { headers[h.key.trim()] = h.value; });
    if (req.authKind === 'bearer' && req.token) headers.Authorization = `Bearer ${req.token.trim()}`;
    if (req.authKind === 'basic') headers.Authorization = `Basic ${btoa(`${req.user}:${req.pass}`)}`;
    if (req.bodyKind === 'json' && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
    setLoading(true);
    setResult(null);
    try {
      setResult(await window.serverOperator.apiRequest({
        method: req.method,
        url,
        headers,
        body: req.bodyKind === 'none' ? undefined : req.body,
        allowInsecure: req.allowInsecure,
      }));
      setResTab('body');
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const save = () => {
    const name = req.name.trim() || `${req.method} ${req.url.trim() || 'request'}`;
    const next = { ...req, name };
    setReq(next);
    setSaved((s) => (s.some((x) => x.id === next.id) ? s.map((x) => (x.id === next.id ? next : x)) : [next, ...s]));
  };

  const shown = useMemo(() => (result && result.ok ? prettyBody(result.body) : ''), [result]);
  const copyBody = () => {
    navigator.clipboard.writeText(shown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const jsonError = useMemo(() => {
    if (req.bodyKind !== 'json' || !req.body.trim()) return null;
    try { JSON.parse(req.body); return null; } catch (e) { return (e as Error).message; }
  }, [req.bodyKind, req.body]);

  return (
    <div className="flex-1 flex min-h-0 bg-bg-primary">
      {/* Saved requests */}
      <div className="w-60 shrink-0 border-r border-border/30 flex flex-col min-h-0">
        <div className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-text-primary">Saved requests</span>
          <Button size="sm" variant="soft" onClick={() => { setReq(blank()); setResult(null); }}>
            <Plus size={12} /> New
          </Button>
        </div>
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
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {saved.length === 0 && <p className="text-[11px] text-text-muted px-2 py-3">Nothing saved yet. Press Save after you build a request.</p>}
          {saved.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${s.id === req.id ? 'bg-accent/15' : 'hover:bg-bg-tertiary/50'}`}
              onClick={() => { setReq(s); setResult(null); }}
            >
              <span className="text-[10px] font-bold text-accent w-10 shrink-0">{s.method}</span>
              <span className="text-xs text-text-primary truncate flex-1">{s.name}</span>
              <button
                type="button"
                title="Delete"
                onClick={(e) => { e.stopPropagation(); setSaved((all) => all.filter((x) => x.id !== s.id)); }}
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
          <Button variant="soft" onClick={save} disabled={!req.url.trim()} title="Save this request to the list on the left">
            <Save size={14} /> Save
          </Button>
        </div>

        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'params', label: 'Query params', count: filled(req.params).length },
            { id: 'headers', label: 'Headers', count: filled(req.headers).length },
            { id: 'body', label: 'Body' },
            { id: 'auth', label: 'Login' },
          ]}
        />

        <div className="min-h-[120px]">
          {tab === 'params' && (
            <>
              <p className="text-[11px] text-text-muted mb-2">Added to the end of the URL as ?name=value.</p>
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
              {jsonError && <p className="text-[11px] text-error">This is not valid JSON yet: {jsonError}</p>}
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
              {req.authKind === 'bearer' && <Input size="sm" placeholder="Paste your token" value={req.token} onChange={(e) => update({ token: e.target.value })} className="font-mono" />}
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
        </div>

        {/* Response */}
        <div className="flex-1 min-h-[200px] flex flex-col rounded-xl border border-border/30 overflow-hidden">
          {loading && <EmptyState icon={Send} message="Sending..." />}
          {!loading && !result && (
            <EmptyState icon={Globe} title="Response will show here" message="Type a URL above and press Send (or Enter). Works for public sites and apps running on this computer." />
          )}
          {!loading && result && !result.ok && (
            <div className="p-4">
              <p className="text-sm font-semibold text-error">Could not get an answer</p>
              <p className="text-xs text-text-secondary mt-1">{result.error}</p>
            </div>
          )}
          {!loading && result && result.ok && (
            <>
              <div className="flex items-center gap-3 px-3 py-2 border-b border-border/30 text-xs">
                <span className={`px-2 py-0.5 rounded-md font-bold ${statusColor(result.status)}`}>{result.status} {result.statusText}</span>
                <span className="text-text-secondary truncate">{STATUS_WORDS[result.status] || ''}</span>
                <span className="ml-auto text-text-muted shrink-0">{result.ms} ms · {formatSize(result.size)}</span>
                <Button size="sm" variant="ghost" onClick={copyBody}>
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <Tabs value={resTab} onChange={setResTab} tabs={[{ id: 'body', label: 'Response' }, { id: 'headers', label: 'Headers', count: Object.keys(result.headers).length }]} />
              <div className="flex-1 overflow-auto p-3">
                {resTab === 'body' ? (
                  <>
                    {result.truncated && <p className="text-[11px] text-warning mb-2">Response is large, showing the first 5 MB.</p>}
                    <pre className="text-xs font-mono text-text-primary whitespace-pre-wrap break-all">{shown || '(empty response)'}</pre>
                  </>
                ) : (
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
