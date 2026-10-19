// Turns a pasted `curl ...` command into the fields of an API request. Handles the flags people copy from browser devtools and API docs.
export interface ParsedCurl {
  method: string;
  url: string;
  headers: { key: string; value: string }[];
  body: string;
  insecure: boolean;
}

export const looksLikeCurl = (s: string) => /^\s*curl(\s|$)/i.test(s);

function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let has = false;
  let quote: '"' | "'" | null = null;
  const s = input.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' '); // line continuations (bash and cmd)
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote === "'") {
      if (c === "'") quote = null; else cur += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) cur += s[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === '$' && s[i + 1] === "'") { // $'...' from Chrome "copy as cURL"
      i++;
      i++;
      while (i < s.length && s[i] !== "'") {
        if (s[i] === '\\' && i + 1 < s.length) {
          const n = s[++i];
          cur += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
        } else cur += s[i];
        i++;
      }
      has = true;
    } else if (/\s/.test(c)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i];
    } else cur += c;
  }
  if (cur || has) out.push(cur);
  return out;
}

export function parseCurl(input: string): ParsedCurl | null {
  const t = tokenize(input);
  if (!t.length || t[0].toLowerCase() !== 'curl') return null;
  const r: ParsedCurl = { method: '', url: '', headers: [], body: '', insecure: false };
  const data: string[] = [];
  for (let i = 1; i < t.length; i++) {
    const a = t[i];
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const flag = eq > 0 ? a.slice(0, eq) : a;
    const val = () => (eq > 0 ? a.slice(eq + 1) : t[++i] ?? '');
    switch (flag) {
      case '-X': case '--request': r.method = val().toUpperCase(); break;
      case '-H': case '--header': {
        const h = val();
        const k = h.indexOf(':');
        if (k > 0) r.headers.push({ key: h.slice(0, k).trim(), value: h.slice(k + 1).trim() });
        break;
      }
      case '-d': case '--data': case '--data-raw': case '--data-binary': case '--data-ascii': case '--data-urlencode': data.push(val()); break;
      case '-u': case '--user': {
        const u = val();
        r.headers.push({ key: 'Authorization', value: `Basic ${btoa(u)}` });
        break;
      }
      case '-b': case '--cookie': r.headers.push({ key: 'Cookie', value: val() }); break;
      case '-A': case '--user-agent': r.headers.push({ key: 'User-Agent', value: val() }); break;
      case '-e': case '--referer': r.headers.push({ key: 'Referer', value: val() }); break;
      case '-k': case '--insecure': r.insecure = true; break;
      case '-I': case '--head': r.method = r.method || 'HEAD'; break;
      case '--url': r.url = val(); break;
      default:
        if (!a.startsWith('-') && !r.url) r.url = a;
      // other flags (-s, -L, --compressed, -v ...) don't change the request, ignore them
    }
  }
  if (!r.url) return null;
  r.body = data.join('&');
  if (!r.method) r.method = r.body ? 'POST' : 'GET';
  return r;
}
