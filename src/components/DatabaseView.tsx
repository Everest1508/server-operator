import { useState, useEffect } from 'react';
import { 
  Database, 
  Play, 
  Search, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  Wifi, 
  WifiOff, 
  HelpCircle,
  ChevronRight,
  Server as ServerIcon
} from 'lucide-react';
import type { ServerConnection, ProxySettings } from '../types';
import Editor, { useMonaco } from '@monaco-editor/react';

interface DatabaseViewProps {
  currentServer: ServerConnection | null;
  proxy: ProxySettings;
}

export function DatabaseView({ currentServer, proxy }: DatabaseViewProps) {
  // Connection Form State
  const [dbType, setDbType] = useState<'mysql' | 'postgres' | 'redis'>('mysql');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('3306');
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');

  // Execution State
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [localPort, setLocalPort] = useState<number | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  // Metadata Panel
  const [tables, setTables] = useState<string[]>([]);
  const [redisKeys, setRedisKeys] = useState<string[]>([]);
  const [metadataSearch, setMetadataSearch] = useState('');
  const [metadataLoading, setMetadataLoading] = useState(false);

  // Query Workspace
  const [queryText, setQueryText] = useState('');
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<any[] | null>(null);
  const [resultsSearch, setResultsSearch] = useState('');
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Default Port Helper
  useEffect(() => {
    if (dbType === 'mysql') {
      setPort('3306');
      setUsername('root');
    } else if (dbType === 'postgres') {
      setPort('5432');
      setUsername('postgres');
    } else if (dbType === 'redis') {
      setPort('6379');
      setUsername('');
      setDatabase('0'); // Redis DB Index
    }
    // Clear state on engine switch
    setQueryResult(null);
    setTables([]);
    setRedisKeys([]);
    setQueryText('');
    setQueryError(null);
    setExecutionTime(null);
    setCurrentPage(1);
  }, [dbType]);

  // Handle server switch cleanup
  useEffect(() => {
    handleDisconnect();
  }, [currentServer?.id]);

  // Monaco Autocomplete Provider
  const monaco = useMonaco();
  useEffect(() => {
    if (!monaco || tables.length === 0) return;

    const provider = monaco.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = tables.map((tableName) => ({
          label: tableName,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: tableName,
          detail: 'Table name',
          range,
        }));

        return { suggestions };
      },
    });

    return () => {
      provider.dispose();
    };
  }, [monaco, tables]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentServer || !window.serverOperator) return;

    setStatus('connecting');
    setError(null);
    setQueryResult(null);
    setTables([]);
    setRedisKeys([]);

    try {
      const config: Record<string, string> = { host, port, username, password, database };
      const res = await window.serverOperator.connectDatabase({
        connection: currentServer,
        proxy,
        dbType,
        config,
      });

      if (res.ok && res.localPort) {
        setLocalPort(res.localPort);
        setStatus('connected');
        fetchSchema();
      } else {
        setStatus('error');
        setError(res.error || 'Connection failed');
      }
    } catch (err: any) {
      setStatus('error');
      setError(err.message || String(err));
    }
  };

  const handleDisconnect = async () => {
    if (!currentServer || !window.serverOperator) return;
    try {
      await window.serverOperator.disconnectDatabase({ serverId: currentServer.id });
    } catch (e) {
      console.error('Error disconnecting database:', e);
    }
    setStatus('disconnected');
    setLocalPort(null);
    setQueryResult(null);
    setTables([]);
    setRedisKeys([]);
    setQueryText('');
    setQueryError(null);
    setExecutionTime(null);
    setCurrentPage(1);
  };

  const fetchSchema = async () => {
    if (!currentServer || !window.serverOperator || status === 'disconnected') return;
    setMetadataLoading(true);
    try {
      const res = await window.serverOperator.getDatabaseSchema({ serverId: currentServer.id });
      if (res.ok) {
        if (dbType === 'redis') {
          setRedisKeys(res.keys || []);
        } else {
          setTables(res.tables || []);
        }
      }
    } catch (e) {
      console.error('Failed to fetch DB schema:', e);
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleRunQuery = async () => {
    if (!currentServer || !window.serverOperator || !queryText.trim()) return;
    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);
    setExecutionTime(null);
    setCurrentPage(1);

    const startTime = performance.now();
    try {
      const res = await window.serverOperator.queryDatabase({
        serverId: currentServer.id,
        query: queryText.trim(),
      });
      const endTime = performance.now();
      setExecutionTime(Math.round(endTime - startTime));

      if (res.ok) {
        // Normalize Redis result to render nicely in tables
        let data = res.result;
        if (dbType === 'redis') {
          if (!Array.isArray(data)) {
            data = typeof data === 'object' && data !== null 
              ? [data] 
              : [{ result: String(data) }];
          } else {
            data = data.map(item => typeof item === 'object' ? item : { value: item });
          }
        }
        setQueryResult(Array.isArray(data) ? data : []);
      } else {
        setQueryError(res.error || 'Query failed');
      }
    } catch (err: any) {
      setQueryError(err.message || String(err));
    } finally {
      setQueryLoading(false);
    }
  };

  const handleMetadataItemClick = (item: string) => {
    if (dbType === 'redis') {
      const query = `GET ${item}`;
      setQueryText(query);
      // Auto run Redis GET keys
      setTimeout(() => {
        handleRunQuery();
      }, 50);
    } else {
      const query = `SELECT * FROM ${item} LIMIT 100;`;
      setQueryText(query);
    }
  };

  const exportQueryResultToCSV = () => {
    if (!queryResult || queryResult.length === 0) return;

    const headers = Object.keys(queryResult[0]);
    let csv = headers.join(',') + '\n';

    for (const row of queryResult) {
      const values = headers.map(header => {
        const val = row[header];
        if (val === null || val === undefined) return '';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        // Escape quotes
        return `"${str.replace(/"/g, '""')}"`;
      });
      csv += values.join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `query_result_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredMetadata = dbType === 'redis' 
    ? redisKeys.filter(k => k.toLowerCase().includes(metadataSearch.toLowerCase()))
    : tables.filter(t => t.toLowerCase().includes(metadataSearch.toLowerCase()));

  const filteredResults = queryResult 
    ? queryResult.filter(row => {
        return Object.values(row).some(val => 
          String(val).toLowerCase().includes(resultsSearch.toLowerCase())
        );
      })
    : null;

  const totalRows = filteredResults ? filteredResults.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const activePage = Math.min(currentPage, totalPages);

  const paginatedResults = filteredResults 
    ? filteredResults.slice((activePage - 1) * pageSize, activePage * pageSize)
    : null;

  const displayResults = dbType === 'redis' 
    ? filteredResults 
    : paginatedResults;

  if (!currentServer) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)] text-sm font-sans gap-3">
        <ServerIcon size={32} className="text-[var(--text-muted)]" />
        <p>Please select an active SSH server from the sidebar to establish database tunnels.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] min-h-0 overflow-hidden font-sans">
      {/* Top Header Controls bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4 gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--accent)] shrink-0">
            <Database size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Database Tunnel Manager</h2>
              {status === 'connected' ? (
                <span className="flex items-center gap-1 text-[10px] text-[var(--success)] bg-[var(--success)]/10 border border-[var(--success)]/25 px-2 py-0.5 rounded-full font-semibold">
                  <Wifi size={10} /> Active Tunnel (LPort: {localPort})
                </span>
              ) : status === 'connecting' ? (
                <span className="flex items-center gap-1 text-[10px] text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/20 px-2 py-0.5 rounded-full font-semibold animate-pulse">
                  <RefreshCw size={10} className="animate-spin" /> Forwarding...
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] border border-[var(--border)] px-2 py-0.5 rounded-full font-semibold">
                  <WifiOff size={10} /> Disconnected
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">{currentServer.name} — {currentServer.username}@{currentServer.host}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 divide-x divide-[var(--border)]">
        {/* Connection Form & Schema Sidebar */}
        <div className="w-[300px] flex flex-col shrink-0 min-h-0 bg-[var(--bg-secondary)] overflow-y-auto">
          {/* Connection settings form */}
          {status !== 'connected' && status !== 'connecting' ? (
            <form onSubmit={handleConnect} className="p-4 border-b border-[var(--border)] flex flex-col gap-3.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Connection Settings</h3>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[var(--text-secondary)]" htmlFor="engine-select">DB Engine</label>
                <select
                  id="engine-select"
                  value={dbType}
                  onChange={(e) => setDbType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="mysql">MySQL</option>
                  <option value="postgres">PostgreSQL</option>
                  <option value="redis">Redis</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-secondary)]" htmlFor="host-input">Host</label>
                  <input
                    id="host-input"
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-secondary)]" htmlFor="port-input">Port</label>
                  <input
                    id="port-input"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
              </div>

              {dbType !== 'redis' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-[var(--text-secondary)]" htmlFor="user-input">Username</label>
                  <input
                    id="user-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[var(--text-secondary)]" htmlFor="pass-input">Password</label>
                <input
                  id="pass-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[var(--text-secondary)]" htmlFor="db-input">
                  {dbType === 'redis' ? 'DB Index' : 'Database'}
                </label>
                <input
                  id="db-input"
                  type="text"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder={dbType === 'redis' ? '0' : 'Database Name'}
                  className="w-full px-2.5 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded transition-all cursor-pointer shadow-sm"
              >
                Establish DB Tunnel
              </button>

              {status === 'error' && error && (
                <div className="mt-2 p-2.5 rounded bg-[var(--error)]/10 border border-[var(--error)]/30 text-[var(--error)] text-xs flex gap-1.5 items-start">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span className="break-all font-mono">{error}</span>
                </div>
              )}
            </form>
          ) : (
            <div className="p-4 border-b border-[var(--border)] flex flex-col gap-2.5 bg-[var(--bg-tertiary)]/30">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">Connected Engine</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20">
                  {dbType}
                </span>
              </div>
              <p className="text-xs font-mono text-[var(--text-primary)] break-all mt-1">
                Target: {host}:{port} <br />
                {database && `DB: ${database}`}
              </p>
              <button
                type="button"
                onClick={handleDisconnect}
                className="w-full py-1.5 bg-[var(--error)]/15 hover:bg-[var(--error)] hover:text-white border border-[var(--error)]/30 hover:border-transparent text-[var(--error)] text-xs font-semibold rounded transition-all cursor-pointer mt-2"
              >
                Disconnect DB Tunnel
              </button>
            </div>
          )}

          {/* Schema Explorer */}
          {status === 'connected' && (
            <div className="flex-1 flex flex-col min-h-[300px]">
              <div className="p-4 pb-2 flex justify-between items-center">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {dbType === 'redis' ? 'Keys Explorer' : 'Tables Explorer'}
                </h3>
                <button
                  type="button"
                  onClick={fetchSchema}
                  disabled={metadataLoading}
                  className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50"
                  title="Reload Schema"
                >
                  <RefreshCw size={12} className={metadataLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* Search filter for explorer list */}
              <div className="px-4 mb-3 relative">
                <Search size={12} className="absolute left-6.5 top-2.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder={dbType === 'redis' ? 'Filter keys…' : 'Filter tables…'}
                  value={metadataSearch}
                  onChange={(e) => setMetadataSearch(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
                />
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto px-2 pb-4">
                {metadataLoading && filteredMetadata.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[var(--text-muted)]">
                    Loading database outline…
                  </div>
                ) : filteredMetadata.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[var(--text-muted)]">
                    {metadataSearch ? 'No matches found.' : (dbType === 'redis' ? 'No keys detected.' : 'No public tables detected.')}
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {filteredMetadata.map((item) => (
                      <li key={item}>
                        <button
                          type="button"
                          onClick={() => handleMetadataItemClick(item)}
                          className="w-full text-left px-2 py-1.5 rounded text-xs font-mono text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent-hover)] transition-colors truncate flex items-center gap-1.5"
                          title={item}
                        >
                          <ChevronRight size={10} className="text-[var(--text-secondary)] shrink-0" />
                          <span className="truncate">{item}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Query Editor & Result Grid Workspace */}
        <div className="flex-1 flex flex-col min-h-0 bg-[var(--bg-primary)]">
          {status !== 'connected' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-secondary)] text-sm font-sans gap-2 p-6 text-center">
              <Database size={24} className="text-[var(--text-muted)] mb-1" />
              <p className="font-semibold text-[var(--text-primary)]">SSH Tunnel Connection Required</p>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm">
                Enter your remote database parameters on the left and connect. The app will open a local forwarding port over your active SSH session to secure traffic.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Query input editor */}
              <div className="border-b border-[var(--border)] p-4 flex flex-col gap-3 shrink-0">
                {dbType === 'redis' ? (
                  <>
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        Redis command console
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQueryText('')}
                          className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] rounded transition-all"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={handleRunQuery}
                          disabled={queryLoading || !queryText.trim()}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded disabled:opacity-50 cursor-pointer shadow-sm"
                        >
                          {queryLoading ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                          Run Query
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={queryText}
                      onChange={(e) => setQueryText(e.target.value)}
                      placeholder="e.g. GET mykey&#10;     HGETALL user:100&#10;     KEYS *"
                      className="w-full h-24 p-3 border border-[var(--border)] bg-[var(--bg-secondary)] rounded-md font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] resize-none"
                    />
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                        SQL Query Workspace
                      </h3>
                    </div>

                    <div className="border border-[var(--border)] bg-[var(--bg-secondary)] rounded-md overflow-hidden flex flex-col">
                      <div className="h-32">
                        <Editor
                          height="100%"
                          language="sql"
                          theme="vs-dark"
                          value={queryText}
                          onChange={(val) => setQueryText(val || '')}
                          options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 12,
                            fontFamily: "var(--font-mono), Menlo, Monaco, Consolas, monospace",
                            lineNumbers: 'on',
                            automaticLayout: true,
                            scrollbar: {
                              verticalScrollbarSize: 8,
                              horizontalScrollbarSize: 8,
                            },
                            suggest: {
                              showKeywords: true,
                              showSnippets: true,
                            },
                            wordWrap: 'on',
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2 bg-[var(--bg-tertiary)]/40 text-xs">
                        <div className="flex items-center gap-3">
                          {executionTime !== null && filteredResults && (
                            <div className="flex items-center gap-2.5 text-xs font-mono text-[var(--text-secondary)]">
                              <span>Duration: <strong className="text-[var(--text-primary)]">{executionTime}ms</strong></span>
                              <span className="w-[1px] h-3 bg-[var(--border)]" />
                              <span>Total Rows: <strong className="text-[var(--text-primary)]">{filteredResults.length}</strong></span>
                              <span className="w-[1px] h-3 bg-[var(--border)]" />
                              <span>Page: <strong className="text-[var(--text-primary)]">{activePage}/{totalPages}</strong></span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setQueryText('')}
                            className="px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] rounded transition-all"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={handleRunQuery}
                            disabled={queryLoading || !queryText.trim()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-semibold rounded disabled:opacity-50 cursor-pointer shadow-sm"
                          >
                            {queryLoading ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                            Run Query
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {queryError && (
                  <div className="p-2.5 rounded bg-[var(--error)]/10 border border-[var(--error)]/30 text-[var(--error)] text-xs flex gap-1.5 items-start font-mono">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{queryError}</span>
                  </div>
                )}
              </div>

              {/* Query Results View Grid */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Results controls */}
                {filteredResults && (
                  <div className="border-b border-[var(--border)] px-4 py-2.5 bg-[var(--bg-secondary)]/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-[var(--text-primary)]">Query Output</h4>
                      <span className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-[var(--text-secondary)] font-mono">
                        {filteredResults.length} records
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Filter records input */}
                      <div className="relative">
                        <Search size={10} className="absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
                        <input
                          type="text"
                          placeholder="Filter results…"
                          value={resultsSearch}
                          onChange={(e) => setResultsSearch(e.target.value)}
                          className="pl-6.5 pr-2 py-1 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-[10px] text-[var(--text-primary)] w-36 focus:outline-none"
                        />
                      </div>
                      
                      <button
                        type="button"
                        onClick={exportQueryResultToCSV}
                        disabled={filteredResults.length === 0}
                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] rounded disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <Download size={10} /> Export CSV
                      </button>
                    </div>
                  </div>
                )}

                {/* Spreadsheet-like Table Grid */}
                <div className="flex-1 overflow-auto min-h-0 bg-[var(--bg-primary)]">
                  {!filteredResults ? (
                    <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] text-xs p-6 text-center font-sans">
                      <HelpCircle size={20} className="text-[var(--text-muted)] mb-1" />
                      <p>Workspace is ready.</p>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                        Write a query above or click a schema table/key on the left to execute.
                      </p>
                    </div>
                  ) : filteredResults.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-xs p-6 font-sans">
                      No records returned. (Query ran successfully, returned 0 rows)
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] sticky top-0 z-10">
                          <th className="px-3 py-2 font-semibold border-r border-[var(--border)]">#</th>
                          {Object.keys(filteredResults[0]).map((header) => (
                            <th key={header} className="px-3 py-2 font-semibold border-r border-[var(--border)] max-w-xs truncate" title={header}>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                        {displayResults && displayResults.map((row, idx) => {
                          const rowNum = dbType === 'redis' 
                            ? idx + 1 
                            : (activePage - 1) * pageSize + idx + 1;
                          return (
                            <tr key={idx} className="hover:bg-[var(--bg-tertiary)]/40 transition-colors">
                              <td className="px-3 py-1.5 border-r border-[var(--border)] text-[var(--text-muted)] select-none">
                                {rowNum}
                              </td>
                              {Object.keys(filteredResults[0]).map((header) => {
                                const val = row[header];
                                const renderVal = val === null || val === undefined 
                                  ? <span className="text-[var(--text-muted)] italic">NULL</span>
                                  : typeof val === 'object' 
                                    ? JSON.stringify(val) 
                                    : String(val);
                                
                                return (
                                  <td key={header} className="px-3 py-1.5 border-r border-[var(--border)] truncate max-w-md" title={String(renderVal)}>
                                    {renderVal}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination footer for SQL engines */}
                {dbType !== 'redis' && filteredResults && filteredResults.length > 0 && (
                  <div className="border-t border-[var(--border)] px-4 py-2 bg-[var(--bg-secondary)] flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs text-[var(--text-secondary)]">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span>Rows per page:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="px-2 py-0.5 border border-[var(--border)] bg-[var(--bg-primary)] rounded text-xs text-[var(--text-primary)] focus:outline-none"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                      <span>
                        Showing <strong className="text-[var(--text-primary)]">{(activePage - 1) * pageSize + 1}</strong> to{' '}
                        <strong className="text-[var(--text-primary)] font-semibold">
                          {Math.min(activePage * pageSize, totalRows)}
                        </strong>{' '}
                        of <strong className="text-[var(--text-primary)]">{totalRows}</strong> rows
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        disabled={activePage === 1}
                        className="px-2.5 py-1 border border-[var(--border)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:hover:bg-transparent rounded text-xs transition-colors cursor-pointer"
                        title="First Page"
                      >
                        First
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={activePage === 1}
                        className="px-2.5 py-1 border border-[var(--border)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:hover:bg-transparent rounded text-xs transition-colors cursor-pointer"
                        title="Previous Page"
                      >
                        Prev
                      </button>
                      <span className="px-2 font-mono">
                        Page {activePage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={activePage === totalPages}
                        className="px-2.5 py-1 border border-[var(--border)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:hover:bg-transparent rounded text-xs transition-colors cursor-pointer"
                        title="Next Page"
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={activePage === totalPages}
                        className="px-2.5 py-1 border border-[var(--border)] hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:hover:bg-transparent rounded text-xs transition-colors cursor-pointer"
                        title="Last Page"
                      >
                        Last
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
