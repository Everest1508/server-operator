import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  Server as ServerIcon,
  Cloud,
  Upload,
  ChevronDown,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
} from 'lucide-react';
import EyeIcon from './icons/EyeIcon';
import EyeOffIcon from './icons/EyeOffIcon';
import type { ServerConnection, ProxySettings } from '../types';
import { useAppTheme, isLightTheme } from '../hooks/useAppTheme';
import Editor, { useMonaco } from '@monaco-editor/react';
import { Select } from './Select';

type DbType = 'mysql' | 'postgres' | 'redis' | 'sqlite';
type ExportMode = 'schema' | 'data' | 'full';

interface TableColumnMeta {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary: boolean;
}

interface DockerDatabaseTarget {
  id: string;
  name: string;
  image: string;
  state?: string;
  status?: string;
  dbType: DbType;
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
  source: 'published-port' | 'container-ip' | 'default-port';
}

interface DatabaseViewProps {
  currentServer: ServerConnection | null;
  proxy: ProxySettings;
  activeView?: string;
  connectedSqlitePath?: string | null;
  onSqliteDisconnect?: () => void;
}

export function DatabaseView({ currentServer, proxy, activeView, connectedSqlitePath, onSqliteDisconnect }: DatabaseViewProps) {
  const appTheme = useAppTheme();
  const monacoTheme = isLightTheme(appTheme) ? 'vs-light' : 'vs-dark';
  // Connection Form State
  const [dbType, setDbType] = useState<DbType>('mysql');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('3306');
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sqliteFilePath, setSqliteFilePath] = useState('');
  const skipNextEngineDefaults = useRef(false);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const importFullFileInputRef = useRef<HTMLInputElement | null>(null);

  // Cloudinary Backup State
  const [cloudinaryBackups, setCloudinaryBackups] = useState<any[]>([]);
  const [cloudinaryBackupsLoading, setCloudinaryBackupsLoading] = useState(false);
  const [cloudinaryBackupsError, setCloudinaryBackupsError] = useState<string | null>(null);
  const [cloudinaryOpen, setCloudinaryOpen] = useState(false);
  const [cloudinaryUploading, setCloudinaryUploading] = useState(false);
  const [cloudinaryRestoring, setCloudinaryRestoring] = useState<string | null>(null);
  const [cloudinaryMessage, setCloudinaryMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Execution State
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [localPort, setLocalPort] = useState<number | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<ExportMode | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importLog, setImportLog] = useState<string[]>([]);
  const [dockerDatabases, setDockerDatabases] = useState<DockerDatabaseTarget[]>([]);
  const [dockerDatabasesLoading, setDockerDatabasesLoading] = useState(false);
  const [dockerDatabasesError, setDockerDatabasesError] = useState<string | null>(null);
  const [selectedDockerDatabaseId, setSelectedDockerDatabaseId] = useState<string | null>(null);

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
  const [lastExecutedQuery, setLastExecutedQuery] = useState('');
  const [activeTableName, setActiveTableName] = useState<string | null>(null);
  const [tableColumns, setTableColumns] = useState<TableColumnMeta[]>([]);
  const [tableEditorLoading, setTableEditorLoading] = useState(false);
  const [tableEditorError, setTableEditorError] = useState<string | null>(null);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const [editingRowValues, setEditingRowValues] = useState<Record<string, string>>({});
  const [addingRow, setAddingRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});
  const [rowMutationLoading, setRowMutationLoading] = useState(false);

  // Auto-connect when a sqlite file was opened from the file explorer
  useEffect(() => {
    if (!connectedSqlitePath) return;
    setDbType('sqlite');
    setSqliteFilePath(connectedSqlitePath);
    setStatus('connected');
    setLocalPort(0);
    setError(null);
    fetchSchema();
  }, [connectedSqlitePath]);

  // Default Port Helper
  useEffect(() => {
    if (skipNextEngineDefaults.current) {
      skipNextEngineDefaults.current = false;
      return;
    }
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
    } else if (dbType === 'sqlite') {
      setSqliteFilePath('');
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

  const refreshDockerDatabases = async () => {
    if (!currentServer || !window.serverOperator?.getDockerDatabases) return;
    setDockerDatabasesLoading(true);
    setDockerDatabasesError(null);
    try {
      const res = await window.serverOperator.getDockerDatabases({ connection: currentServer, proxy });
      if (res.ok) {
        setDockerDatabases(res.databases || []);
      } else {
        setDockerDatabases([]);
        setDockerDatabasesError(res.error || 'Failed to scan Docker databases');
      }
    } catch (err: any) {
      setDockerDatabases([]);
      setDockerDatabasesError(err.message || String(err));
    } finally {
      setDockerDatabasesLoading(false);
    }
  };

  useEffect(() => {
    refreshDockerDatabases();
  }, [currentServer?.id]);

  // Handle server switch cleanup (only when server ID actually changes)
  const prevServerIdRef = useRef<string | null>(currentServer?.id || null);
  useEffect(() => {
    if (prevServerIdRef.current && prevServerIdRef.current !== currentServer?.id) {
      handleDisconnect();
    }
    prevServerIdRef.current = currentServer?.id || null;
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

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      if (detail?.type === 'start') {
        setImportLog([`Starting import (${detail.total || '?'} statements)...`]);
      } else if (detail?.type === 'progress') {
        setImportLog((prev) => [...prev.slice(-99), `[${detail.executed}/${detail.total}] ${detail.lastStatement || ''}`]);
      } else if (detail?.type === 'complete') {
        setImportLog((prev) => [...prev, `Import complete: ${detail.executed} statements executed.`]);
      } else if (detail?.type === 'error') {
        setImportLog((prev) => [...prev, `Error: ${detail.error}`]);
      }
    };
    window.addEventListener('import-progress', handler);
    return () => window.removeEventListener('import-progress', handler);
  }, []);

  const quoteIdentifier = (name: string) => {
    if (dbType === 'mysql') return `\`${String(name).replace(/`/g, '``')}\``;
    return `"${String(name).replace(/"/g, '""')}"`;
  };

  const buildTableBrowseQuery = (tableName: string) => `SELECT * FROM ${quoteIdentifier(tableName)} LIMIT 100;`;

  const formatDateForColumn = (value: Date, columnType = '') => {
    const t = (columnType || '').toLowerCase();
    if (t.includes('with time zone')) return value.toISOString();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    const hasTime = /timestamp|datetime|time/.test(t);
    if (!hasTime) return datePart;
    const timePart = `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
    if (/^time\b/.test(t) && !/timestamp/.test(t)) return timePart;
    return `${datePart} ${timePart}`;
  };

  const formatCellValueForEdit = (value: unknown, columnType = '') => {
    if (value instanceof Date) return formatDateForColumn(value, columnType);
    return String(value);
  };

  const parseCellInputValue = (value: string) => {
    const trimmed = value.trim();
    if (trimmed === 'NULL') return null;
    if (/GMT[+-]\d{4}/.test(trimmed) && /\(.+\)$/.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return value;
  };

  const sqlValueLiteral = (value: unknown, columnType?: string) => {
    if (value === null || value === undefined) return 'NULL';
    if (value instanceof Date) return `'${formatDateForColumn(value, columnType ?? '').replace(/'/g, "''")}'`;
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'boolean') return dbType === 'postgres' ? (value ? 'TRUE' : 'FALSE') : (value ? '1' : '0');
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `'${str.replace(/'/g, "''")}'`;
  };

  const rowIdentityKey = (row: Record<string, any>) => {
    const primaryColumns = tableColumns.filter((column) => column.isPrimary).map((column) => column.name);
    const columnsForIdentity = primaryColumns.length ? primaryColumns : Object.keys(row);
    return JSON.stringify(columnsForIdentity.map((column) => [column, row[column] ?? null]));
  };

  const buildRowPredicate = (row: Record<string, any>) => {
    const primaryColumns = tableColumns.filter((column) => column.isPrimary).map((column) => column.name);
    const columnsForPredicate = primaryColumns.length ? primaryColumns : Object.keys(row);
    return columnsForPredicate.map((column) => {
      const value = row[column];
      const ident = quoteIdentifier(column);
      const columnType = tableColumns.find((c) => c.name === column)?.type;
      return value === null || value === undefined
        ? `${ident} IS NULL`
        : `${ident} = ${sqlValueLiteral(value, columnType)}`;
    }).join(' AND ');
  };

  const runSqlQuery = async (query: string, options?: { keepEditorText?: boolean }) => {
    if (!currentServer || !window.serverOperator || !query.trim()) return { ok: false, error: 'No active database connection' };
    setQueryLoading(true);
    setQueryError(null);
    setQueryResult(null);
    setExecutionTime(null);
    setCurrentPage(1);
    setLastExecutedQuery(query.trim());
    if (!options?.keepEditorText) setQueryText(query);

    const startTime = performance.now();
    try {
      const res = await window.serverOperator.queryDatabase({
        serverId: currentServer.id,
        query: query.trim(),
      });
      const endTime = performance.now();
      setExecutionTime(Math.round(endTime - startTime));

      if (res.ok) {
        let data = res.result;
        if (dbType === 'redis') {
          if (!Array.isArray(data)) {
            data = typeof data === 'object' && data !== null ? [data] : [{ result: String(data) }];
          } else {
            data = data.map((item) => typeof item === 'object' ? item : { value: item });
          }
        }
        const rows = Array.isArray(data) ? data : [];
        setQueryResult(rows);
        return { ok: true, rows };
      }

      setQueryError(res.error || 'Query failed');
      return { ok: false, error: res.error || 'Query failed' };
    } catch (err: any) {
      const message = err.message || String(err);
      setQueryError(message);
      return { ok: false, error: message };
    } finally {
      setQueryLoading(false);
    }
  };

  const loadTableColumns = async (tableName: string) => {
    if (!currentServer || !window.serverOperator || dbType === 'redis') return;
    setTableEditorLoading(true);
    setTableEditorError(null);
    try {
      let query = '';
      if (dbType === 'mysql') {
        query = `SHOW COLUMNS FROM ${quoteIdentifier(tableName)};`;
      } else if (dbType === 'postgres') {
        query = `
          SELECT
            c.column_name AS name,
            c.data_type AS type,
            c.is_nullable = 'YES' AS nullable,
            EXISTS (
              SELECT 1
              FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
               AND tc.table_schema = kcu.table_schema
             WHERE tc.constraint_type = 'PRIMARY KEY'
               AND tc.table_schema = 'public'
               AND tc.table_name = ${sqlValueLiteral(tableName)}
               AND kcu.column_name = c.column_name
            ) AS is_primary
          FROM information_schema.columns c
          WHERE c.table_schema = 'public' AND c.table_name = ${sqlValueLiteral(tableName)}
          ORDER BY c.ordinal_position;
        `;
      } else if (dbType === 'sqlite') {
        query = `PRAGMA table_info(${sqlValueLiteral(tableName)});`;
      }

      const res = await window.serverOperator.queryDatabase({ serverId: currentServer.id, query });
      if (!res.ok) {
        setTableColumns([]);
        setTableEditorError(res.error || 'Failed to load table columns');
        return;
      }

      const rows = Array.isArray(res.result) ? res.result : [];
      const columns = rows.map((row: any) => {
        if (dbType === 'mysql') {
          return {
            name: String(row.Field),
            type: String(row.Type || ''),
            nullable: String(row.Null || '').toUpperCase() === 'YES',
            isPrimary: String(row.Key || '').toUpperCase() === 'PRI',
          };
        }
        if (dbType === 'postgres') {
          return {
            name: String(row.name),
            type: String(row.type || ''),
            nullable: Boolean(row.nullable),
            isPrimary: Boolean(row.is_primary),
          };
        }
        return {
          name: String(row.name),
          type: String(row.type || ''),
          nullable: !Boolean(row.notnull),
          isPrimary: Number(row.pk) > 0,
        };
      });
      setTableColumns(columns);
    } catch (err: any) {
      setTableColumns([]);
      setTableEditorError(err.message || String(err));
    } finally {
      setTableEditorLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentServer || !window.serverOperator) return;

    setStatus('connecting');
    setError(null);
    setQueryResult(null);
    setTables([]);
    setRedisKeys([]);

    try {
      const config: Record<string, string> = dbType === 'sqlite'
        ? { filePath: sqliteFilePath }
        : { host, port, username, password, database };
      
      const connectPromise = window.serverOperator.connectDatabase({
        connection: currentServer,
        proxy,
        dbType,
        config,
      });

      const timeoutPromise = new Promise<{ ok: boolean; error?: string; localPort?: number }>((resolve) =>
        setTimeout(() => resolve({ ok: false, error: 'Database connection timed out (15 seconds)' }), 15000)
      );

      const res = await Promise.race([connectPromise, timeoutPromise]);

      if (res.ok) {
        if (dbType === 'sqlite') {
          setLocalPort(0);
        } else if (res.localPort) {
          setLocalPort(res.localPort);
        }
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
    setLastExecutedQuery('');
    setActiveTableName(null);
    setTableColumns([]);
    setTableEditorError(null);
    setEditingRowKey(null);
    setEditingRowValues({});
    setAddingRow(false);
    setNewRowValues({});
    if (dbType === 'sqlite') {
      setSqliteFilePath('');
      onSqliteDisconnect?.();
    }
  };

  const fetchSchema = async () => {
    if (!currentServer || !window.serverOperator) return;
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

  const applyDockerDatabase = (target: DockerDatabaseTarget) => {
    skipNextEngineDefaults.current = true;
    setSelectedDockerDatabaseId(target.id);
    setDbType(target.dbType);
    setHost(target.host);
    setPort(target.port);
    setUsername(target.username);
    setPassword(target.password);
    setDatabase(target.database);
    setError(null);
    setStatus('disconnected');
  };

  const handleRunQuery = async () => {
    await runSqlQuery(queryText);
  };

  const handleMetadataItemClick = (item: string) => {
    if (dbType === 'redis') {
      const query = `GET ${item}`;
      setActiveTableName(null);
      setTableColumns([]);
      setQueryText(query);
      setTimeout(() => {
        handleRunQuery();
      }, 50);
    } else {
      const query = buildTableBrowseQuery(item);
      setActiveTableName(item);
      setEditingRowKey(null);
      setAddingRow(false);
      setNewRowValues({});
      void loadTableColumns(item);
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

  const downloadTextFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportSql = async (mode: ExportMode) => {
    if (!currentServer || !window.serverOperator?.exportDatabaseSql) return;
    setExportLoading(mode);
    setQueryError(null);

    try {
      const res = await window.serverOperator.exportDatabaseSql({ serverId: currentServer.id, mode });
      if (res.ok && res.sql) {
        downloadTextFile(res.sql, res.filename || `database-${mode}.sql`, 'application/sql;charset=utf-8;');
      } else {
        setQueryError(res.error || 'SQL export failed');
      }
    } catch (err: any) {
      setQueryError(err.message || String(err));
    } finally {
      setExportLoading(null);
    }
  };

  const handleImportSqlFile = async (file: File | null) => {
    if (!file || !currentServer || !window.serverOperator?.importDatabaseSql) return;
    setImportLoading(true);
    setImportLog([]);
    setQueryError(null);
    setQueryResult(null);
    setExecutionTime(null);

    try {
      const sql = await file.text();
      const res = await window.serverOperator.importDatabaseSql({ serverId: currentServer.id, sql });
      if (res.ok) {
        setQueryResult([{ result: `Imported ${res.statements || 0} SQL statements from ${file.name}` }]);
        await fetchSchema();
      } else {
        const extra = res.lastStatement ? `\n\nFailed on: ${res.lastStatement}` : '';
        setQueryError((res.error || 'SQL import failed') + extra);
      }
    } catch (err: any) {
      setQueryError(err.message || String(err));
    } finally {
      setImportLoading(false);
      if (importFileInputRef.current) importFileInputRef.current.value = '';
    }
  };

  const handleImportFullSqlFile = async (file: File | null) => {
    if (!file || !currentServer || !window.serverOperator?.importFullDatabaseSql) return;
    setImportLoading(true);
    setImportLog([]);
    setQueryError(null);
    setQueryResult(null);
    setExecutionTime(null);

    try {
      const sql = await file.text();
      const res = await window.serverOperator.importFullDatabaseSql({ serverId: currentServer.id, sql });
      if (res.ok) {
        setQueryResult([{ result: `Imported ${res.statements || 0} SQL statements from ${file.name} (full wipe + import)` }]);
        await fetchSchema();
      } else {
        const extra = res.lastStatement ? `\n\nFailed on: ${res.lastStatement}` : '';
        setQueryError((res.error || 'Full import failed') + extra);
      }
    } catch (err: any) {
      setQueryError(err.message || String(err));
    } finally {
      setImportLoading(false);
      if (importFullFileInputRef.current) importFullFileInputRef.current.value = '';
    }
  };

  const loadCloudinaryBackups = async () => {
    if (!window.serverOperator?.cloudinaryListBackups) return;
    setCloudinaryBackupsLoading(true);
    setCloudinaryBackupsError(null);
    try {
      const res = await window.serverOperator.cloudinaryListBackups();
      if (res.ok) {
        setCloudinaryBackups(res.backups || []);
      } else {
        setCloudinaryBackupsError(res.error || 'Failed to list Cloudinary backups');
      }
    } catch (err: any) {
      setCloudinaryBackupsError(err.message || String(err));
    } finally {
      setCloudinaryBackupsLoading(false);
    }
  };

  const handleBackupToCloudinary = async () => {
    if (!window.serverOperator?.cloudinaryUploadBackup || !window.serverOperator?.exportDatabaseSql) return;
    setCloudinaryUploading(true);
    setCloudinaryMessage(null);
    try {
      const exportRes = await window.serverOperator.exportDatabaseSql({ serverId: currentServer!.id, mode: 'full' });
      if (!exportRes.ok || !exportRes.sql) {
        setCloudinaryMessage({ type: 'error', text: exportRes.error || 'Export failed' });
        return;
      }
      const filename = exportRes.filename || `database-backup-${Date.now()}.sql`;
      const uploadRes = await window.serverOperator.cloudinaryUploadBackup({
        sql: exportRes.sql,
        filename,
        serverName: currentServer?.name || '',
        dbType,
        dbName: database,
      });
      if (uploadRes.ok) {
        setCloudinaryMessage({ type: 'success', text: `Backup uploaded successfully!` });
        setCloudinaryOpen(true);
        loadCloudinaryBackups();
      } else {
        setCloudinaryMessage({ type: 'error', text: uploadRes.error || 'Upload failed' });
      }
    } catch (err: any) {
      setCloudinaryMessage({ type: 'error', text: err.message || String(err) });
    } finally {
      setCloudinaryUploading(false);
    }
  };

  const handleRestoreFromCloudinary = async (publicId: string) => {
    if (!window.serverOperator?.cloudinaryDownloadBackup || !window.serverOperator?.importDatabaseSql) return;
    setCloudinaryRestoring(publicId);
    setCloudinaryMessage(null);
    try {
      const downloadRes = await window.serverOperator.cloudinaryDownloadBackup({ publicId });
      if (!downloadRes.ok || !downloadRes.sql) {
        setCloudinaryMessage({ type: 'error', text: downloadRes.error || 'Download failed' });
        return;
      }
      const importRes = await window.serverOperator.importDatabaseSql({ serverId: currentServer!.id, sql: downloadRes.sql });
      if (importRes.ok) {
        setCloudinaryMessage({ type: 'success', text: `Restored! ${importRes.statements || 0} SQL statements executed.` });
        await fetchSchema();
      } else {
        setCloudinaryMessage({ type: 'error', text: importRes.error || 'Import failed' });
      }
    } catch (err: any) {
      setCloudinaryMessage({ type: 'error', text: err.message || String(err) });
    } finally {
      setCloudinaryRestoring(null);
    }
  };

  const filteredMetadata = dbType === 'redis' 
    ? redisKeys.filter(k => k.toLowerCase().includes(metadataSearch.toLowerCase()))
    : tables.filter(t => t.toLowerCase().includes(metadataSearch.toLowerCase()));

  const isEditableTableView =
    dbType !== 'redis' &&
    !!activeTableName &&
    !!queryResult;

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

  const beginEditRow = (row: Record<string, any>) => {
    const values = Object.fromEntries(Object.keys(row).map((key) => {
      const column = tableColumns.find((c) => c.name === key);
      return [key, row[key] === null || row[key] === undefined ? 'NULL' : formatCellValueForEdit(row[key], column?.type)];
    }));
    setEditingRowKey(rowIdentityKey(row));
    setEditingRowValues(values);
    setAddingRow(false);
  };

  const cancelEditRow = () => {
    setEditingRowKey(null);
    setEditingRowValues({});
  };

  const beginAddRow = () => {
    const values = Object.fromEntries(tableColumns.map((column) => [column.name, '']));
    setAddingRow(true);
    setNewRowValues(values);
    setEditingRowKey(null);
  };

  const cancelAddRow = () => {
    setAddingRow(false);
    setNewRowValues({});
  };

  const refreshActiveTable = async () => {
    if (!activeTableName) return;
    await runSqlQuery(buildTableBrowseQuery(activeTableName), { keepEditorText: true });
  };

  const saveEditedRow = async (originalRow: Record<string, any>) => {
    if (!currentServer || !activeTableName) return;
    const setClause = tableColumns
      .map((column) => `${quoteIdentifier(column.name)} = ${sqlValueLiteral(parseCellInputValue(editingRowValues[column.name] ?? ''))}`)
      .join(', ');
    const whereClause = buildRowPredicate(originalRow);
    if (!whereClause) {
      setQueryError('Cannot update row without a stable row identity.');
      return;
    }

    setRowMutationLoading(true);
    try {
      const query = `UPDATE ${quoteIdentifier(activeTableName)} SET ${setClause} WHERE ${whereClause};`;
      const res = await window.serverOperator!.queryDatabase({ serverId: currentServer.id, query });
      if (!res.ok) {
        setQueryError(res.error || 'Failed to update row');
        return;
      }
      cancelEditRow();
      await refreshActiveTable();
    } finally {
      setRowMutationLoading(false);
    }
  };

  const deleteRow = async (row: Record<string, any>) => {
    if (!currentServer || !activeTableName) return;
    const whereClause = buildRowPredicate(row);
    if (!whereClause) {
      setQueryError('Cannot delete row without a stable row identity.');
      return;
    }
    if (!window.confirm('Delete this row? This action cannot be undone.')) return;

    setRowMutationLoading(true);
    try {
      const query = `DELETE FROM ${quoteIdentifier(activeTableName)} WHERE ${whereClause};`;
      const res = await window.serverOperator!.queryDatabase({ serverId: currentServer.id, query });
      if (!res.ok) {
        setQueryError(res.error || 'Failed to delete row');
        return;
      }
      await refreshActiveTable();
    } finally {
      setRowMutationLoading(false);
    }
  };

  const insertRow = async () => {
    if (!currentServer || !activeTableName) return;
    const columns = tableColumns.filter((column) => {
      const raw = newRowValues[column.name] ?? '';
      return raw.trim() !== '' || !column.isPrimary;
    });
    if (!columns.length) {
      setQueryError('Enter at least one value before inserting a row.');
      return;
    }

    const names = columns.map((column) => quoteIdentifier(column.name)).join(', ');
    const values = columns.map((column) => sqlValueLiteral(parseCellInputValue(newRowValues[column.name] ?? ''))).join(', ');

    setRowMutationLoading(true);
    try {
      const query = `INSERT INTO ${quoteIdentifier(activeTableName)} (${names}) VALUES (${values});`;
      const res = await window.serverOperator!.queryDatabase({ serverId: currentServer.id, query });
      if (!res.ok) {
        setQueryError(res.error || 'Failed to insert row');
        return;
      }
      cancelAddRow();
      await refreshActiveTable();
    } finally {
      setRowMutationLoading(false);
    }
  };

  if (!currentServer) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center text-text-secondary text-xs font-sans gap-3 bg-bg-primary select-none">
        <ServerIcon size={32} className="text-text-muted animate-pulse" />
        <p>Please select an active SSH server from the sidebar to establish database tunnels.</p>
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col bg-bg-primary text-text-primary min-h-0 overflow-hidden font-sans">
      {/* Top Header Controls bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-border/20 bg-bg-secondary/35 px-6 py-4 gap-4 shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-bg-tertiary text-accent border border-border/15 shrink-0">
            <Database size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text-primary">Database Tunnel Manager</h2>
              {status === 'connected' ? (
                dbType === 'sqlite' ? (
                  <span className="inline-flex items-center gap-1.5 text-[9px] font-extrabold bg-success/10 text-success border border-success/20 px-2.5 py-0.5 rounded-xl uppercase tracking-wider animate-pulse">
                    <Database size={10} /> SQLite Open
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[9px] font-extrabold bg-success/10 text-success border border-success/20 px-2.5 py-0.5 rounded-xl uppercase tracking-wider animate-pulse">
                    <Wifi size={10} /> Active Tunnel (LPort: {localPort})
                  </span>
                )
              ) : status === 'connecting' ? (
                <span className="inline-flex items-center gap-1.5 text-[9px] font-extrabold bg-warning/10 text-warning border border-warning/20 px-2.5 py-0.5 rounded-xl uppercase tracking-wider animate-pulse">
                  <RefreshCw size={10} className="animate-spin" /> Forwarding...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[9px] font-extrabold bg-bg-tertiary border border-border/30 text-text-muted px-2.5 py-0.5 rounded-xl uppercase tracking-wider">
                  <WifiOff size={10} /> Disconnected
                </span>
              )}
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5">{currentServer.name} — {currentServer.username}@{currentServer.host}</p>
          </div>
        </div>
      </div>

      {activeView === 'database' && typeof document !== 'undefined' && document.getElementById('database-sidebar-panel') && createPortal(
        <div className="flex flex-col min-h-0 h-full">
          {/* Connection settings form */}
          {status !== 'connected' && status !== 'connecting' ? (
            <form onSubmit={handleConnect} className="p-4 border-b border-border/20 flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Docker Databases</h3>
                  <button
                    type="button"
                    onClick={refreshDockerDatabases}
                    disabled={dockerDatabasesLoading}
                    className="p-1 rounded-md text-text-secondary hover:bg-bg-tertiary disabled:opacity-50 cursor-pointer"
                    title="Refresh Docker databases"
                  >
                    <RefreshCw size={12} className={dockerDatabasesLoading ? 'animate-spin text-accent' : ''} />
                  </button>
                </div>

                {dockerDatabasesError ? (
                  <div className="p-2.5 rounded-xl bg-error/10 border border-error/20 text-error text-[11px] leading-relaxed">
                    {dockerDatabasesError}
                  </div>
                ) : dockerDatabasesLoading && dockerDatabases.length === 0 ? (
                  <div className="p-3 rounded-xl border border-border/20 bg-bg-primary/35 text-[11px] text-text-muted text-center">
                    Scanning Docker containers...
                  </div>
                ) : dockerDatabases.length === 0 ? (
                  <div className="p-3 rounded-xl border border-border/20 bg-bg-primary/35 text-[11px] text-text-muted text-center">
                    No Docker database containers detected.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {dockerDatabases.map((target) => {
                      const active = selectedDockerDatabaseId === target.id;
                      const sourceLabel = target.source === 'published-port'
                        ? 'published'
                        : target.source === 'container-ip'
                          ? 'container IP'
                          : 'default';
                      return (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => applyDockerDatabase(target)}
                          className={`w-full text-left rounded-xl border px-3 py-2 transition-all cursor-pointer ${
                            active
                              ? 'border-accent/50 bg-accent/10'
                              : 'border-border/20 bg-bg-primary/35 hover:bg-bg-tertiary/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-text-primary truncate">{target.name}</span>
                            <span className="text-[9px] uppercase font-extrabold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-md">
                              {target.dbType}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] font-mono text-text-muted truncate">
                            {target.host}:{target.port} · {sourceLabel}
                          </div>
                          <div className="mt-0.5 text-[10px] text-text-secondary truncate">
                            {target.image || 'unknown image'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Connection Settings</h3>
              
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-0.5" htmlFor="engine-select">DB Engine</label>
                <Select
                  value={dbType}
                  onChange={(val) => setDbType(val as any)}
                  options={[
                    { value: 'mysql', label: 'MySQL' },
                    { value: 'postgres', label: 'PostgreSQL' },
                    { value: 'redis', label: 'Redis' },
                    { value: 'sqlite', label: 'SQLite (remote file)' },
                  ]}
                />
              </div>

              {dbType === 'sqlite' ? (
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-0.5" htmlFor="sqlite-path-input">SQLite File Path (on server)</label>
                  <input
                    id="sqlite-path-input"
                    type="text"
                    value={sqliteFilePath}
                    onChange={(e) => setSqliteFilePath(e.target.value)}
                    placeholder="/var/data/app.db"
                    className="w-full px-3 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 flex flex-col gap-1">
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-0.5" htmlFor="host-input">Host</label>
                      <input
                        id="host-input"
                        type="text"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        className="w-full px-3 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-0.5" htmlFor="port-input">Port</label>
                      <input
                        id="port-input"
                        type="text"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        className="w-full px-3 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none"
                      />
                    </div>
                  </div>

                  {dbType !== 'redis' && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-0.5" htmlFor="user-input">Username</label>
                      <input
                        id="user-input"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-3 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-0.5" htmlFor="pass-input">Password</label>
                    <div className="relative flex items-center">
                      <input
                        id="pass-input"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Optional"
                        className="w-full px-3 py-1.5 pr-10 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 text-text-secondary hover:text-text-primary focus:outline-none cursor-pointer"
                      >
                        {showPassword ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-extrabold uppercase tracking-wider text-text-muted mb-0.5" htmlFor="db-input">
                      {dbType === 'redis' ? 'DB Index' : 'Database'}
                    </label>
                    <input
                      id="db-input"
                      type="text"
                      value={database}
                      onChange={(e) => setDatabase(e.target.value)}
                      placeholder={dbType === 'redis' ? '0' : 'Database Name'}
                      className="w-full px-3 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full mt-3 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-sm"
              >
                {dbType === 'sqlite' ? 'Open SQLite File' : 'Establish DB Tunnel'}
              </button>

              {status === 'error' && error && (
                <div className="mt-2 p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex gap-1.5 items-start font-mono break-all select-text">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </form>
          ) : (
            <div className="p-4 border-b border-border/20 flex flex-col gap-2 bg-bg-tertiary/20 select-text">
              <div className="flex justify-between items-center select-none">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Connected Engine</h3>
                <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-extrabold uppercase bg-accent/15 text-accent border border-accent/20">
                  {dbType}
                </span>
              </div>
              <p className="text-xs font-mono text-text-primary break-all mt-1 leading-relaxed">
                {dbType === 'sqlite' ? (
                  <>File: {sqliteFilePath || '—'}</>
                ) : (
                  <>Target: {host}:{port} {database && <><br />DB: {database}</>}</>
                )}
              </p>
              <button
                type="button"
                onClick={handleDisconnect}
                className="w-full py-2 bg-error/15 hover:bg-error hover:text-white border border-error/25 hover:border-transparent text-error text-xs font-semibold rounded-xl transition-all cursor-pointer mt-2 select-none"
              >
                {dbType === 'sqlite' ? 'Close SQLite File' : 'Disconnect DB Tunnel'}
              </button>
            </div>
          )}

          {/* Schema Explorer */}
          {status === 'connected' && (
            <div className="flex-grow flex flex-col min-h-[200px]">
              <div className="p-4 pb-2 flex justify-between items-center select-none">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                  {dbType === 'redis' ? 'Keys Explorer' : 'Tables Explorer'}
                </h3>
                <button
                  type="button"
                  onClick={fetchSchema}
                  disabled={metadataLoading}
                  className="p-1 rounded-md text-text-secondary hover:bg-bg-tertiary disabled:opacity-50 cursor-pointer"
                  title="Reload Schema"
                >
                  <RefreshCw size={12} className={metadataLoading ? 'animate-spin text-accent' : ''} />
                </button>
              </div>

              {/* Search filter for explorer list */}
              <div className="px-4 mb-3 relative select-none">
                <Search size={12} className="absolute left-7 top-2.5 text-text-muted" />
                <input
                  type="text"
                  placeholder={dbType === 'redis' ? 'Filter keys…' : 'Filter tables…'}
                  value={metadataSearch}
                  onChange={(e) => setMetadataSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-border/30 bg-bg-primary/50 rounded-xl text-xs text-text-primary focus:outline-none focus:border-accent"
                />
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto px-2 pb-4 select-text">
                {metadataLoading && filteredMetadata.length === 0 ? (
                  <div className="text-center py-8 text-xs text-text-muted select-none">
                    Loading database outline…
                  </div>
                ) : filteredMetadata.length === 0 ? (
                  <div className="text-center py-8 text-xs text-text-muted select-none">
                    {metadataSearch ? 'No matches found.' : (dbType === 'redis' ? 'No keys detected.' : 'No public tables detected.')}
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {filteredMetadata.map((item) => (
                      <li key={item}>
                        <button
                          type="button"
                          onClick={() => handleMetadataItemClick(item)}
                          className="w-full text-left px-3 py-1.5 rounded-xl text-xs font-mono text-text-primary hover:bg-bg-tertiary/50 hover:text-accent transition-all duration-150 truncate flex items-center gap-1.5 cursor-pointer"
                          title={item}
                        >
                          <ChevronRight size={10} className="text-text-secondary shrink-0" />
                          <span className="truncate">{item}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Cloudinary Backups */}
          <div className="border-t border-border/20">
            <button
              type="button"
              onClick={() => {
                setCloudinaryOpen((o) => !o);
                if (!cloudinaryOpen && cloudinaryBackups.length === 0) loadCloudinaryBackups();
              }}
              className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-bg-tertiary/30 transition-colors cursor-pointer select-none"
            >
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                <Cloud size={12} />
                Cloudinary Backups
              </span>
              <div className="flex items-center gap-2">
                {cloudinaryBackups.length > 0 && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/20">
                    {cloudinaryBackups.length}
                  </span>
                )}
                <ChevronDown size={12} className={`text-text-secondary transition-transform ${cloudinaryOpen ? '' : '-rotate-90'}`} />
              </div>
            </button>
            {cloudinaryOpen && (
              <div className="px-4 pb-4 space-y-2">
                <button
                  type="button"
                  onClick={loadCloudinaryBackups}
                  disabled={cloudinaryBackupsLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/30 bg-bg-primary/50 text-text-primary text-[10px] font-semibold hover:border-border/60 hover:bg-bg-tertiary disabled:opacity-50 cursor-pointer transition-all w-full justify-center"
                >
                  {cloudinaryBackupsLoading ? <RefreshCw size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                  Refresh
                </button>

                {cloudinaryBackupsError && (
                  <p className="text-[10px] text-error font-mono bg-error/10 p-2 rounded-lg">{cloudinaryBackupsError}</p>
                )}

                {cloudinaryBackups.length === 0 && !cloudinaryBackupsLoading && !cloudinaryBackupsError && (
                  <p className="text-[10px] text-text-muted text-center py-4 italic">
                    No Cloudinary backups found. Configure Cloudinary in Settings, then use "Get Backup".
                  </p>
                )}

                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {cloudinaryBackups.map((backup) => (
                    <div
                      key={backup.publicId}
                      className="rounded-lg border border-border/20 bg-bg-primary/40 p-2.5 text-[10px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-text-primary truncate" title={backup.filename}>
                            {backup.filename}
                          </p>
                          <p className="text-text-muted mt-0.5">
                            {backup.serverName && `${backup.serverName} · `}
                            {backup.dbType && `${backup.dbType} · `}
                            {backup.dbName && `${backup.dbName} · `}
                            {backup.createdAt && new Date(backup.createdAt).toLocaleDateString()}
                          </p>
                          <p className="text-text-muted">
                            {backup.size ? `${(backup.size / 1024).toFixed(1)} KB` : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRestoreFromCloudinary(backup.publicId)}
                          disabled={cloudinaryRestoring === backup.publicId}
                          className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg bg-warning/15 text-warning text-[9px] font-semibold hover:bg-warning/25 disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          {cloudinaryRestoring === backup.publicId ? <RefreshCw size={9} className="animate-spin" /> : <Download size={9} />}
                          Restore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {cloudinaryMessage && (
                  <div className={`p-2 rounded-lg text-[10px] font-mono ${
                    cloudinaryMessage.type === 'success' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                  }`}>
                    {cloudinaryMessage.text}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.getElementById('database-sidebar-panel')!
      )}

      {/* Query Editor & Result Grid Workspace */}
      <div className="flex-1 flex flex-col min-h-0 bg-bg-primary">
          {status !== 'connected' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-text-secondary text-xs font-sans gap-2.5 p-6 text-center select-none max-w-lg mx-auto">
              <Database size={24} className="text-accent/60 animate-pulse mb-1" />
              <p className="font-bold text-text-primary text-sm">SSH Tunnel Required</p>
              <p className="text-text-muted leading-relaxed">
                Connect your remote database engine using the parameters on the left. Traffic will route locally over active port forward encryptions.
              </p>
            </div>
          ) : (
            <div className="flex-grow flex flex-col min-h-0">
              {/* Query input editor */}
              <div className="border-b border-border/20 p-4 flex flex-col gap-3 shrink-0">
                {dbType === 'redis' ? (
                  <>
                    <div className="flex flex-wrap justify-between items-center gap-2 select-none">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                        Redis Console
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQueryText('')}
                          className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary rounded-lg transition-all cursor-pointer font-semibold"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          onClick={handleRunQuery}
                          disabled={queryLoading || !queryText.trim()}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-xl disabled:opacity-40 cursor-pointer shadow-sm transition-all"
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
                      className="w-full h-24 p-3 border border-border/30 bg-bg-secondary/40 rounded-xl font-mono text-xs text-text-primary focus:outline-none focus:border-accent resize-none select-text"
                    />
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap justify-between items-center gap-2 select-none">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                        SQL Command Workspace
                      </h3>
                      {dbType !== 'sqlite' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={importFileInputRef}
                            type="file"
                            accept=".sql,application/sql,text/sql,text/plain"
                            className="hidden"
                            onChange={(e) => handleImportSqlFile(e.target.files?.[0] || null)}
                          />
                          <input
                            ref={importFullFileInputRef}
                            type="file"
                            accept=".sql,application/sql,text/sql,text/plain"
                            className="hidden"
                            onChange={(e) => handleImportFullSqlFile(e.target.files?.[0] || null)}
                          />
                          <button
                            type="button"
                            onClick={() => importFileInputRef.current?.click()}
                            disabled={importLoading || !!exportLoading}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold border border-warning/35 bg-warning/10 text-warning hover:bg-warning/15 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {importLoading ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} className="rotate-180" />}
                            Import SQL
                          </button>
                          <button
                            type="button"
                            onClick={() => importFullFileInputRef.current?.click()}
                            disabled={importLoading || !!exportLoading}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold border border-error/35 bg-error/10 text-error hover:bg-error/15 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {importLoading ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} className="rotate-180" />}
                            Import Full SQL
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportSql('schema')}
                            disabled={!!exportLoading || importLoading}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold border border-border/30 bg-bg-secondary hover:bg-bg-tertiary rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {exportLoading === 'schema' ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} />}
                            Export Schema
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportSql('data')}
                            disabled={!!exportLoading || importLoading}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold border border-border/30 bg-bg-secondary hover:bg-bg-tertiary rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {exportLoading === 'data' ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} />}
                            Export Data
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportSql('full')}
                            disabled={!!exportLoading || importLoading}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold border border-accent/35 bg-accent/10 text-accent hover:bg-accent/15 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {exportLoading === 'full' ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} />}
                            Export Full
                          </button>
                          <button
                            type="button"
                            onClick={handleBackupToCloudinary}
                            disabled={!!cloudinaryUploading || !!exportLoading || importLoading}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold border border-sky-500/35 bg-sky-500/10 text-sky-400 hover:bg-sky-500/15 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            {cloudinaryUploading ? <RefreshCw size={10} className="animate-spin" /> : <Cloud size={10} />}
                            Get Backup
                          </button>
                        </div>
                      )}
                    </div>

                    {importLog.length > 0 && (
                      <div className="border border-border/20 bg-bg-tertiary/30 rounded-xl overflow-hidden shadow-sm mb-2">
                        <div className="max-h-24 overflow-y-auto p-2 text-[10px] font-mono text-text-muted leading-relaxed select-text">
                          {importLog.map((line, i) => (
                            <div key={i} className={line.startsWith('Error') ? 'text-error' : line.includes('complete') ? 'text-success' : ''}>{line}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border border-border/20 bg-bg-secondary/35 rounded-xl overflow-hidden flex flex-col shadow-sm">
                      <div className="h-36">
                        <Editor
                          height="100%"
                          language="sql"
                          theme={monacoTheme}
                          value={queryText}
                          onChange={(val) => setQueryText(val || '')}
                          options={{
                            minimap: { enabled: false },
                            contextmenu: false,
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
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/20 px-4 py-2.5 bg-bg-secondary/45 text-xs select-none">
                        <div className="min-w-0 flex items-center gap-3">
                          {executionTime !== null && filteredResults && (
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono text-text-secondary">
                              <span>Duration: <strong className="text-text-primary">{executionTime}ms</strong></span>
                              <span className="w-[1px] h-3 bg-border/20" />
                              <span>Total Rows: <strong className="text-text-primary">{filteredResults.length}</strong></span>
                              <span className="w-[1px] h-3 bg-border/20" />
                              <span>Page: <strong className="text-text-primary">{activePage}/{totalPages}</strong></span>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setQueryText('')}
                            className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary rounded-lg transition-all cursor-pointer font-semibold whitespace-nowrap"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={handleRunQuery}
                            disabled={queryLoading || !queryText.trim()}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-xl disabled:opacity-40 cursor-pointer shadow-sm transition-all whitespace-nowrap"
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
                  <div className="p-3 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex gap-1.5 items-start font-mono select-text">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5 text-error" />
                    <span>{queryError}</span>
                  </div>
                )}
                {tableEditorError && (
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-warning text-xs flex gap-1.5 items-start font-mono select-text">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5 text-warning" />
                    <span>{tableEditorError}</span>
                  </div>
                )}
              </div>

              {/* Query Results View Grid */}
              <div className="flex-grow flex flex-col min-h-0">
                {/* Results controls */}
                {filteredResults && (
                  <div className="border-b border-border/20 px-4 py-2.5 bg-bg-secondary/35 flex flex-wrap items-center justify-between gap-3 shrink-0 select-none">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-text-primary">Query Output</h4>
                      <span className="text-[9px] font-extrabold px-2 py-0.5 bg-bg-tertiary border border-border/30 rounded-xl text-text-secondary font-sans uppercase tracking-wider">
                        {filteredResults.length} records
                      </span>
                      {isEditableTableView && activeTableName && (
                        <span className="text-[9px] font-extrabold px-2 py-0.5 bg-accent/10 border border-accent/20 rounded-xl text-accent font-sans uppercase tracking-wider">
                          Editable: {activeTableName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isEditableTableView && tableColumns.length > 0 && (
                        <button
                          type="button"
                          onClick={beginAddRow}
                          disabled={addingRow || rowMutationLoading}
                          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border border-accent/35 bg-accent/10 text-accent hover:bg-accent/15 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Plus size={10} /> Add Row
                        </button>
                      )}
                      {/* Filter records input */}
                      <div className="relative">
                        <Search size={10} className="absolute left-2.5 top-2.5 text-text-muted" />
                        <input
                          type="text"
                          placeholder="Filter rows…"
                          value={resultsSearch}
                          onChange={(e) => setResultsSearch(e.target.value)}
                          className="pl-6.5 pr-2.5 py-1 border border-border/30 bg-bg-primary/50 rounded-xl text-[10px] text-text-primary w-36 focus:outline-none focus:border-accent"
                        />
                      </div>
                      
                      <button
                        type="button"
                        onClick={exportQueryResultToCSV}
                        disabled={filteredResults.length === 0}
                        className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold border border-border/30 bg-bg-secondary hover:bg-bg-tertiary rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <Download size={10} /> Export CSV
                      </button>
                    </div>
                  </div>
                )}

                {/* Spreadsheet-like Table Grid */}
                <div className="flex-1 overflow-auto min-h-0 bg-bg-primary">
                  {!filteredResults ? (
                    <div className="h-full flex flex-col items-center justify-center text-text-secondary text-xs p-6 text-center font-sans select-none max-w-sm mx-auto gap-2">
                      <HelpCircle size={18} className="text-text-muted" />
                      <p className="font-semibold text-text-primary">Console is Ready</p>
                      <p className="text-[10px] text-text-muted leading-relaxed">
                        Input commands inside the query workspace above or double-click items in the schema list to run select statements.
                      </p>
                    </div>
                  ) : filteredResults.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-text-muted text-xs p-6 font-sans italic select-none">
                      No records returned. (Statement completed successfully, 0 rows returned)
                    </div>
                  ) : (
                    <table className="w-full border-collapse text-left font-mono text-[11px] leading-relaxed select-text">
                      <thead>
                        <tr className="border-b border-border/20 bg-bg-secondary/35 text-text-secondary sticky top-0 z-10 select-none">
                          <th className="px-3.5 py-2 font-bold border-r border-border/20">#</th>
                          {isEditableTableView && (
                            <th className="px-3.5 py-2 font-bold border-r border-border/20 whitespace-nowrap">Actions</th>
                          )}
                          {Object.keys(filteredResults[0]).map((header) => (
                            <th key={header} className="px-3.5 py-2 font-bold border-r border-border/20 max-w-xs truncate" title={header}>
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/10 text-text-primary">
                        {isEditableTableView && addingRow && tableColumns.length > 0 && (
                          <tr className="bg-accent/5 border-b border-accent/10">
                            <td className="px-3.5 py-2 border-r border-border/10 text-text-muted select-none">New</td>
                            <td className="px-3.5 py-2 border-r border-border/10">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={insertRow}
                                  disabled={rowMutationLoading}
                                  className="p-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors cursor-pointer"
                                  title="Insert row"
                                >
                                  {rowMutationLoading ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelAddRow}
                                  disabled={rowMutationLoading}
                                  className="p-1.5 rounded-lg bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50 transition-colors cursor-pointer"
                                  title="Cancel"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </td>
                            {tableColumns.map((column) => (
                              <td key={column.name} className="px-3.5 py-2 border-r border-border/10 align-top">
                                <input
                                  type="text"
                                  value={newRowValues[column.name] ?? ''}
                                  onChange={(e) => setNewRowValues((prev) => ({ ...prev, [column.name]: e.target.value }))}
                                  placeholder={column.nullable ? 'NULL' : column.type || column.name}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-bg-primary/60 border border-border/20 text-[10px] text-text-primary focus:outline-none focus:border-accent"
                                />
                              </td>
                            ))}
                          </tr>
                        )}
                        {displayResults && displayResults.map((row, idx) => {
                          const rowNum = dbType === 'redis' 
                            ? idx + 1 
                            : (activePage - 1) * pageSize + idx + 1;
                          const rowKey = rowIdentityKey(row);
                          const isEditing = editingRowKey === rowKey;
                          return (
                            <tr key={idx} className="hover:bg-bg-tertiary/20 transition-colors duration-150">
                              <td className="px-3.5 py-1.5 border-r border-border/10 text-text-muted select-none">
                                {rowNum}
                              </td>
                              {isEditableTableView && (
                                <td className="px-3.5 py-1.5 border-r border-border/10 align-top select-none">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => saveEditedRow(row)}
                                        disabled={rowMutationLoading}
                                        className="p-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors cursor-pointer"
                                        title="Save row"
                                      >
                                        {rowMutationLoading ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={cancelEditRow}
                                        disabled={rowMutationLoading}
                                        className="p-1.5 rounded-lg bg-bg-secondary text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50 transition-colors cursor-pointer"
                                        title="Cancel"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => beginEditRow(row)}
                                        disabled={rowMutationLoading}
                                        className="p-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors cursor-pointer"
                                        title="Edit row"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteRow(row)}
                                        disabled={rowMutationLoading}
                                        className="p-1.5 rounded-lg bg-error/15 text-error hover:bg-error/25 disabled:opacity-50 transition-colors cursor-pointer"
                                        title="Delete row"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              )}
                              {Object.keys(filteredResults[0]).map((header) => {
                                const val = row[header];
                                const renderVal = val === null || val === undefined 
                                  ? <span className="text-text-muted italic">NULL</span>
                                  : typeof val === 'object' 
                                    ? JSON.stringify(val) 
                                    : String(val);
                                
                                return (
                                  <td key={header} className="px-3.5 py-1.5 border-r border-border/10 truncate max-w-md" title={String(renderVal)}>
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={editingRowValues[header] ?? ''}
                                        onChange={(e) => setEditingRowValues((prev) => ({ ...prev, [header]: e.target.value }))}
                                        placeholder="NULL"
                                        className="w-full px-2.5 py-1.5 rounded-lg bg-bg-primary/60 border border-border/20 text-[10px] text-text-primary focus:outline-none focus:border-accent"
                                      />
                                    ) : renderVal}
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
                  <div className="border-t border-border/20 px-4 py-2 bg-bg-secondary/45 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs text-text-secondary font-sans select-none">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span>Page Limit:</span>
                        <Select
                          value={String(pageSize)}
                          onChange={(val) => {
                            setPageSize(Number(val));
                            setCurrentPage(1);
                          }}
                          size="sm"
                          containerClassName="w-20"
                          options={[
                            { value: '10', label: '10' },
                            { value: '25', label: '25' },
                            { value: '50', label: '50' },
                            { value: '100', label: '100' },
                          ]}
                        />
                      </div>
                      <span>
                        Showing <strong className="text-text-primary">{(activePage - 1) * pageSize + 1}</strong> to{' '}
                        <strong className="text-text-primary font-semibold">
                          {Math.min(activePage * pageSize, totalRows)}
                        </strong>{' '}
                        of <strong className="text-text-primary">{totalRows}</strong> rows
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCurrentPage(1)}
                        disabled={activePage === 1}
                        className="px-3 py-1.5 border border-border/30 hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent rounded-xl text-xs transition-colors cursor-pointer font-semibold shadow-xs"
                        title="First Page"
                      >
                        First
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={activePage === 1}
                        className="px-3 py-1.5 border border-border/30 hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent rounded-xl text-xs transition-colors cursor-pointer font-semibold shadow-xs"
                        title="Previous Page"
                      >
                        Prev
                      </button>
                      <span className="px-2.5 font-mono text-text-primary font-bold">
                        {activePage} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={activePage === totalPages}
                        className="px-3 py-1.5 border border-border/30 hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent rounded-xl text-xs transition-colors cursor-pointer font-semibold shadow-xs"
                        title="Next Page"
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={activePage === totalPages}
                        className="px-3 py-1.5 border border-border/30 hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent rounded-xl text-xs transition-colors cursor-pointer font-semibold shadow-xs"
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
  );
}
