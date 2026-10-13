import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, RefreshCw, Search, Clock } from 'lucide-react';
import type { ServerConnection, ProxySettings } from '../types';
import { fuzzyMatch } from '../utils/fuzzyMatch';

/** Window event that opens quick open (the File menu sends it). */
export const QUICK_OPEN_EVENT = 'serop-quick-open';

const MAX_RESULTS = 60;
const STALE_MS = 2 * 60 * 1000;
const fileCache = new Map<string, { files: string[]; truncated: boolean; at: number }>();

const recentKey = (serverId: string) => `serop-recent-files:${serverId}`;
function readRecent(serverId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(recentKey(serverId)) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function pushRecent(serverId: string, path: string) {
  try {
    const next = [path, ...readRecent(serverId).filter((p) => p !== path)].slice(0, 12);
    localStorage.setItem(recentKey(serverId), JSON.stringify(next));
  } catch { /* storage unavailable */ }
}

function Highlighted({ text, positions, offset }: { text: string; positions: number[]; offset: number }) {
  const set = new Set(positions.map((p) => p - offset));
  return (
    <>
      {[...text].map((ch, i) => (set.has(i) ? <mark key={i} className="bg-transparent text-accent font-semibold">{ch}</mark> : <span key={i}>{ch}</span>))}
    </>
  );
}

/**
 * Cmd/Ctrl+P: type part of a file name and open any file under the server's project folder.
 * The file list is fetched once and reused for a couple of minutes; matching runs locally.
 */
export function QuickOpen({ server, proxy, onOpen }: { server: ServerConnection; proxy: ProxySettings; onOpen: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const isMac = window.serverOperator?.platform === 'darwin' || /Mac/.test(navigator.platform);

  const load = async (force = false) => {
    const cached = fileCache.get(server.id);
    if (cached && !force) {
      setFiles(cached.files);
      setTruncated(cached.truncated);
      if (Date.now() - cached.at < STALE_MS) return;
    }
    if (!window.serverOperator?.findFiles) {
      setError('Quick open needs the desktop app.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await window.serverOperator.findFiles({ connection: server, proxy });
      if (!res.ok) throw new Error(res.error || 'Could not list files');
      const entry = { files: res.files ?? [], truncated: !!res.truncated, at: Date.now() };
      fileCache.set(server.id, entry);
      setFiles(entry.files);
      setTruncated(entry.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Shortcut and menu event
  useEffect(() => {
    const show = () => {
      setOpen(true);
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'p') return;
      // Ctrl+P is "previous command" in a shell, so leave it to the terminal off macOS.
      if (!isMac && (e.target as HTMLElement | null)?.closest?.('.xterm')) return;
      e.preventDefault();
      e.stopPropagation();
      show();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener(QUICK_OPEN_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener(QUICK_OPEN_EVENT, show);
    };
  }, [isMac]);

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, server.id]);

  const results = useMemo(() => {
    if (!query.trim()) {
      const known = new Set(files);
      return readRecent(server.id)
        .filter((p) => known.size === 0 || known.has(p))
        .map((path) => ({ path, positions: [] as number[], recent: true }));
    }
    const scored: { path: string; positions: number[]; score: number; recent: boolean }[] = [];
    for (const path of files) {
      const m = fuzzyMatch(query, path);
      if (m) scored.push({ path, positions: m.positions, score: m.score, recent: false });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, files, server.id, open]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (path: string) => {
    pushRecent(server.id, path);
    setOpen(false);
    onOpen(path);
  };

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100000] flex justify-center bg-black/30 pt-[12vh] px-4" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div
        role="dialog"
        aria-label="Go to file"
        className="w-full max-w-xl h-fit max-h-[60vh] flex flex-col rounded-xl border border-border/50 popover-surface shadow-2xl overflow-hidden"
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active].path); }
        }}
      >
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/30">
          <Search size={14} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Go to file on ${server.name}`}
            aria-label="File name"
            aria-controls="quick-open-results"
            aria-activedescendant={results[active] ? `quick-open-${active}` : undefined}
            className="flex-1 min-w-0 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none"
          />
          {loading ? (
            <Loader2 size={14} className="animate-spin text-text-muted shrink-0" aria-label="Loading file list" />
          ) : (
            <button type="button" onClick={() => void load(true)} title="Reload the file list" aria-label="Reload the file list" className="p-1 rounded-md text-text-muted hover:text-text-primary cursor-pointer">
              <RefreshCw size={13} />
            </button>
          )}
        </div>
        {error ? (
          <p className="px-4 py-6 text-xs text-error text-center">{error}</p>
        ) : (
          <ul ref={listRef} id="quick-open-results" role="listbox" className="flex-1 overflow-y-auto py-1">
            {!query.trim() && results.length > 0 && (
              <li className="px-3.5 pt-1.5 pb-1 text-[11px] font-semibold text-text-muted" role="presentation">Recently opened</li>
            )}
            {results.map((r, i) => {
              const slash = r.path.lastIndexOf('/');
              const name = r.path.slice(slash + 1);
              const dir = slash >= 0 ? r.path.slice(0, slash) : '';
              return (
                <li
                  key={r.path}
                  id={`quick-open-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(r.path)}
                  className={`flex items-center gap-2.5 mx-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer ${i === active ? 'bg-accent/15' : ''}`}
                >
                  {r.recent ? <Clock size={13} className="text-text-muted shrink-0" /> : <FileText size={13} className="text-text-muted shrink-0" />}
                  <span className="text-xs text-text-primary truncate shrink-0 max-w-[55%]">
                    <Highlighted text={name} positions={r.positions} offset={slash + 1} />
                  </span>
                  <span className="text-[11px] text-text-muted font-mono truncate min-w-0">
                    <Highlighted text={dir} positions={r.positions} offset={0} />
                  </span>
                </li>
              );
            })}
            {query.trim() && !loading && results.length === 0 && (
              <li className="px-4 py-6 text-xs text-text-muted text-center">No files match “{query}”.</li>
            )}
            {!query.trim() && results.length === 0 && !loading && (
              <li className="px-4 py-6 text-xs text-text-muted text-center">
                Start typing a file name. {files.length > 0 && `${files.length.toLocaleString()} files in ${server.name}.`}
              </li>
            )}
          </ul>
        )}
        {truncated && (
          <p className="px-3.5 py-1.5 border-t border-border/30 text-[11px] text-text-muted">
            Showing the first {files.length.toLocaleString()} files. Big folders such as node_modules are skipped.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
