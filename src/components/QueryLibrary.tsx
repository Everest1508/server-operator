import { useEffect, useRef, useState, type ReactNode } from 'react';
import { History, Bookmark, BookmarkPlus, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { FloatingMenu } from './FloatingMenu';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

// Query history and saved queries, per server + database, kept in localStorage.

export interface HistoryEntry {
  query: string;
  at: number;
  ok: boolean;
  rows?: number;
  ms?: number;
  error?: string;
}
export interface SavedQuery {
  name: string;
  query: string;
  at: number;
}

const MAX_HISTORY = 50;
const historyKey = (scope: string) => `serop-db-history:${scope}`;
const savedKey = (scope: string) => `serop-db-saved:${scope}`;

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** Add a run to the history. Running the same query again moves it to the top. */
export function recordQueryHistory(scope: string, entry: HistoryEntry) {
  const q = entry.query.trim();
  if (!q) return;
  write(historyKey(scope), [{ ...entry, query: q }, ...read<HistoryEntry>(historyKey(scope)).filter((h) => h.query !== q)].slice(0, MAX_HISTORY));
  window.dispatchEvent(new Event('serop-query-history'));
}

function timeAgo(at: number) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Popover({ label, icon, title, children, wide = false }: { label: string; icon: ReactNode; title: string; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
          open ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
        }`}
      >
        {icon}
        {label}
      </button>
      {open && (
        <FloatingMenu anchorRef={anchorRef} align="left" className={`${wide ? 'w-[420px]' : 'w-[300px]'} max-w-[calc(100vw-1rem)] rounded-xl border border-border/40 popover-surface shadow-2xl overflow-hidden`}>
          {children(() => setOpen(false))}
        </FloatingMenu>
      )}
    </div>
  );
}

export function QueryLibrary({ scope, currentQuery, onLoad }: { scope: string; currentQuery: string; onLoad: (query: string) => void }) {
  const [history, setHistory] = useState<HistoryEntry[]>(() => read(historyKey(scope)));
  const [saved, setSaved] = useState<SavedQuery[]>(() => read(savedKey(scope)));
  const [name, setName] = useState('');

  useEffect(() => {
    const refresh = () => setHistory(read(historyKey(scope)));
    refresh();
    setSaved(read(savedKey(scope)));
    window.addEventListener('serop-query-history', refresh);
    return () => window.removeEventListener('serop-query-history', refresh);
  }, [scope]);

  const saveQuery = (close: () => void) => {
    const n = name.trim();
    const q = currentQuery.trim();
    if (!n || !q) return;
    const next = [{ name: n, query: q, at: Date.now() }, ...saved.filter((s) => s.name !== n)];
    setSaved(next);
    write(savedKey(scope), next);
    setName('');
    close();
  };
  const removeSaved = (n: string) => {
    const next = saved.filter((s) => s.name !== n);
    setSaved(next);
    write(savedKey(scope), next);
  };

  return (
    <div className="flex items-center gap-1">
      <Popover label="History" icon={<History size={12} />} title="Queries you ran on this database" wide>
        {(close) =>
          history.length === 0 ? (
            <p className="px-4 py-6 text-xs text-text-muted text-center">Queries you run here are listed here.</p>
          ) : (
            <ul className="max-h-[55vh] overflow-y-auto py-1" aria-label="Query history">
              {history.map((h) => (
                <li key={h.query}>
                  <button
                    type="button"
                    onClick={() => { onLoad(h.query); close(); }}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-bg-tertiary/50 cursor-pointer"
                    title={h.error || 'Put this query in the editor'}
                  >
                    {h.ok ? <CheckCircle2 size={12} className="text-success shrink-0 mt-0.5" /> : <XCircle size={12} className="text-error shrink-0 mt-0.5" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11px] text-text-primary line-clamp-2 break-all">{h.query}</span>
                      <span className="block text-[10px] text-text-muted mt-0.5">
                        {timeAgo(h.at)}
                        {h.ok && h.rows != null && ` · ${h.rows} row${h.rows === 1 ? '' : 's'}`}
                        {h.ms != null && ` · ${h.ms} ms`}
                        {!h.ok && ' · failed'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Popover>

      <Popover label="Saved" icon={<Bookmark size={12} />} title="Saved queries for this database">
        {(close) => (
          <div>
            <form
              onSubmit={(e) => { e.preventDefault(); saveQuery(close); }}
              className="flex items-center gap-1.5 p-2 border-b border-border/30"
            >
              <Input size="sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder={currentQuery.trim() ? 'Name this query' : 'Write a query first'}
                disabled={!currentQuery.trim()}
                aria-label="Saved query name" className="flex-1 min-w-0"
              />
              <Button size="sm"
                type="submit"
                disabled={!name.trim() || !currentQuery.trim()}
              >
                <BookmarkPlus size={12} /> Save
              </Button>
            </form>
            {saved.length === 0 ? (
              <p className="px-4 py-5 text-xs text-text-muted text-center">No saved queries yet.</p>
            ) : (
              <ul className="max-h-[50vh] overflow-y-auto py-1" aria-label="Saved queries">
                {saved.map((s) => (
                  <li key={s.name} className="group flex items-start">
                    <button
                      type="button"
                      onClick={() => { onLoad(s.query); close(); }}
                      className="flex-1 min-w-0 px-3 py-2 text-left hover:bg-bg-tertiary/50 cursor-pointer"
                      title="Put this query in the editor"
                    >
                      <span className="block text-xs font-semibold text-text-primary truncate">{s.name}</span>
                      <span className="block font-mono text-[10px] text-text-muted truncate mt-0.5">{s.query}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeSaved(s.name); }}
                      aria-label={`Delete saved query ${s.name}`}
                      className="p-2 mt-1 mr-1 rounded-md text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-error cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Popover>
    </div>
  );
}
