// Postman import: collection v2.x and environment/globals files -> the shapes ApiView uses.
export type Row = { key: string; value: string; on: boolean };
export type BodyKind = 'none' | 'json' | 'text';
export type AuthKind = 'none' | 'bearer' | 'basic';

export interface ApiRequest {
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
  /** Scripts; for imported requests the collection and folder scripts are already merged in. */
  pre?: string;
  test?: string;
  colId?: string;
}

export interface Folder { id: string; name: string; items: Node[] }
export type Node = Folder | ApiRequest;
export const isFolder = (n: Node): n is Folder => 'items' in n;

export interface Collection { id: string; name: string; vars: Record<string, string>; items: Node[] }
export interface Env { id: string; name: string; vars: Row[] }

export type Imported = { kind: 'collection'; col: Collection; count: number } | { kind: 'env'; env: Env };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;
let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const script = (events: Json, listen: string): string => {
  const e = (Array.isArray(events) ? events : []).find((x: Json) => x.listen === listen && x.script && !x.disabled);
  const exec = e?.script?.exec;
  return Array.isArray(exec) ? exec.join('\n') : typeof exec === 'string' ? exec : '';
};
// each script gets its own scope so two `const x` in collection and request scripts don't clash
const wrap = (s: string) => `(function () {\n${s}\n})();`;
const join = (inherited: string, own: string) => [inherited, own.trim() ? wrap(own) : ''].filter(Boolean).join('\n');

const kv = (list: Json, key: string): string => {
  if (Array.isArray(list)) return String(list.find((x: Json) => x.key === key)?.value ?? '');
  return String(list?.[key] ?? '');
};

interface Auth { kind: AuthKind; token: string; user: string; pass: string; header?: Row; param?: Row }
const NONE: Auth = { kind: 'none', token: '', user: '', pass: '' };

function parseAuth(a: Json): Auth | undefined {
  if (!a || !a.type) return undefined;
  switch (a.type) {
    case 'noauth': return NONE;
    case 'bearer': return { ...NONE, kind: 'bearer', token: kv(a.bearer, 'token') };
    case 'basic': return { ...NONE, kind: 'basic', user: kv(a.basic, 'username'), pass: kv(a.basic, 'password') };
    case 'apikey': {
      const row = { key: kv(a.apikey, 'key'), value: kv(a.apikey, 'value'), on: true };
      return kv(a.apikey, 'in') === 'query' ? { ...NONE, param: row } : { ...NONE, header: row };
    }
    default: return undefined; // oauth etc: not supported, falls back to inherited/none
  }
}

const rows = (list: Json): Row[] =>
  (Array.isArray(list) ? list : []).filter((r: Json) => r && r.key != null && r.type !== 'file').map((r: Json) => ({ key: String(r.key), value: String(r.value ?? ''), on: !r.disabled }));

interface Ctx { colId: string; auth?: Auth; pre: string; test: string; count: number }

function toRequest(item: Json, ctx: Ctx): ApiRequest {
  const r = typeof item.request === 'string' ? { method: 'GET', url: item.request } : item.request || {};
  const auth = parseAuth(r.auth) ?? ctx.auth ?? NONE;

  // url: keep the raw text before "?" and move the query into param rows
  const rawUrl: string = typeof r.url === 'string' ? r.url : r.url?.raw ?? '';
  const q = rawUrl.indexOf('?');
  const base = q < 0 ? rawUrl : rawUrl.slice(0, q);
  let params = Array.isArray(r.url?.query)
    ? rows(r.url.query)
    : q < 0 ? [] : rawUrl.slice(q + 1).split('&').filter(Boolean).map((p) => {
      const i = p.indexOf('=');
      return { key: i < 0 ? p : p.slice(0, i), value: i < 0 ? '' : p.slice(i + 1), on: true };
    });
  const headers = rows(r.header);
  if (auth.param) params = [...params, auth.param];
  if (auth.header) headers.push(auth.header);

  let bodyKind: BodyKind = 'none';
  let body = '';
  const b = r.body;
  if (b?.mode === 'raw') {
    body = b.raw ?? '';
    bodyKind = b.options?.raw?.language === 'json' || /^\s*[{[]/.test(body) ? 'json' : 'text';
  } else if (b?.mode === 'urlencoded' || b?.mode === 'formdata') {
    // formdata is sent urlencoded: no file uploads here
    body = rows(b[b.mode]).filter((x) => x.on).map((x) => `${encodeURIComponent(x.key)}=${encodeURIComponent(x.value)}`).join('&');
    bodyKind = 'text';
    if (body && !headers.some((h) => h.key.toLowerCase() === 'content-type')) headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded', on: true });
  } else if (b?.mode === 'graphql') {
    let variables: unknown = {};
    try { variables = JSON.parse(b.graphql?.variables || '{}'); } catch { /* keep {} */ }
    body = JSON.stringify({ query: b.graphql?.query ?? '', variables }, null, 2);
    bodyKind = 'json';
  }
  if (body.trim() === '') bodyKind = 'none';

  ctx.count++;
  return {
    id: uid(),
    name: item.name || `${r.method || 'GET'} ${base}`,
    method: String(r.method || 'GET').toUpperCase(),
    url: base,
    params: [...params, { key: '', value: '', on: true }],
    headers: [...headers, { key: '', value: '', on: true }],
    bodyKind,
    body,
    authKind: auth.kind,
    token: auth.token,
    user: auth.user,
    pass: auth.pass,
    allowInsecure: false,
    pre: join(ctx.pre, script(item.event, 'prerequest')),
    test: join(ctx.test, script(item.event, 'test')),
    colId: ctx.colId,
  };
}

function walk(items: Json[], ctx: Ctx): Node[] {
  return (items || []).map((it): Node => {
    if (!Array.isArray(it.item)) return toRequest(it, ctx);
    const sub: Ctx = {
      ...ctx,
      auth: parseAuth(it.auth) ?? ctx.auth,
      pre: join(ctx.pre, script(it.event, 'prerequest')),
      test: join(ctx.test, script(it.event, 'test')),
    };
    return { id: uid(), name: it.name || 'Folder', items: walk(it.item, sub) };
  });
}

export function parseImport(text: string): Imported {
  let j: Json;
  try { j = JSON.parse(text); } catch { throw new Error('This is not a JSON file.'); }
  if (Array.isArray(j?.values)) {
    return {
      kind: 'env',
      env: { id: uid(), name: j.name || 'Environment', vars: [...j.values.filter((v: Json) => v?.key).map((v: Json) => ({ key: String(v.key), value: String(v.value ?? ''), on: v.enabled !== false })), { key: '', value: '', on: true }] },
    };
  }
  if (j?.info && Array.isArray(j.item)) {
    const id = uid();
    const ctx: Ctx = { colId: id, auth: parseAuth(j.auth), pre: join('', script(j.event, 'prerequest')), test: join('', script(j.event, 'test')), count: 0 };
    const items = walk(j.item, ctx);
    const vars: Record<string, string> = {};
    (j.variable || []).forEach((v: Json) => { if (v.key) vars[v.key] = String(v.value ?? ''); });
    return { kind: 'collection', col: { id, name: j.info.name || 'Collection', vars, items }, count: ctx.count };
  }
  throw new Error('Not a Postman collection or environment file.');
}

export function flatten(items: Node[]): ApiRequest[] {
  return items.flatMap((n) => (isFolder(n) ? flatten(n.items) : [n]));
}

/* ---------- export (Postman v2.1 / environment) ---------- */
const evt = (listen: string, code: string) => (code.trim() ? [{ listen, script: { type: 'text/javascript', exec: code.split('\n') } }] : []);
const kvs = (rs: Row[]) => rs.filter((r) => r.key.trim()).map((r) => ({ key: r.key, value: r.value, ...(r.on ? {} : { disabled: true }) }));

function exportRequest(r: ApiRequest): Json {
  const on = r.params.filter((p) => p.on && p.key.trim());
  const auth =
    r.authKind === 'bearer' ? { type: 'bearer', bearer: [{ key: 'token', value: r.token, type: 'string' }] }
      : r.authKind === 'basic' ? { type: 'basic', basic: [{ key: 'username', value: r.user, type: 'string' }, { key: 'password', value: r.pass, type: 'string' }] }
        : { type: 'noauth' };
  return {
    name: r.name,
    event: [...evt('prerequest', r.pre || ''), ...evt('test', r.test || '')],
    request: {
      method: r.method,
      header: kvs(r.headers),
      url: { raw: r.url + (on.length ? `?${on.map((p) => `${p.key}=${p.value}`).join('&')}` : ''), query: kvs(r.params) },
      auth,
      ...(r.bodyKind === 'none' ? {} : { body: { mode: 'raw', raw: r.body, options: { raw: { language: r.bodyKind === 'json' ? 'json' : 'text' } } } }),
    },
  };
}

const exportNodes = (items: Node[]): Json[] => items.map((n) => (isFolder(n) ? { name: n.name, item: exportNodes(n.items) } : exportRequest(n)));

export const exportCollection = (c: Collection): Json => ({
  info: { name: c.name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: exportNodes(c.items),
  variable: Object.entries(c.vars).map(([key, value]) => ({ key, value })),
});

export const exportEnv = (e: Env): Json => ({
  id: e.id,
  name: e.name,
  values: e.vars.filter((v) => v.key.trim()).map((v) => ({ key: v.key, value: v.value, type: 'default', enabled: v.on })),
  _postman_variable_scope: 'environment',
});

export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, '_')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
