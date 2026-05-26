import { useState, useEffect, useRef } from 'react';
import {
  StickyNote,
  Terminal,
  Trash2,
  RefreshCw,
  Search,
  X,
  Server,
  Bug,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';
import type { ServerConnection } from '../types';
import { Tooltip } from './Tooltip';

interface NotesSidebarProps {
  currentServer: ServerConnection | null;
  onOpenFile?: (path: string) => void;
}

export function NotesSidebar({ currentServer, onOpenFile }: NotesSidebarProps) {
  // General Notes State (Debounced Save)
  const [generalNotes, setGeneralNotes] = useState(() => {
    return localStorage.getItem('server-operator:general-notes') ?? '';
  });
  const [generalSaved, setGeneralSaved] = useState(true);

  // Server Notes State (Debounced Save)
  const [serverNotes, setServerNotes] = useState('');
  const [serverSaved, setServerSaved] = useState(true);

  // Debug states
  const [devtoolsStatus, setDevtoolsStatus] = useState<'idle' | 'opened' | 'error'>('idle');
  const [logPath, setLogPath] = useState('');
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logsContent, setLogsContent] = useState('');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsStatusMessage, setLogsStatusMessage] = useState<string | null>(null);

  // Timer refs for debouncing localStorage writes
  const generalTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const serverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modalLogsEndRef = useRef<HTMLDivElement | null>(null);

  // 1. Fetch Log File Path on Mount
  useEffect(() => {
    if (window.serverOperator?.getLogFilePath) {
      window.serverOperator.getLogFilePath().then((path) => {
        setLogPath(path);
      });
    }
  }, []);

  // 2. Handle General Notes change (Debounced save)
  const handleGeneralNotesChange = (val: string) => {
    setGeneralNotes(val);
    setGeneralSaved(false);
    window.dispatchEvent(new CustomEvent('notes-updated', { detail: { type: 'general', content: val } }));

    if (generalTimeoutRef.current) clearTimeout(generalTimeoutRef.current);
    generalTimeoutRef.current = setTimeout(() => {
      localStorage.setItem('server-operator:general-notes', val);
      setGeneralSaved(true);
    }, 800);
  };

  // 3. Handle Server Notes load & change (Debounced save)
  useEffect(() => {
    if (serverTimeoutRef.current) clearTimeout(serverTimeoutRef.current);

    if (currentServer) {
      const saved = localStorage.getItem(`server-operator:server-notes:${currentServer.id}`) ?? '';
      setServerNotes(saved);
      setServerSaved(true);
    } else {
      setServerNotes('');
      setServerSaved(true);
    }
  }, [currentServer?.id]);

  const handleServerNotesChange = (val: string) => {
    if (!currentServer) return;
    setServerNotes(val);
    setServerSaved(false);
    window.dispatchEvent(new CustomEvent('notes-updated', { detail: { type: 'server', content: val } }));

    if (serverTimeoutRef.current) clearTimeout(serverTimeoutRef.current);
    serverTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(`server-operator:server-notes:${currentServer.id}`, val);
      setServerSaved(true);
    }, 800);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (generalTimeoutRef.current) clearTimeout(generalTimeoutRef.current);
      if (serverTimeoutRef.current) clearTimeout(serverTimeoutRef.current);
    };
  }, []);

  // Listen for Monaco editor saving events to keep sidebar text area synchronized
  useEffect(() => {
    const syncNotes = (e: Event) => {
      const customEvent = e as CustomEvent<{ type: 'general' | 'server'; content: string }>;
      if (customEvent.detail.type === 'general') {
        setGeneralNotes(customEvent.detail.content);
        setGeneralSaved(true);
      } else if (customEvent.detail.type === 'server') {
        setServerNotes(customEvent.detail.content);
        setServerSaved(true);
      }
    };
    window.addEventListener('notes-updated', syncNotes as EventListener);
    return () => window.removeEventListener('notes-updated', syncNotes as EventListener);
  }, []);

  // 4. Open Developer Tools
  const handleOpenDevTools = async () => {
    if (!window.serverOperator?.openDevTools) {
      setDevtoolsStatus('error');
      return;
    }
    setDevtoolsStatus('opened');
    await window.serverOperator.openDevTools();
    setTimeout(() => setDevtoolsStatus('idle'), 2000);
  };

  // 5. Load App Logs
  const loadLogs = async () => {
    if (!window.serverOperator?.readLogFile) return;
    setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await window.serverOperator.readLogFile();
      if (res.ok) {
        setLogsContent(res.content ?? '');
      } else {
        setLogsError(res.error || 'Failed to read logs');
      }
    } catch (e: any) {
      setLogsError(e?.message || 'Error reading log file');
    } finally {
      setLogsLoading(false);
      // Auto-scroll to bottom of logs on load
      setTimeout(() => {
        modalLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  // 6. Clear Logs
  const handleClearLogs = async () => {
    if (!window.serverOperator?.clearLogFile) return;
    if (!window.confirm('Are you sure you want to clear the application log file? This cannot be undone.')) {
      return;
    }
    setLogsLoading(true);
    try {
      const res = await window.serverOperator.clearLogFile();
      if (res.ok) {
        setLogsContent('Log file cleared.');
        showStatus('Logs cleared successfully');
      } else {
        setLogsError(res.error || 'Failed to clear logs');
      }
    } catch (e: any) {
      setLogsError(e?.message || 'Error clearing logs');
    } finally {
      setLogsLoading(false);
    }
  };

  const showStatus = (msg: string) => {
    setLogsStatusMessage(msg);
    setTimeout(() => setLogsStatusMessage(null), 3000);
  };

  // Filter logs by search query
  const filteredLogs = logsContent
    .split('\n')
    .filter((line) => line.toLowerCase().includes(logSearchQuery.toLowerCase()))
    .join('\n');

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] text-[var(--text-primary)] min-w-0">
      {/* Title bar info */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] shrink-0 bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <StickyNote size={14} className="text-[var(--accent)]" />
          <span>Notes & Debugging</span>
        </div>
      </div>

      {/* Main scrolling wrapper */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Section 1: General Notes */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 shadow-md transition-all hover:border-[var(--border)]/80">
          <div className="flex items-center justify-between mb-2 gap-2 min-w-0 w-full">
            <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 min-w-0 flex-1">
              <StickyNote size={14} className="text-yellow-400 shrink-0" />
              <span className="truncate whitespace-nowrap">General Notes</span>
            </span>
            <div className="flex items-center gap-2">
              <Tooltip content="All changes are automatically saved to your computer's local storage" position="top">
                <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 whitespace-nowrap cursor-help">
                  {generalSaved ? (
                    <>
                      <CheckCircle size={10} className="text-[var(--success)] shrink-0" /> Saved
                    </>
                  ) : (
                    'Saving…'
                  )}
                </span>
              </Tooltip>
              {onOpenFile && (
                <Tooltip content="Edit general notes in the main editor window (Monaco)" position="top">
                  <button
                    type="button"
                    onClick={() => onOpenFile('notes://general')}
                    className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-all shrink-0"
                  >
                    <ExternalLink size={12} className="shrink-0" />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
          <textarea
            value={generalNotes}
            onChange={(e) => handleGeneralNotesChange(e.target.value)}
            placeholder="Type general notes, server passwords, or terminal commands you use often..."
            className="w-full h-44 p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] font-sans placeholder-[var(--text-muted)] resize-y min-h-[96px] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all"
          />
        </div>

        {/* Section 2: Server specific notes */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 shadow-md transition-all hover:border-[var(--border)]/80">
          <div className="flex items-center justify-between mb-2 gap-2 min-w-0 w-full">
            <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 min-w-0 flex-1">
              <Server size={14} className="text-[var(--success)] shrink-0" />
              <span className="truncate whitespace-nowrap">Server Notes</span>
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {currentServer && (
                <Tooltip content="Changes are auto-saved specifically for this connected server" position="top">
                  <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1 whitespace-nowrap cursor-help">
                    {serverSaved ? (
                      <>
                        <CheckCircle size={10} className="text-[var(--success)] shrink-0" /> Saved
                      </>
                    ) : (
                      'Saving…'
                    )}
                  </span>
                </Tooltip>
              )}
              {currentServer && onOpenFile && (
                <Tooltip content={`Edit server notes for ${currentServer.name} in the main editor window`} position="top">
                  <button
                    type="button"
                    onClick={() => onOpenFile('notes://server')}
                    className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-all shrink-0"
                  >
                    <ExternalLink size={12} className="shrink-0" />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          {currentServer ? (
            <div>
              <p className="text-[10px] text-[var(--text-secondary)] mb-1 truncate">
                Server: <span className="font-mono text-[var(--accent)] font-semibold">{currentServer.name}</span>
              </p>
              <textarea
                value={serverNotes}
                onChange={(e) => handleServerNotesChange(e.target.value)}
                placeholder={`Type notes, API endpoints, or configurations specific to ${currentServer.name}...`}
                className="w-full h-44 p-2 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-[var(--text-primary)] font-sans placeholder-[var(--text-muted)] resize-y min-h-[96px] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 px-2 bg-[var(--bg-secondary)]/50 rounded border border-dashed border-[var(--border)]">
              <Server size={20} className="text-[var(--text-muted)] mb-1" />
              <p className="text-[11px] text-[var(--text-secondary)] text-center">
                No server connected.
              </p>
              <p className="text-[10px] text-[var(--text-muted)] text-center mt-0.5">
                Connect to a server to write notes for it.
              </p>
            </div>
          )}
        </div>

        {/* Section 3: App Debugging Controls */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 shadow-md transition-all hover:border-[var(--border)]/80">
          <div className="flex items-center justify-between mb-2 gap-2 min-w-0 w-full">
            <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5 min-w-0 flex-1">
              <Bug size={14} className="text-[var(--error)] shrink-0" />
              <span className="truncate whitespace-nowrap">Debugging Tools</span>
            </span>
          </div>

          <div className="space-y-2">
            {/* DevTools Button */}
            <Tooltip content="Open Chrome Developer Tools to inspect code, console logs, and errors" position="top">
              <button
                type="button"
                onClick={handleOpenDevTools}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded border text-xs font-medium transition-all ${
                  devtoolsStatus === 'opened'
                    ? 'bg-[var(--success)]/10 border-[var(--success)] text-[var(--success)]'
                    : 'bg-[var(--bg-secondary)] border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-primary)] hover:text-[var(--accent)]'
                }`}
              >
                <Terminal size={14} />
                {devtoolsStatus === 'opened' ? 'DevTools Opened!' : 'Open DevTools (Inspect App)'}
              </button>
            </Tooltip>

            {/* Read Logs Button */}
            <Tooltip content="Open diagnostic log viewer showing app actions and connection events" position="top">
              <button
                type="button"
                onClick={() => {
                  setLogModalOpen(true);
                  loadLogs();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded border bg-[var(--bg-secondary)] border-[var(--border)] hover:border-[var(--accent)] text-[var(--text-primary)] hover:text-[var(--accent)] text-xs font-medium transition-all"
              >
                <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />
                View Application Logs
              </button>
            </Tooltip>

            {/* Clear logs shortcut */}
            <Tooltip content="Wipe all operations and diagnostic logs from the local log file" position="top">
              <button
                type="button"
                onClick={handleClearLogs}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded border border-transparent hover:border-[var(--error)]/30 hover:bg-[var(--error)]/10 text-[var(--text-secondary)] hover:text-[var(--error)] text-[11px] font-medium transition-all"
              >
                <Trash2 size={13} />
                Clear Log File
              </button>
            </Tooltip>

            {/* Log path info */}
            {logPath && (
              <div className="pt-2 border-t border-[var(--border)] mt-2">
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block mb-0.5">
                  App Log Path
                </span>
                <Tooltip content="Click to copy this path to clipboard" position="top">
                  <span
                    className="text-[9px] font-mono text-[var(--text-secondary)] break-all select-all hover:text-[var(--text-primary)] block cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(logPath);
                      showStatus('Log path copied');
                    }}
                  >
                    {logPath}
                  </span>
                </Tooltip>
                {logsStatusMessage && (
                  <span className="text-[9px] text-[var(--success)] font-semibold mt-1 block">
                    ✓ {logsStatusMessage}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Logs Modal View (Visible when logModalOpen === true) */}
      {logModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 transition-all animate-fade-in">
          <div className="w-full max-w-4xl h-[85vh] rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-[var(--accent)]" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">Application Diagnostics & Log Viewer</span>
              </div>
              <div className="flex items-center gap-3">
                {/* Search field */}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="Filter logs..."
                    className="w-48 pl-8 pr-3 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  {logSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setLogSearchQuery('')}
                      className="absolute right-2 top-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Refresh button */}
                <button
                  type="button"
                  onClick={loadLogs}
                  disabled={logsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-50 transition-colors"
                  title="Reload log file"
                >
                  <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />
                  Reload
                </button>

                {/* Clear Logs */}
                <button
                  type="button"
                  onClick={handleClearLogs}
                  disabled={logsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:text-[var(--error)] hover:border-[var(--error)]/40 disabled:opacity-50 transition-colors"
                  title="Clear log file contents"
                >
                  <Trash2 size={14} />
                  Clear
                </button>

                <div className="h-4 w-[1px] bg-[var(--border)]" />

                {/* Close Button */}
                <Tooltip content="Close log viewer" position="left">
                  <button
                    type="button"
                    onClick={() => setLogModalOpen(false)}
                    className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <X size={18} />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Modal Body: Log output */}
            <div className="flex-1 min-h-0 bg-[var(--bg-primary)] p-4 overflow-auto">
              {logsLoading && !logsContent ? (
                <div className="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] gap-2">
                  <RefreshCw size={24} className="animate-spin text-[var(--accent)]" />
                  <span className="text-xs">Loading application log file...</span>
                </div>
              ) : logsError ? (
                <div className="p-4 text-[var(--error)] text-xs bg-[var(--error)]/10 rounded border border-[var(--error)]/30">
                  <p className="font-semibold mb-1">Failed to read logs:</p>
                  <p>{logsError}</p>
                </div>
              ) : (
                <pre className="font-mono text-xs text-[var(--text-primary)] whitespace-pre-wrap break-words leading-relaxed select-text">
                  {logSearchQuery && !filteredLogs ? (
                    <span className="text-[var(--text-muted)] italic">No matching log entries found for "{logSearchQuery}"</span>
                  ) : (
                    filteredLogs || <span className="text-[var(--text-muted)] italic">Log file is empty. No operations have been recorded yet.</span>
                  )}
                  <div ref={modalLogsEndRef} />
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-between shrink-0">
              <span className="text-[10px] text-[var(--text-muted)] font-mono">
                Log path: {logPath || 'Unknown'}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)]">
                Showing all activity, commands executed, and system crashes.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
