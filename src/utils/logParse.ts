// Log line understanding: level detection, token highlighting (status codes, IDs, IPs, timestamps) and stack-trace grouping.
export type Level = 'error' | 'warn' | 'info' | 'debug';

const STATUS_RE = /"\s+([1-5]\d\d)\s|\bstatus(?:[ _]?code)?["']?\s*[=:]\s*["']?([1-5]\d\d)\b|\bHTTP\/\d(?:\.\d)?"?\s+([1-5]\d\d)\b/gi;

export function statusOf(line: string): number | null {
  STATUS_RE.lastIndex = 0;
  const m = STATUS_RE.exec(line);
  return m ? Number(m[1] || m[2] || m[3]) : null;
}

export function levelOf(line: string): Level {
  if (/\b(FATAL|CRITICAL|EMERG(?:ENCY)?|ALERT|PANIC|ERROR|ERR|SEVERE)\b|\bException\b|Traceback \(most recent|\bUnhandled|\bfailed\b|\[emerg\]|\[crit\]|\[error\]/i.test(line)) return 'error';
  const st = statusOf(line);
  if (st && st >= 500) return 'error';
  if (/\b(WARN(?:ING)?|DEPRECATED)\b|\[warn\]/i.test(line) || (st && st >= 400)) return 'warn';
  if (/\b(DEBUG|TRACE|VERBOSE)\b/i.test(line)) return 'debug';
  return 'info';
}

/** A line that belongs to the entry above it (stack frames, "Caused by", wrapped JSON). */
export const isContinuation = (line: string) => /^(\s+\S|Caused by|\.\.\. \d+ more)/.test(line);

export interface Entry {
  id: number;
  src: string;
  text: string;
  extra: string[];
  level: Level;
}

export interface Seg { text: string; cls?: string; follow?: string }

// token regexes, tried in this order at every position; `follow` ones are clickable ("trace this")
const TOKENS: { re: RegExp; cls: string; follow?: boolean }[] = [
  { re: /\b\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?/g, cls: 'text-text-muted' },
  { re: /\b(?:FATAL|CRITICAL|EMERG|PANIC|ERROR|SEVERE)\b|\[(?:emerg|crit|error)\]/gi, cls: 'text-error font-bold' },
  { re: /\bWARN(?:ING)?\b|\[warn\]/gi, cls: 'text-warning font-bold' },
  { re: /\b(?:INFO|NOTICE)\b|\[(?:notice|info)\]/gi, cls: 'text-accent' },
  { re: /\b(?:DEBUG|TRACE)\b/gi, cls: 'text-text-muted' },
  { re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, cls: 'text-accent underline decoration-dotted', follow: true },
  { re: /\b(?:request[_-]?id|req[_-]?id|trace[_-]?id|order[_-]?id|user[_-]?id|session)["']?\s*[=:]\s*["']?([\w-]{4,})/gi, cls: 'text-accent underline decoration-dotted', follow: true },
  { re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, cls: 'text-text-secondary underline decoration-dotted', follow: true },
];

const statusCls = (n: number) => (n >= 500 ? 'bg-error/20 text-error font-bold' : n >= 400 ? 'bg-warning/20 text-warning font-bold' : n >= 300 ? 'text-text-secondary' : 'text-success');

interface Range { s: number; e: number; cls: string; follow?: string }

export function segments(line: string, search?: RegExp | null): Seg[] {
  const ranges: Range[] = [];
  for (const t of TOKENS) {
    t.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = t.re.exec(line))) {
      // for "key=value" tokens only the value is the thing to follow
      const val = m[1] ?? m[0];
      const s = m[1] ? m.index + m[0].lastIndexOf(m[1]) : m.index;
      ranges.push({ s, e: s + val.length, cls: t.cls, follow: t.follow ? val : undefined });
      if (m[0].length === 0) t.re.lastIndex++;
    }
  }
  STATUS_RE.lastIndex = 0;
  const sm = STATUS_RE.exec(line);
  if (sm) {
    const val = sm[1] || sm[2] || sm[3];
    const s = sm.index + sm[0].lastIndexOf(val);
    ranges.push({ s, e: s + val.length, cls: statusCls(Number(val)) });
  }
  if (search) {
    search.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = search.exec(line)) && m[0]) ranges.push({ s: m.index, e: m.index + m[0].length, cls: 'bg-warning/50 text-text-primary rounded-sm' });
  }
  const cuts = [...new Set([0, line.length, ...ranges.flatMap((r) => [r.s, r.e])])].sort((a, b) => a - b);
  const out: Seg[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    const cover = ranges.filter((r) => r.s <= a && r.e >= b);
    out.push({
      text: line.slice(a, b),
      cls: cover.map((r) => r.cls).join(' ') || undefined,
      follow: cover.find((r) => r.follow)?.follow,
    });
  }
  return out;
}
