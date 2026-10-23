import { useCallback, useEffect, useState } from 'react';
import { GitBranch, RefreshCw, Loader2, Download, ArrowDownToLine, Archive, Undo2, GitCommitHorizontal, FileDiff, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ServerConnection, ProxySettings } from '../types';
import { confirmDialog } from '../utils/confirm';
import { Input } from './ui/Input';

type Status = NonNullable<Awaited<ReturnType<NonNullable<NonNullable<typeof window.serverOperator>['gitStatus']>>>>;
type ChangedFile = { code: string; path: string; untracked: boolean };

const CODE_STYLE: Record<string, { letter: string; className: string; label: string }> = {
  M: { letter: 'M', className: 'text-warning', label: 'Modified' },
  A: { letter: 'A', className: 'text-success', label: 'Added' },
  D: { letter: 'D', className: 'text-error', label: 'Deleted' },
  R: { letter: 'R', className: 'text-accent', label: 'Renamed' },
  C: { letter: 'C', className: 'text-accent', label: 'Copied' },
  U: { letter: '!', className: 'text-error', label: 'Conflict' },
  '?': { letter: 'U', className: 'text-success', label: 'Untracked' },
};
function codeStyle(code: string) {
  const c = code === '??' ? '?' : (code.trim()[0] || 'M');
  return CODE_STYLE[c] ?? CODE_STYLE.M;
}

function DiffView({ text }: { text: string }) {
  return (
    <pre className="font-mono text-[11.5px] leading-[1.55] whitespace-pre select-text">
      {text.split('\n').map((line, i) => {
        let cls = 'text-text-secondary';
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-success bg-success/8';
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-error bg-error/8';
        else if (line.startsWith('@@')) cls = 'text-accent';
        else if (/^(diff --git|index |\+\+\+|---|new file|deleted file|commit |Author:|Date:)/.test(line)) cls = 'text-text-primary font-semibold';
        return (
          <div key={i} className={`px-3 ${cls}`}>
            {line || ' '}
          </div>
        );
      })}
    </pre>
  );
}

/**
 * What the server's checkout looks like: branch and upstream, uncommitted changes with their diffs, and recent
 * commits. Offers fetch, fast-forward pull, stash and per-file discard; risky ones are confirmed first
 * (on a production server the confirm asks for its name).
 */
export function GitPanel({ currentServer, proxy, defaultDir }: { currentServer: ServerConnection; proxy: ProxySettings; defaultDir: string }) {
  const [dir, setDir] = useState(defaultDir);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<{ kind: 'file'; file: ChangedFile } | { kind: 'commit'; hash: string; subject: string } | null>(null);
  const [diff, setDiff] = useState<{ text: string; truncated: boolean } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const api = window.serverOperator;
  const proxyOpt = proxy?.enabled ? proxy : undefined;

  useEffect(() => setDir(defaultDir), [defaultDir, currentServer.id]);

  const refresh = useCallback(async () => {
    if (!api?.gitStatus) return;
    setLoading(true);
    try {
      const res = await api.gitStatus({ connection: currentServer, proxy: proxyOpt, dir });
      setStatus(res);
      if (!res.ok) setNotice({ ok: false, text: res.error || 'Could not read git status' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentServer.id, dir, proxy?.enabled]);

  useEffect(() => {
    setSelected(null);
    setDiff(null);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentServer.id, dir]);

  const showDiff = async (sel: NonNullable<typeof selected>) => {
    if (!api?.gitDiff) return;
    setSelected(sel);
    setDiffLoading(true);
    setDiff(null);
    try {
      const res = await api.gitDiff(
        sel.kind === 'file'
          ? { connection: currentServer, proxy: proxyOpt, dir, file: sel.file.path, untracked: sel.file.untracked }
          : { connection: currentServer, proxy: proxyOpt, dir, commit: sel.hash },
      );
      setDiff(res.ok ? { text: res.diff || '(no changes)', truncated: !!res.truncated } : { text: res.error || 'Could not load the diff', truncated: false });
    } finally {
      setDiffLoading(false);
    }
  };

  const run = async (action: 'fetch' | 'pull' | 'stash' | 'discard', file?: ChangedFile) => {
    if (!api?.gitAction || !status?.isRepo) return;
    const where = `${dir || 'the project folder'} on ${currentServer.name}`;
    const prod = !!currentServer.production;
    // this panel's own server, so a production server always asks for its name
    const server = { name: currentServer.name, production: currentServer.production };
    if (action === 'pull' && !(await confirmDialog(
      `Pull ${status.upstream || 'the upstream branch'} into ${where}?\n\nOnly a fast-forward is applied. If the branches have split, nothing changes.`,
      { title: 'Pull', confirmLabel: 'Pull', danger: prod, server },
    ))) return;
    if (action === 'stash' && !(await confirmDialog(
      `Stash all ${status.files?.length ?? 0} uncommitted changes in ${where}?\n\nThey are put aside, not deleted. Bring them back with "git stash pop".`,
      { title: 'Stash changes', confirmLabel: 'Stash', danger: prod, server },
    ))) return;
    if (action === 'discard' && file && !(await confirmDialog(
      file.untracked
        ? `Delete the new file ${file.path} in ${where}?\n\nIt has never been committed, so it cannot be brought back.`
        : `Throw away the changes to ${file.path} in ${where}?\n\nThe file goes back to the last commit. This cannot be undone.`,
      { title: file.untracked ? 'Delete file' : 'Discard changes', confirmLabel: file.untracked ? 'Delete' : 'Discard', server },
    ))) return;

    setBusy(file ? `${action}:${file.path}` : action);
    setNotice(null);
    try {
      const res = await api.gitAction({ connection: currentServer, proxy: proxyOpt, dir, action, file: file?.path, untracked: file?.untracked });
      const label = { fetch: 'Fetched', pull: 'Pulled', stash: 'Stashed the changes', discard: file?.untracked ? `Deleted ${file?.path}` : `Discarded changes to ${file?.path}` }[action];
      setNotice(res.ok ? { ok: true, text: res.output ? `${label}. ${res.output.split('\n').slice(-2).join(' ')}` : `${label}.` } : { ok: false, text: res.error || 'git failed' });
      if (action === 'discard' && selected?.kind === 'file' && selected.file.path === file?.path) { setSelected(null); setDiff(null); }
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  if (!api?.gitStatus) {
    return <div className="flex-1 flex items-center justify-center text-xs text-text-muted">The Git panel needs the desktop app.</div>;
  }

  const files = status?.files ?? [];
  const commits = status?.commits ?? [];
  const btn = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border/30 text-xs font-semibold text-text-primary hover:bg-bg-tertiary/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* folder + branch + actions */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border/20 shrink-0">
        <form
          className="flex items-center gap-1.5 min-w-0"
          onSubmit={(e) => { e.preventDefault(); void refresh(); }}
        >
          <Input size="sm"
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="Project folder on the server"
            aria-label="Project folder" className="w-64 max-w-full font-mono"
          />
          <button type="submit" className={btn} disabled={loading} title="Reload status">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            <span className="sr-only">Reload status</span>
          </button>
        </form>
        {status?.isRepo && (
          <>
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-bg-tertiary/50 text-xs font-semibold text-text-primary font-mono">
              <GitBranch size={13} className="text-accent" />
              {status.branch}
            </span>
            <span className="text-[11px] text-text-secondary">
              {status.upstream
                ? [
                    status.upstream,
                    status.behind ? `${status.behind} behind` : null,
                    status.ahead ? `${status.ahead} ahead` : null,
                    !status.behind && !status.ahead ? 'up to date (as of the last fetch)' : null,
                  ].filter(Boolean).join(' · ')
                : 'No upstream branch'}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" className={btn} disabled={!!busy} onClick={() => void run('fetch')} title="Download the latest commits without changing files">
                {busy === 'fetch' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Fetch
              </button>
              <button type="button" className={btn} disabled={!!busy || !status.upstream} onClick={() => void run('pull')} title="Fast-forward to the upstream branch">
                {busy === 'pull' ? <Loader2 size={13} className="animate-spin" /> : <ArrowDownToLine size={13} />} Pull
              </button>
              <button type="button" className={btn} disabled={!!busy || files.length === 0} onClick={() => void run('stash')} title="Put all uncommitted changes aside">
                {busy === 'stash' ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />} Stash
              </button>
            </div>
          </>
        )}
      </div>

      {notice && (
        <div role="status" className={`flex items-start gap-2 px-4 py-2 text-xs border-b shrink-0 select-text ${notice.ok ? 'bg-success/8 border-success/20 text-text-primary' : 'bg-error/8 border-error/20 text-error'}`}>
          {notice.ok ? <CheckCircle2 size={13} className="text-success shrink-0 mt-0.5" /> : <AlertTriangle size={13} className="shrink-0 mt-0.5" />}
          <span className="break-words min-w-0">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-auto shrink-0 text-text-muted hover:text-text-primary cursor-pointer">Dismiss</button>
        </div>
      )}

      {loading && !status ? (
        <div className="flex-1 flex items-center justify-center gap-2 text-xs text-text-secondary"><Loader2 size={16} className="animate-spin text-accent" /> Reading git status…</div>
      ) : status && !status.isRepo ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <GitBranch size={22} className="text-text-muted" />
          <p className="text-sm font-semibold text-text-primary">Not a git repository</p>
          <p className="text-xs text-text-secondary max-w-sm">
            {status.reason || `${dir || 'This folder'} on ${currentServer.name} is not inside a git checkout. Enter the project folder above.`}
          </p>
        </div>
      ) : status?.isRepo ? (
        <div className="flex-1 flex min-h-0">
          {/* left: changes + commits */}
          <div className="w-80 max-w-[45%] shrink-0 border-r border-border/20 flex flex-col min-h-0 overflow-y-auto">
            <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold text-text-secondary">
              Changes <span className="font-normal text-text-muted">{files.length}</span>
            </p>
            {files.length === 0 ? (
              <p className="px-4 pb-3 text-xs text-text-muted">No uncommitted changes. The server matches its last commit.</p>
            ) : (
              <ul className="px-2 pb-2">
                {files.map((f) => {
                  const st = codeStyle(f.code);
                  const isSel = selected?.kind === 'file' && selected.file.path === f.path;
                  return (
                    <li key={f.path} className={`group flex items-center rounded-lg ${isSel ? 'bg-accent/12' : 'hover:bg-bg-tertiary/40'}`}>
                      <button
                        type="button"
                        onClick={() => void showDiff({ kind: 'file', file: f })}
                        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left cursor-pointer"
                        title={`${st.label}: ${f.path}`}
                      >
                        <span className={`w-3 shrink-0 text-center font-mono text-[11px] font-bold ${st.className}`} aria-label={st.label}>{st.letter}</span>
                        <span className="min-w-0 truncate text-xs text-text-primary font-mono">{f.path}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void run('discard', f)}
                        disabled={!!busy}
                        aria-label={f.untracked ? `Delete ${f.path}` : `Discard changes to ${f.path}`}
                        title={f.untracked ? 'Delete this new file' : 'Discard changes'}
                        className="p-1.5 mr-1 rounded-md text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-error cursor-pointer disabled:opacity-30"
                      >
                        {busy === `discard:${f.path}` ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold text-text-secondary border-t border-border/20">Recent commits</p>
            <ul className="px-2 pb-3">
              {commits.map((c) => {
                const isSel = selected?.kind === 'commit' && selected.hash === c.hash;
                return (
                  <li key={c.hash}>
                    <button
                      type="button"
                      onClick={() => void showDiff({ kind: 'commit', hash: c.hash, subject: c.subject })}
                      className={`w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left cursor-pointer ${isSel ? 'bg-accent/12' : 'hover:bg-bg-tertiary/40'}`}
                    >
                      <GitCommitHorizontal size={13} className="text-text-muted shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-xs text-text-primary truncate">{c.subject}</span>
                        <span className="block text-[10px] text-text-muted"><span className="font-mono">{c.hash}</span> · {c.author} · {c.when}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* right: diff */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {selected ? (
              <>
                <div className="px-4 py-2 border-b border-border/20 text-[11px] text-text-secondary truncate shrink-0">
                  {selected.kind === 'file' ? `${codeStyle(selected.file.code).label}: ${selected.file.path}` : `Commit ${selected.hash}: ${selected.subject}`}
                </div>
                <div className="flex-1 min-h-0 overflow-auto py-2">
                  {diffLoading ? (
                    <div className="flex items-center gap-2 px-4 text-xs text-text-secondary"><Loader2 size={13} className="animate-spin" /> Loading diff…</div>
                  ) : diff ? (
                    <>
                      <DiffView text={diff.text} />
                      {diff.truncated && <p className="px-4 py-2 text-[11px] text-text-muted">The diff is very long, so only the first part is shown.</p>}
                    </>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center p-6">
                <FileDiff size={22} className="text-text-muted" />
                <p className="text-xs text-text-secondary">Pick a changed file or a commit to see what changed.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
