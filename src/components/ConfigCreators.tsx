import { useState, useRef, useEffect } from 'react';
import { Copy, Plus, Trash2, FileCode, Box, Server, Shield, Sparkles, Key, Loader2, Mic, Square, FolderTree, Send } from 'lucide-react';
import type { ServerConnection, ProxySettings } from '../types';
import { loadProjectContext } from '../utils/loadProjectContext';

const GROQ_API_KEY_STORAGE = 'server-operator:groq-api-key';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo';
const GROQ_TRANSCRIPTIONS_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

function loadGroqApiKey(): string {
  try {
    return localStorage.getItem(GROQ_API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

function saveGroqApiKey(key: string) {
  try {
    localStorage.setItem(GROQ_API_KEY_STORAGE, key);
  } catch {
    // ignore
  }
}

/** Free voice-to-text via Groq Whisper (works in Electron). Same API key as LLM. */
async function transcribeWithGroq(apiKey: string, audioBlob: Blob): Promise<{ text: string; error?: string }> {
  const form = new FormData();
  form.append('file', audioBlob, 'audio.webm');
  form.append('model', GROQ_WHISPER_MODEL);
  form.append('response_format', 'text');
  try {
    const res = await fetch(GROQ_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      body: form,
    });
    if (!res.ok) {
      const err = await res.text();
      return { text: '', error: err || `Groq transcription failed (${res.status})` };
    }
    const text = await res.text();
    return { text: (text || '').trim() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: '', error: msg };
  }
}

/** Build system message with optional project context. */
function buildSystemMessage(
  configType: 'compose' | 'dockerfile' | 'nginx' | 'apache',
  contextText: string
): string {
  const typeDesc =
    configType === 'compose'
      ? 'docker-compose.yml (YAML, version 3.8, services with image/build, ports, env, volumes)'
      : configType === 'dockerfile'
        ? 'a Dockerfile (FROM, WORKDIR, COPY, RUN, EXPOSE, CMD)'
        : configType === 'nginx'
          ? 'nginx server block(s) (server { listen; server_name; root or proxy_pass; ssl if HTTPS })'
          : 'Apache 2.4 VirtualHost(s) (ServerName, DocumentRoot, Directory, SSLEngine if HTTPS)';
  let sys = `You are a DevOps assistant. Generate only the raw configuration file content. No markdown code fences, no explanation before or after. Output exactly what should be written to the file. Type: ${typeDesc}.`;
  if (contextText.trim()) {
    sys += `\n\nProject context (e.g. file tree or structure) the user is working with:\n${contextText.trim()}`;
  }
  return sys;
}

async function generateConfigWithGroq(
  apiKey: string,
  configType: 'compose' | 'dockerfile' | 'nginx' | 'apache',
  conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
  contextText: string
): Promise<{ content: string; error?: string }> {
  const systemContent = buildSystemMessage(configType, contextText);
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemContent },
    ...conversationMessages,
  ];
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 2048,
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    return { content: '', error: `Groq API: ${res.status} ${err}` };
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  const content = text.replace(/^```(?:yaml|yml|dockerfile|nginx|apache|conf)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return { content, error: content ? undefined : 'No content returned' };
}

type CreatorTabId = 'compose' | 'dockerfile' | 'nginx' | 'apache';
type CreatorMode = 'form' | 'ai';

// ----- Docker Compose Creator -----
interface ComposeService {
  name: string;
  image: string;
  build: string;
  ports: string;
  env: string;
  volumes: string;
  restart: string;
}

function defaultComposeService(): ComposeService {
  return { name: '', image: '', build: '', ports: '', env: '', volumes: '', restart: 'unless-stopped' };
}

function generateCompose(version: string, services: ComposeService[]): string {
  const lines: string[] = [`version: '${version}'`, '', 'services:'];
  for (const s of services) {
    if (!s.name.trim()) continue;
    lines.push(`  ${s.name.trim().replace(/[^a-z0-9_-]/gi, '_')}:`);
    if (s.image.trim()) lines.push(`    image: ${s.image.trim()}`);
    if (s.build.trim()) lines.push(`    build: ${s.build.trim()}`);
    if (s.ports.trim()) {
      const ports = s.ports.split(/[\n,]/).map((p) => p.trim()).filter(Boolean);
      if (ports.length === 1) lines.push(`    ports:\n      - "${ports[0]}"`);
      else if (ports.length > 1) {
        lines.push('    ports:');
        ports.forEach((p) => lines.push(`      - "${p}"`));
      }
    }
    if (s.env.trim()) {
      const envs = s.env.split('\n').map((e) => e.trim()).filter(Boolean);
      if (envs.length > 0) {
        lines.push('    environment:');
        envs.forEach((e) => lines.push(`      - ${e}`));
      }
    }
    if (s.volumes.trim()) {
      const vols = s.volumes.split('\n').map((v) => v.trim()).filter(Boolean);
      if (vols.length > 0) {
        lines.push('    volumes:');
        vols.forEach((v) => lines.push(`      - ${v}`));
      }
    }
    if (s.restart) lines.push(`    restart: ${s.restart}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ----- Dockerfile Creator -----
interface DockerfileStep {
  type: 'FROM' | 'WORKDIR' | 'COPY' | 'ADD' | 'RUN' | 'ENV' | 'EXPOSE' | 'CMD' | 'ENTRYPOINT';
  value: string;
}

function generateDockerfile(steps: DockerfileStep[]): string {
  return steps.map((s) => (s.type === 'RUN' || s.type === 'CMD' || s.type === 'ENTRYPOINT' ? `${s.type} ${s.value}` : `${s.type} ${s.value}`)).join('\n');
}

// ----- NGINX Creator -----
interface NginxServer {
  type: 'http' | 'https';
  serverName: string;
  port: string;
  root: string;
  index: string;
  sslCert?: string;
  sslKey?: string;
  proxyPass?: string;
}

function generateNginx(servers: NginxServer[]): string {
  const lines: string[] = [];
  for (const s of servers) {
    lines.push('server {');
    lines.push(`    listen ${s.port} ${s.type === 'https' ? 'ssl' : ''};`);
    lines.push(`    server_name ${s.serverName || '_'};`);
    if (s.type === 'https' && s.sslCert) {
      lines.push(`    ssl_certificate ${s.sslCert};`);
      if (s.sslKey) lines.push(`    ssl_certificate_key ${s.sslKey};`);
    }
    if (s.proxyPass) {
      lines.push('    location / {');
      lines.push(`        proxy_pass ${s.proxyPass};`);
      lines.push('        proxy_http_version 1.1;');
      lines.push('        proxy_set_header Host $host;');
      lines.push('        proxy_set_header X-Real-IP $remote_addr;');
      lines.push('    }');
    } else {
      lines.push(`    root ${s.root || '/var/www/html'};`);
      lines.push(`    index ${s.index || 'index.html'};`);
      lines.push('    location / { try_files $uri $uri/ =404; }');
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}

// ----- Apache Creator -----
interface ApacheVhost {
  type: 'http' | 'https';
  serverName: string;
  documentRoot: string;
  port: string;
  sslCert?: string;
  sslKey?: string;
}

function generateApache(vhosts: ApacheVhost[]): string {
  const lines: string[] = [];
  for (const v of vhosts) {
    const docRoot = v.documentRoot || '/var/www/html';
    lines.push(`<VirtualHost *:${v.port}>`);
    lines.push(`    ServerName ${v.serverName || 'localhost'}`);
    lines.push(`    DocumentRoot ${docRoot}`);
    if (v.type === 'https') {
      lines.push('    SSLEngine on');
      if (v.sslCert) lines.push(`    SSLCertificateFile ${v.sslCert}`);
      if (v.sslKey) lines.push(`    SSLCertificateKeyFile ${v.sslKey}`);
    }
    lines.push(`    <Directory "${docRoot}">`);
    lines.push('        AllowOverride All');
    lines.push('        Require all granted');
    lines.push('    </Directory>');
    lines.push('</VirtualHost>');
    lines.push('');
  }
  return lines.join('\n');
}

// ----- Shared: copy to clipboard -----
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface ConfigCreatorsProps {
  currentServer?: ServerConnection | null;
  proxy?: ProxySettings;
  projectRepos?: string[];
  projectTreeListings?: Record<string, string>;
}

export function ConfigCreators({ currentServer = null, proxy, projectRepos = [] }: ConfigCreatorsProps) {
  const [activeTab, setActiveTab] = useState<CreatorTabId>('compose');
  const [mode, setMode] = useState<CreatorMode>('form');
  const [copied, setCopied] = useState(false);

  // AI (LLM) state: chat + context
  const [groqApiKey, setGroqApiKey] = useState(loadGroqApiKey);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [contextText, setContextText] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [llmOutput, setLlmOutput] = useState<string | null>(null);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [selectedProjectPath, setSelectedProjectPath] = useState('');
  const [loadingContext, setLoadingContext] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Resizable left/right split (left panel width in %)
  const [leftPanelPercent, setLeftPanelPercent] = useState(50);
  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, percent: 50 });

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - resizeStartRef.current.x;
      const container = document.querySelector('[data-config-creators-content]');
      const w = container?.getBoundingClientRect().width ?? 800;
      const deltaPercent = (delta / w) * 100;
      const next = Math.min(80, Math.max(20, resizeStartRef.current.percent + deltaPercent));
      setLeftPanelPercent(next);
      resizeStartRef.current = { x: e.clientX, percent: next };
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  // Docker Compose state
  const [composeVersion, setComposeVersion] = useState('3.8');
  const [composeServices, setComposeServices] = useState<ComposeService[]>([defaultComposeService()]);

  // Dockerfile state
  const [dockerfileSteps, setDockerfileSteps] = useState<DockerfileStep[]>([
    { type: 'FROM', value: 'node:20-alpine' },
    { type: 'WORKDIR', value: '/app' },
    { type: 'COPY', value: 'package*.json .' },
    { type: 'RUN', value: 'npm ci --only=production' },
    { type: 'COPY', value: '. .' },
    { type: 'EXPOSE', value: '3000' },
    { type: 'CMD', value: '["node", "index.js"]' },
  ]);

  // NGINX state
  const [nginxServers, setNginxServers] = useState<NginxServer[]>([
    { type: 'http', serverName: 'localhost', port: '80', root: '/var/www/html', index: 'index.html' },
  ]);

  // Apache state
  const [apacheVhosts, setApacheVhosts] = useState<ApacheVhost[]>([
    { type: 'http', serverName: 'localhost', documentRoot: '/var/www/html', port: '80' },
  ]);

  const creatorTabs: { id: CreatorTabId; label: string; icon: typeof Box }[] = [
    { id: 'compose', label: 'Docker Compose', icon: Box },
    { id: 'dockerfile', label: 'Dockerfile', icon: FileCode },
    { id: 'nginx', label: 'NGINX', icon: Server },
    { id: 'apache', label: 'Apache 2.4', icon: Shield },
  ];

  let formGenerated = '';
  if (activeTab === 'compose') formGenerated = generateCompose(composeVersion, composeServices);
  else if (activeTab === 'dockerfile') formGenerated = generateDockerfile(dockerfileSteps);
  else if (activeTab === 'nginx') formGenerated = generateNginx(nginxServers);
  else if (activeTab === 'apache') formGenerated = generateApache(apacheVhosts);

  const generated = mode === 'ai' && llmOutput !== null ? llmOutput : formGenerated;

  const handleCopy = async () => {
    const ok = await copyToClipboard(generated);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  };

  const handleSendMessage = async () => {
    const key = groqApiKey.trim();
    if (!key) {
      setAiError('Enter your Groq API key (same as in Deploy tab; get one at console.groq.com)');
      return;
    }
    const userContent = aiPrompt.trim();
    if (!userContent) {
      setAiError('Type or say what you want (e.g. "nginx and redis with port 6379 exposed")');
      return;
    }
    setAiError(null);
    setAiPrompt('');
    const newUserMessage = { role: 'user' as const, content: userContent };
    setChatMessages((prev) => [...prev, newUserMessage]);
    setAiLoading(true);
    try {
      const messagesForApi = [...chatMessages, newUserMessage];
      const { content, error } = await generateConfigWithGroq(key, activeTab, messagesForApi, contextText);
      if (error) {
        setAiError(error);
        setChatMessages((prev) => prev.slice(0, -1));
        return;
      }
      saveGroqApiKey(key);
      setLlmOutput(content);
      setChatMessages((prev) => [...prev, { role: 'assistant', content }]);
    } finally {
      setAiLoading(false);
    }
  };

  const onSelectProjectForContext = async (projectPath: string) => {
    setSelectedProjectPath(projectPath);
    if (!projectPath || !currentServer || !window.serverOperator) {
      if (!projectPath) setContextText('');
      return;
    }
    setLoadingContext(true);
    setAiError(null);
    try {
      const { context, error } = await loadProjectContext(
        currentServer,
        projectPath,
        proxy?.enabled ? proxy : undefined,
        { listDir: window.serverOperator.listDir.bind(window.serverOperator), readFile: window.serverOperator.readFile.bind(window.serverOperator) }
      );
      if (error) {
        setAiError(error);
        return;
      }
      setContextText(context);
    } finally {
      setLoadingContext(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setIsListening(false);
  };

  const toggleVoiceInput = async () => {
    if (isListening) {
      stopRecording();
      return;
    }
    const key = groqApiKey.trim();
    if (!key) {
      setAiError('Enter your Groq API key above (same as for Generate). Free at console.groq.com');
      return;
    }
    setAiError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopRecording();
        const chunks = chunksRef.current;
        if (chunks.length === 0) {
          setAiError('No audio recorded. Try again and speak after clicking the mic.');
          return;
        }
        const blob = new Blob(chunks, { type: mime });
        setIsTranscribing(true);
        setAiError(null);
        const { text, error } = await transcribeWithGroq(key, blob);
        setIsTranscribing(false);
        if (error) {
          setAiError(error);
          return;
        }
        if (text) {
          setAiPrompt((prev) => (prev ? `${prev} ${text}` : text).trim());
          saveGroqApiKey(key);
        } else {
          setAiError('No speech detected. Try again and speak clearly.');
        }
      };
      recorder.start(1000);
      setIsListening(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(/denied|permission/i.test(msg) ? 'Microphone access denied. Allow mic and try again.' : `Mic error: ${msg}`);
      stopRecording();
    }
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
    };
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] overflow-x-auto shrink-0">
        {creatorTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setActiveTab(t.id); setLlmOutput(null); setAiError(null); setChatMessages([]); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors shrink-0 ${
              activeTab === t.id ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-0 border-b border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2">
        <span className="text-xs font-medium text-[var(--text-secondary)] mr-2">Mode:</span>
        <button
          type="button"
          onClick={() => setMode('form')}
          className={`px-3 py-1.5 rounded-t text-sm font-medium transition-colors ${
            mode === 'form' ? 'bg-[var(--bg-secondary)] text-[var(--accent)] border border-[var(--border)] border-b-transparent -mb-px' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Form builder
        </button>
        <button
          type="button"
          onClick={() => setMode('ai')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t text-sm font-medium transition-colors ${
            mode === 'ai' ? 'bg-[var(--bg-secondary)] text-[var(--accent)] border border-[var(--border)] border-b-transparent -mb-px' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Sparkles size={14} />
          Generate with AI
        </button>
      </div>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div
          data-config-creators-content
          className="flex flex-1 min-h-0 min-w-0"
        >
          {/* Left: form or AI */}
          <div
            style={{ width: `${leftPanelPercent}%`, minWidth: 240 }}
            className="flex flex-col min-h-0 overflow-auto shrink-0"
          >
            <div className="p-4 space-y-4">
            {mode === 'ai' ? (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col min-h-0 flex-1">
                <div className="p-3 border-b border-[var(--border)] shrink-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <Key size={14} className="text-[var(--text-secondary)] shrink-0" />
                    <input
                      type="password"
                      value={groqApiKey}
                      onChange={(e) => { setGroqApiKey(e.target.value); setAiError(null); }}
                      onBlur={() => saveGroqApiKey(groqApiKey)}
                      placeholder="Groq API key (saved locally)"
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Project context</label>
                    <select
                      value={selectedProjectPath}
                      onChange={(e) => onSelectProjectForContext(e.target.value)}
                      disabled={loadingContext || !projectRepos.length}
                      className="w-full max-w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] truncate focus:outline-none focus:border-[var(--accent)]"
                    >
                      <option value="">Select project (tree + deployment files)</option>
                      {projectRepos.map((path) => (
                        <option key={path} value={path}>{path}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 mt-1">
                      {loadingContext && <Loader2 size={14} className="animate-spin text-[var(--text-secondary)]" />}
                      {!projectRepos.length && (
                        <span className="text-xs text-[var(--text-muted)]">Right-click a folder → Add as project</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setContextCollapsed((c) => !c)}
                    className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <FolderTree size={14} />
                    {contextCollapsed ? 'Show context' : 'Hide context'}
                    {contextText.trim() ? ` (${contextText.split('\n').filter(Boolean).length} lines)` : ''}
                  </button>
                  {!contextCollapsed && (
                    <textarea
                      value={contextText}
                      onChange={(e) => { setContextText(e.target.value); setAiError(null); }}
                      placeholder="Select a project above to load tree (level 3) + Dockerfile, compose, .env, etc. Or paste your own context."
                      rows={4}
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-y"
                    />
                  )}
                </div>
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--bg-primary)]/30">
                  <div className="flex-1 overflow-auto px-4 py-4 space-y-4 min-h-[120px]">
                    {chatMessages.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Sparkles size={32} className="text-[var(--accent)]/60 mb-2" />
                        <p className="text-sm text-[var(--text-muted)]">Describe what you want. Context (project tree + deployment files) is sent with each message.</p>
                      </div>
                    )}
                    {chatMessages.map((m, i) => (
                      <div
                        key={i}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                            m.role === 'user'
                              ? 'bg-[var(--accent)] text-white rounded-br-md'
                              : 'bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] font-mono rounded-bl-md'
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-muted)] flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin shrink-0" />
                          <span>Generating…</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 p-3 pt-0">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] focus-within:ring-1 focus-within:ring-[var(--accent)] overflow-hidden">
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => { setAiPrompt(e.target.value); setAiError(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                        placeholder={
                          activeTab === 'compose'
                            ? 'e.g. add redis and nginx on 8080'
                            : activeTab === 'dockerfile'
                              ? 'e.g. Node 20, npm ci, expose 3000'
                              : 'Ask for config changes…'
                        }
                        rows={2}
                        className="w-full px-4 py-3 bg-transparent border-0 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none focus:outline-none focus:ring-0"
                      />
                      <div className="flex items-center justify-end gap-1 px-2 pb-2">
                        <button
                          type="button"
                          onClick={toggleVoiceInput}
                          disabled={isTranscribing}
                          title={isTranscribing ? 'Transcribing…' : isListening ? 'Record voice' : 'Record voice (Groq)'}
                          className={`p-2 rounded-lg transition-colors ${
                            isTranscribing ? 'opacity-70' : ''
                          } ${isListening ? 'bg-[var(--error)]/20 text-[var(--error)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'}`}
                        >
                          {isTranscribing ? <Loader2 size={18} className="animate-spin" /> : isListening ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
                        </button>
                        <button
                          type="button"
                          onClick={handleSendMessage}
                          disabled={aiLoading || !aiPrompt.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Send"
                        >
                          {aiLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                          Send
                        </button>
                      </div>
                    </div>
                    {aiError && (
                      <p className="mt-2 text-xs text-[var(--error)]">{aiError}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-[var(--text-secondary)]">
                  Add services, blocks, or steps below. The config updates live on the right.
                </p>
            {activeTab === 'compose' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Compose version</label>
                  <select
                    value={composeVersion}
                    onChange={(e) => setComposeVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                  >
                    <option value="3.8">3.8</option>
                    <option value="3">3</option>
                  </select>
                </div>
                {composeServices.map((s, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">Service {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => setComposeServices((prev) => prev.filter((_, j) => j !== i))}
                        className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--error)]/20 hover:text-[var(--error)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Name (e.g. web, api)"
                      value={s.name}
                      onChange={(e) =>
                        setComposeServices((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], name: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      placeholder="Image (e.g. nginx:alpine)"
                      value={s.image}
                      onChange={(e) =>
                        setComposeServices((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], image: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      placeholder="Build context (e.g. . or ./frontend)"
                      value={s.build}
                      onChange={(e) =>
                        setComposeServices((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], build: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      placeholder="Ports (e.g. 8080:80 or 3000:3000)"
                      value={s.ports}
                      onChange={(e) =>
                        setComposeServices((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], ports: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    <textarea
                      placeholder="Environment (one per line: KEY=value)"
                      value={s.env}
                      onChange={(e) =>
                        setComposeServices((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], env: e.target.value };
                          return next;
                        })
                      }
                      rows={2}
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] resize-y"
                    />
                    <input
                      type="text"
                      placeholder="Volumes (e.g. .:/app or named)"
                      value={s.volumes}
                      onChange={(e) =>
                        setComposeServices((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], volumes: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    <select
                      value={s.restart}
                      onChange={(e) =>
                        setComposeServices((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], restart: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    >
                      <option value="no">no</option>
                      <option value="always">always</option>
                      <option value="unless-stopped">unless-stopped</option>
                      <option value="on-failure">on-failure</option>
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setComposeServices((prev) => [...prev, defaultComposeService()])}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Plus size={16} />
                  Add service
                </button>
              </>
            )}

            {activeTab === 'dockerfile' && (
              <>
                {dockerfileSteps.map((step, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <select
                      value={step.type}
                      onChange={(e) =>
                        setDockerfileSteps((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], type: e.target.value as DockerfileStep['type'] };
                          return next;
                        })
                      }
                      className="w-28 shrink-0 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    >
                      {['FROM', 'WORKDIR', 'COPY', 'ADD', 'RUN', 'ENV', 'EXPOSE', 'CMD', 'ENTRYPOINT'].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={step.value}
                      onChange={(e) =>
                        setDockerfileSteps((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], value: e.target.value };
                          return next;
                        })
                      }
                      placeholder={step.type === 'FROM' ? 'node:20-alpine' : step.type === 'COPY' ? '. .' : ''}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)] font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setDockerfileSteps((prev) => prev.filter((_, j) => j !== i))}
                      className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--error)]/20 hover:text-[var(--error)] shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDockerfileSteps((prev) => [...prev, { type: 'RUN', value: '' }])}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Plus size={16} />
                  Add step
                </button>
              </>
            )}

            {activeTab === 'nginx' && (
              <>
                {nginxServers.map((s, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        Server {i + 1} ({s.type})
                      </span>
                      <button
                        type="button"
                        onClick={() => setNginxServers((prev) => prev.filter((_, j) => j !== i))}
                        className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--error)]/20 hover:text-[var(--error)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <select
                      value={s.type}
                      onChange={(e) =>
                        setNginxServers((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], type: e.target.value as 'http' | 'https', port: e.target.value === 'https' ? '443' : '80' };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    >
                      <option value="http">HTTP</option>
                      <option value="https">HTTPS</option>
                    </select>
                    <input
                      type="text"
                      placeholder="server_name"
                      value={s.serverName}
                      onChange={(e) =>
                        setNginxServers((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], serverName: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      placeholder="listen port"
                      value={s.port}
                      onChange={(e) =>
                        setNginxServers((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], port: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      placeholder="root (or leave empty for proxy)"
                      value={s.root}
                      onChange={(e) =>
                        setNginxServers((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], root: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      placeholder="proxy_pass (e.g. http://localhost:3000)"
                      value={s.proxyPass || ''}
                      onChange={(e) =>
                        setNginxServers((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], proxyPass: e.target.value || undefined };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    {s.type === 'https' && (
                      <>
                        <input
                          type="text"
                          placeholder="ssl_certificate path"
                          value={s.sslCert || ''}
                          onChange={(e) =>
                            setNginxServers((prev) => {
                              const next = [...prev];
                              next[i] = { ...next[i], sslCert: e.target.value || undefined };
                              return next;
                            })
                          }
                          className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                        />
                        <input
                          type="text"
                          placeholder="ssl_certificate_key path"
                          value={s.sslKey || ''}
                          onChange={(e) =>
                            setNginxServers((prev) => {
                              const next = [...prev];
                              next[i] = { ...next[i], sslKey: e.target.value || undefined };
                              return next;
                            })
                          }
                          className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                        />
                      </>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setNginxServers((prev) => [
                      ...prev,
                      { type: 'http', serverName: 'localhost', port: '80', root: '/var/www/html', index: 'index.html' },
                    ])
                  }
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Plus size={16} />
                  Add server block
                </button>
              </>
            )}

            {activeTab === 'apache' && (
              <>
                {apacheVhosts.map((v, i) => (
                  <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        VirtualHost {i + 1} ({v.type})
                      </span>
                      <button
                        type="button"
                        onClick={() => setApacheVhosts((prev) => prev.filter((_, j) => j !== i))}
                        className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--error)]/20 hover:text-[var(--error)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <select
                      value={v.type}
                      onChange={(e) =>
                        setApacheVhosts((prev) => {
                          const next = [...prev];
                          next[i] = {
                            ...next[i],
                            type: e.target.value as 'http' | 'https',
                            port: e.target.value === 'https' ? '443' : '80',
                          };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    >
                      <option value="http">HTTP (80)</option>
                      <option value="https">HTTPS (443)</option>
                    </select>
                    <input
                      type="text"
                      placeholder="ServerName"
                      value={v.serverName}
                      onChange={(e) =>
                        setApacheVhosts((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], serverName: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    <input
                      type="text"
                      placeholder="DocumentRoot"
                      value={v.documentRoot}
                      onChange={(e) =>
                        setApacheVhosts((prev) => {
                          const next = [...prev];
                          next[i] = { ...next[i], documentRoot: e.target.value };
                          return next;
                        })
                      }
                      className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                    />
                    {v.type === 'https' && (
                      <>
                        <input
                          type="text"
                          placeholder="SSLCertificateFile"
                          value={v.sslCert || ''}
                          onChange={(e) =>
                            setApacheVhosts((prev) => {
                              const next = [...prev];
                              next[i] = { ...next[i], sslCert: e.target.value || undefined };
                              return next;
                            })
                          }
                          className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                        />
                        <input
                          type="text"
                          placeholder="SSLCertificateKeyFile"
                          value={v.sslKey || ''}
                          onChange={(e) =>
                            setApacheVhosts((prev) => {
                              const next = [...prev];
                              next[i] = { ...next[i], sslKey: e.target.value || undefined };
                              return next;
                            })
                          }
                          className="w-full px-2 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-sm text-[var(--text-primary)]"
                        />
                      </>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setApacheVhosts((prev) => [
                      ...prev,
                      { type: 'http', serverName: 'localhost', documentRoot: '/var/www/html', port: '80' },
                    ])
                  }
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  <Plus size={16} />
                  Add VirtualHost
                </button>
              </>
            )}
              </>
            )}
            </div>
          </div>

          {/* Resize handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={leftPanelPercent}
            onMouseDown={(e) => {
              e.preventDefault();
              resizeStartRef.current = { x: e.clientX, percent: leftPanelPercent };
              setResizing(true);
            }}
            className={`shrink-0 w-2 cursor-col-resize border-x border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--accent)]/20 transition-colors ${resizing ? 'bg-[var(--accent)]/30' : ''}`}
          />

          {/* Right: generated output */}
          <div
            style={{ width: `${100 - leftPanelPercent}%`, minWidth: 280 }}
            className="flex flex-col min-h-0 overflow-auto shrink-0 p-4"
          >
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 flex flex-col min-h-[280px]">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {mode === 'ai' && llmOutput !== null ? 'Generated (AI)' : 'Generated config'}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!generated}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                >
                  <Copy size={12} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="flex-1 min-h-[200px] p-3 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs font-mono text-[var(--text-primary)] whitespace-pre-wrap break-words overflow-auto">
                {generated || (mode === 'ai' ? 'Describe what you want and click Generate.' : 'Use the form to build the config.')}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
