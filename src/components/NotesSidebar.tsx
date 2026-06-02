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
    <div className="flex flex-col h-full bg-bg-secondary/30 border-r border-border/20 text-text-primary min-w-0 select-none">
      {/* Title bar info */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 shrink-0">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
          <StickyNote size={13} className="text-accent" />
          <span>Notes & Debugging</span>
        </div>
      </div>

      {/* Main scrolling wrapper */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Section 1: General Notes */}
        <div className="rounded-xl border border-border/20 bg-bg-primary/50 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-border/40 hover:bg-bg-primary/65">
          <div className="flex items-center justify-between mb-3 gap-2 min-w-0 w-full">
            <span className="text-xs font-semibold text-text-primary flex items-center gap-2 min-w-0 flex-1">
              <StickyNote size={13} className="text-warning shrink-0" />
              <span className="truncate whitespace-nowrap">General Notes</span>
            </span>
            <div className="flex items-center gap-2">
              <Tooltip content="All changes are automatically saved to your computer's local storage" position="top">
                <span className="text-[10px] text-text-muted flex items-center gap-1 whitespace-nowrap cursor-help font-medium">
                  {generalSaved ? (
                    <>
                      <CheckCircle size={10} className="text-success shrink-0" /> Saved
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
                    className="p-1 rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-accent transition-all shrink-0 cursor-pointer"
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
            className="w-full h-44 p-3 rounded-xl bg-bg-secondary/40 border border-border/30 text-xs text-text-primary font-sans placeholder-text-muted resize-y min-h-[96px] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all select-text"
          />
        </div>

        {/* Section 2: Server specific notes */}
        <div className="rounded-xl border border-border/20 bg-bg-primary/50 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-border/40 hover:bg-bg-primary/65">
          <div className="flex items-center justify-between mb-3 gap-2 min-w-0 w-full">
            <span className="text-xs font-semibold text-text-primary flex items-center gap-2 min-w-0 flex-1">
              <Server size={13} className="text-success shrink-0" />
              <span className="truncate whitespace-nowrap">Server Notes</span>
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {currentServer && (
                <Tooltip content="Changes are auto-saved specifically for this connected server" position="top">
                  <span className="text-[10px] text-text-muted flex items-center gap-1 whitespace-nowrap cursor-help font-medium">
                    {serverSaved ? (
                      <>
                        <CheckCircle size={10} className="text-success shrink-0" /> Saved
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
                    className="p-1 rounded-md text-text-secondary hover:bg-bg-tertiary hover:text-accent transition-all shrink-0 cursor-pointer"
                  >
                    <ExternalLink size={12} className="shrink-0" />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>

          {currentServer ? (
            <div>
              <p className="text-[10px] text-text-secondary mb-2 truncate">
                Server: <span className="font-mono text-accent font-semibold">{currentServer.name}</span>
              </p>
              <textarea
                value={serverNotes}
                onChange={(e) => handleServerNotesChange(e.target.value)}
                placeholder={`Type notes, API endpoints, or configurations specific to ${currentServer.name}...`}
                className="w-full h-44 p-3 rounded-xl bg-bg-secondary/40 border border-border/30 text-xs text-text-primary font-sans placeholder-text-muted resize-y min-h-[96px] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all select-text"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 px-3 bg-bg-secondary/15 rounded-xl border border-dashed border-border/30">
              <Server size={18} className="text-text-muted mb-2" />
              <p className="text-xs text-text-secondary text-center font-medium">
                No server connected
              </p>
              <p className="text-[10px] text-text-muted text-center mt-1">
                Connect to a server to write notes for it.
              </p>
            </div>
          )}
        </div>

        {/* Section 3: App Debugging Controls */}
        {process.env.NODE_ENV === 'development' && (
          <div className="rounded-xl border border-border/20 bg-bg-primary/50 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-border/40 hover:bg-bg-primary/65">
            <div className="flex items-center justify-between mb-3 gap-2 min-w-0 w-full">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-2 min-w-0 flex-1">
                <Bug size={13} className="text-error shrink-0" />
                <span className="truncate whitespace-nowrap">Debugging Tools</span>
              </span>
            </div>

            <div className="space-y-2">
              {/* DevTools Button */}
              <Tooltip content="Open Chrome Developer Tools to inspect code, console logs, and errors" position="top">
                <button
                  type="button"
                  onClick={handleOpenDevTools}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all duration-200 cursor-pointer ${
                    devtoolsStatus === 'opened'
                      ? 'bg-success/15 border-success/30 text-success'
                      : 'bg-bg-secondary/50 border-border/30 hover:border-accent/40 hover:bg-accent/5 text-text-primary hover:text-accent'
                  }`}
                >
                  <Terminal size={13} />
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
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border bg-bg-secondary/50 border-border/30 hover:border-accent/40 hover:bg-accent/5 text-text-primary hover:text-accent text-xs font-semibold transition-all duration-200 cursor-pointer"
                >
                  <RefreshCw size={13} className={logsLoading ? 'animate-spin text-accent' : ''} />
                  View Application Logs
                </button>
              </Tooltip>

              {/* Clear logs shortcut */}
              <Tooltip content="Wipe all operations and diagnostic logs from the local log file" position="top">
                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border border-transparent hover:border-error/30 hover:bg-error/10 text-text-secondary hover:text-error text-[11px] font-semibold transition-all duration-200 cursor-pointer"
                >
                  <Trash2 size={12} />
                  Clear Log File
                </button>
              </Tooltip>

              {/* Log path info */}
              {logPath && (
                <div className="pt-2.5 border-t border-border/15 mt-3 select-text">
                  <span className="text-[9px] uppercase tracking-wider text-text-muted block mb-1">
                    App Log Path
                  </span>
                  <Tooltip content="Click to copy this path to clipboard" position="top">
                    <span
                      className="text-[9px] font-mono text-text-secondary break-all select-all hover:text-text-primary block cursor-pointer transition-colors"
                      onClick={() => {
                        navigator.clipboard.writeText(logPath);
                        showStatus('Log path copied');
                      }}
                    >
                      {logPath}
                    </span>
                  </Tooltip>
                  {logsStatusMessage && (
                    <span className="text-[9px] text-success font-semibold mt-1 block">
                      ✓ {logsStatusMessage}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Logs Modal View (Visible when logModalOpen === true) */}
      {logModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 transition-all duration-200 animate-in fade-in">
          <div className="w-full max-w-4xl h-[85vh] rounded-2xl border border-border/40 bg-bg-secondary/95 shadow-2xl flex flex-col backdrop-blur-md overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-bg-secondary/45 shrink-0">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-accent" />
                <span className="text-xs font-semibold text-text-primary">Application Diagnostics & Log Viewer</span>
              </div>
              <div className="flex items-center gap-3">
                {/* Search field */}
                <div className="relative">
                  <Search size={12} className="absolute left-3 top-2 text-text-muted" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="Filter logs..."
                    className="w-48 pl-8 pr-3 py-1.5 rounded-xl bg-bg-primary/50 border border-border/40 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent font-sans transition-all select-text"
                  />
                  {logSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setLogSearchQuery('')}
                      className="absolute right-2 top-2 text-text-secondary hover:text-text-primary cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                {/* Refresh button */}
                <button
                  type="button"
                  onClick={loadLogs}
                  disabled={logsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-primary hover:border-accent/50 disabled:opacity-50 transition-all cursor-pointer font-semibold"
                  title="Reload log file"
                >
                  <RefreshCw size={13} className={logsLoading ? 'animate-spin' : ''} />
                  Reload
                </button>

                {/* Clear Logs */}
                <button
                  type="button"
                  onClick={handleClearLogs}
                  disabled={logsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-bg-primary/50 border border-border/30 text-xs text-text-secondary hover:text-error hover:border-error/40 disabled:opacity-50 transition-all cursor-pointer font-semibold"
                  title="Clear log file contents"
                >
                  <Trash2 size={13} />
                  Clear
                </button>

                <div className="h-4 w-[1px] bg-border/20" />

                {/* Close Button */}
                <Tooltip content="Close log viewer" position="left">
                  <button
                    type="button"
                    onClick={() => setLogModalOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-bg-tertiary/60 text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Modal Body: Log output */}
            <div className="flex-1 min-h-0 bg-bg-primary p-4 overflow-auto">
              {logsLoading && !logsContent ? (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary gap-3">
                  <RefreshCw size={24} className="animate-spin text-accent" />
                  <span className="text-xs font-mono text-text-muted">Loading application logs...</span>
                </div>
              ) : logsError ? (
                <div className="p-4 text-error text-xs bg-error/10 rounded-xl border border-error/20 font-mono">
                  <p className="font-semibold mb-1">Failed to read logs:</p>
                  <p>{logsError}</p>
                </div>
              ) : (
                <pre className="font-mono text-xs text-text-primary whitespace-pre-wrap break-words leading-relaxed select-text">
                  {logSearchQuery && !filteredLogs ? (
                    <span className="text-text-muted italic">No matching log entries found for "{logSearchQuery}"</span>
                  ) : (
                    filteredLogs || <span className="text-text-muted italic">Log file is empty. No operations have been recorded yet.</span>
                  )}
                  <div ref={modalLogsEndRef} />
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2 border-t border-border/20 bg-bg-secondary/45 flex items-center justify-between shrink-0 font-mono text-[9px]">
              <span className="text-text-muted truncate max-w-md select-text">
                Log path: {logPath || 'Unknown'}
              </span>
              <span className="text-text-secondary">
                Showing app diagnostics, commands executed, and error captures.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
