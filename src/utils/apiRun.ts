// Runs one API request the Postman way: pre-request script -> {{variables}} -> send -> test script.
// Scripts run in a Web Worker (no DOM, no window.serverOperator), so an imported collection can't touch the app.
import type { ApiRequest } from './postman';

export type VarMap = Record<string, string>;
export interface Vars { env: VarMap; col: VarMap; glob: VarMap }
export type Sent = Awaited<ReturnType<Window['serverOperator']['apiRequest']>>;
export interface TestResult { name: string; pass: boolean; error?: string }
interface ScriptOut { tests: TestResult[]; logs: string[]; vars: Vars; error?: string }
export interface Exec {
  result: Sent;
  url: string;
  tests: TestResult[];
  logs: string[];
  vars: Vars;
  /** Script errors and variables that stayed unresolved */
  warnings: string[];
}

const WORKER_SRC = `
const J = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
const typeOf = (v) => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const same = (a, b) => J(a) === J(b);
function expect(v, neg) {
  const chk = (ok, msg) => { if (neg ? ok : !ok) throw new Error('expected ' + J(v) + ' ' + (neg ? 'not ' : '') + msg); return a; };
  const a = {
    equal: (x) => chk(v === x, 'to equal ' + J(x)),
    eql: (x) => chk(same(v, x), 'to deeply equal ' + J(x)),
    include: (x) => chk(typeof v === 'string' ? v.includes(x) : Array.isArray(v) ? v.some((e) => same(e, x)) : v && typeof v === 'object' ? Object.keys(x).every((k) => same(v[k], x[k])) : false, 'to include ' + J(x)),
    match: (re) => chk(re.test(v), 'to match ' + re),
    a: (t) => chk(typeOf(v) === t, 'to be a ' + t),
    property: (k, ...r) => chk(v != null && k in Object(v) && (r.length === 0 || same(v[k], r[0])), 'to have property ' + k),
    above: (n) => chk(v > n, 'to be above ' + n),
    below: (n) => chk(v < n, 'to be below ' + n),
    least: (n) => chk(v >= n, 'to be at least ' + n),
    most: (n) => chk(v <= n, 'to be at most ' + n),
    lengthOf: (n) => chk(v != null && v.length === n, 'to have length ' + n),
    oneOf: (l) => chk(l.some((e) => same(e, v)), 'to be one of ' + J(l)),
    keys: (...k) => chk(v && k.flat().every((x) => x in v), 'to have keys ' + J(k.flat())),
  };
  a.equals = a.eq = a.equal; a.eqls = a.eql; a.contain = a.contains = a.includes = a.include; a.an = a.a;
  a.greaterThan = a.above; a.lessThan = a.below; a.within = (lo, hi) => chk(v >= lo && v <= hi, 'to be within ' + lo + '..' + hi);
  const flags = {
    ok: () => chk(!!v, 'to be truthy'), true: () => chk(v === true, 'to be true'), false: () => chk(v === false, 'to be false'),
    null: () => chk(v === null, 'to be null'), undefined: () => chk(v === undefined, 'to be undefined'),
    exist: () => chk(v != null, 'to exist'), empty: () => chk(v == null || (typeof v === 'object' ? Object.keys(v).length === 0 : v.length === 0), 'to be empty'),
  };
  for (const k in flags) Object.defineProperty(a, k, { get: flags[k] });
  for (const w of ['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'same', 'does', 'still']) Object.defineProperty(a, w, { get: () => a });
  Object.defineProperty(a, 'not', { get: () => expect(v, !neg) });
  return a;
}

self.onmessage = (e) => {
  const { code, vars, response, name } = e.data;
  const out = { tests: [], logs: [], vars: { env: { ...vars.env }, col: { ...vars.col }, glob: { ...vars.glob } } };
  const store = (m) => ({
    get: (k) => m[k], set: (k, v) => { m[k] = String(v); }, unset: (k) => { delete m[k]; }, has: (k) => k in m, clear: () => { for (const k in m) delete m[k]; },
    toObject: () => ({ ...m }),
  });
  const local = {};
  const lookup = (k) => local[k] ?? (out.vars.env[k] || undefined) ?? out.vars.col[k] ?? out.vars.glob[k];
  const rs = response && {
    code: response.status, status: response.statusText, responseTime: response.ms, responseSize: response.size,
    headers: { get: (h) => { const v = response.headers[String(h).toLowerCase()]; return Array.isArray(v) ? v.join(', ') : v; }, has: (h) => String(h).toLowerCase() in response.headers },
    text: () => response.body, json: () => JSON.parse(response.body),
  };
  if (rs) rs.to = {
    be: { get ok() { if (rs.code < 200 || rs.code >= 300) throw new Error('expected 2xx, got ' + rs.code); return true; }, get success() { return this.ok; }, get error() { if (rs.code < 400) throw new Error('expected an error status, got ' + rs.code); return true; } },
    have: {
      status: (s) => { if (typeof s === 'number' ? rs.code !== s : rs.status !== s) throw new Error('expected status ' + s + ', got ' + rs.code + ' ' + rs.status); },
      header: (h, v) => { const g = rs.headers.get(h); if (g === undefined || (v !== undefined && g !== v)) throw new Error('expected header ' + h + (v !== undefined ? ' = ' + v : '')); },
      jsonBody: (k) => { const j = rs.json(); if (k !== undefined && !(k in j)) throw new Error('expected JSON body to have ' + k); },
    },
  };
  const pm = {
    info: { requestName: name },
    environment: store(out.vars.env), collectionVariables: store(out.vars.col), globals: store(out.vars.glob),
    variables: { get: lookup, set: (k, v) => { local[k] = String(v); }, has: (k) => lookup(k) !== undefined },
    response: rs,
    test: (n, fn) => { try { fn(); out.tests.push({ name: n, pass: true }); } catch (err) { out.tests.push({ name: n, pass: false, error: String(err && err.message || err) }); } },
    expect: (v) => expect(v, false),
  };
  const fmt = (x) => typeof x === 'string' ? x : J(x);
  const console = { log: (...a) => out.logs.push(a.map(fmt).join(' ')), info: (...a) => out.logs.push(a.map(fmt).join(' ')), warn: (...a) => out.logs.push('warn: ' + a.map(fmt).join(' ')), error: (...a) => out.logs.push('error: ' + a.map(fmt).join(' ')) };
  try { new Function('pm', 'console', 'postman', code)(pm, console, { setNextRequest() {} }); }
  catch (err) { out.error = String(err && err.message || err); }
  self.postMessage(out);
};`;

let workerUrl = '';
function runScript(code: string, vars: Vars, name: string, response?: Extract<Sent, { ok: true }>): Promise<ScriptOut> {
  if (!code.trim()) return Promise.resolve({ tests: [], logs: [], vars });
  workerUrl ||= URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  return new Promise((resolve) => {
    const w = new Worker(workerUrl);
    const finish = (o: ScriptOut) => { clearTimeout(t); w.terminate(); resolve(o); };
    const t = setTimeout(() => finish({ tests: [], logs: [], vars, error: 'Script ran longer than 5 seconds and was stopped.' }), 5000);
    w.onmessage = (e) => finish(e.data);
    w.onerror = (e) => finish({ tests: [], logs: [], vars, error: e.message || 'Script failed' });
    w.postMessage({ code, vars, name, response });
  });
}

const DYNAMIC: Record<string, () => string> = {
  $timestamp: () => String(Math.floor(Date.now() / 1000)),
  $isoTimestamp: () => new Date().toISOString(),
  $guid: () => crypto.randomUUID(),
  $randomUUID: () => crypto.randomUUID(),
  $randomInt: () => String(Math.floor(Math.random() * 1001)),
};

/** Replace {{name}} with its value. Empty environment values count as unset so the collection value can show through. */
export function substitute(s: string, v: Vars, missing?: Set<string>): string {
  return s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (m, k: string) => {
    if (DYNAMIC[k]) return DYNAMIC[k]();
    const val = v.env[k] || v.col[k] || v.glob[k];
    if (val === undefined) { missing?.add(k); return m; }
    return val;
  });
}

export const unresolved = (s: string, v: Vars) => {
  const m = new Set<string>();
  substitute(s, v, m);
  return [...m];
};

const used = (rows: { key: string; value: string; on: boolean }[]) => rows.filter((r) => r.on && r.key.trim());

/** The final URL, headers and body of a request with {{variables}} filled in. */
function prepare(req: ApiRequest, vars: Vars) {
  const missing = new Set<string>();
  const sub = (s: string) => substitute(s, vars, missing);
  let url = sub(req.url.trim());
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  let fail = '';
  try {
    const u = new URL(url);
    used(req.params).forEach((p) => u.searchParams.append(sub(p.key.trim()), sub(p.value)));
    url = u.toString();
  } catch { fail = 'That URL does not look right.'; }

  const headers: Record<string, string> = {};
  used(req.headers).forEach((h) => { headers[sub(h.key.trim())] = sub(h.value); });
  if (req.authKind === 'bearer' && req.token) headers.Authorization = `Bearer ${sub(req.token).trim()}`;
  if (req.authKind === 'basic') headers.Authorization = `Basic ${btoa(`${sub(req.user)}:${sub(req.pass)}`)}`;
  const body = req.bodyKind === 'none' ? undefined : sub(req.body);
  if (req.bodyKind === 'json' && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
  return { url, headers, body, fail, missing: [...missing] };
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
export function toCurl(req: ApiRequest, vars: Vars): string {
  const { url, headers, body } = prepare(req, vars);
  const parts = ['curl', '-X', req.method, q(url), ...Object.entries(headers).flatMap(([k, v]) => ['-H', q(`${k}: ${v}`)])];
  if (body && req.method !== 'GET' && req.method !== 'HEAD') parts.push('--data-raw', q(body));
  if (req.allowInsecure) parts.push('-k');
  return parts.join(' ');
}

export async function executeRequest(req: ApiRequest, start: Vars): Promise<Exec> {
  const warnings: string[] = [];
  const logs: string[] = [];
  let vars = start;

  const pre = await runScript(req.pre || '', vars, req.name);
  vars = pre.vars;
  logs.push(...pre.logs);
  if (pre.error) warnings.push(`Pre-request script: ${pre.error}`);

  const { url, headers, body, fail, missing } = prepare(req, vars);
  if (missing.length) warnings.push(`No value for: ${missing.map((k) => `{{${k}}}`).join(', ')}`);

  const result: Sent = fail
    ? { ok: false, error: `${fail} Start it with http:// or https://` }
    : await window.serverOperator.apiRequest({ method: req.method, url, headers, body, allowInsecure: req.allowInsecure }).catch((e) => ({ ok: false as const, error: String(e) }));

  let tests: TestResult[] = [];
  if (result.ok) {
    const t = await runScript(req.test || '', vars, req.name, result);
    vars = t.vars;
    tests = t.tests;
    logs.push(...t.logs);
    if (t.error) warnings.push(`Test script: ${t.error}`);
  }
  return { result, url, tests, logs, vars, warnings };
}
