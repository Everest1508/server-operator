import { useState, useEffect } from 'react';
import { Terminal, Search, Plus, Trash2, Pencil, X, Check, ArrowRight, Loader2, Info, Copy } from 'lucide-react';
import { Tooltip } from './Tooltip';



interface TerminalSnippet {
  id: number;
  title: string;
  description?: string;
  command: string;
  timestamp: string;
}

export function SnippetsSidebar() {
  const [snippets, setSnippets] = useState<TerminalSnippet[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CRUD Form State
  const [showForm, setShowForm] = useState(false);
  const [formId, setFormId] = useState<number | undefined>(undefined);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCommand, setFormCommand] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Variables Modal State
  const [promptModal, setPromptModal] = useState<{
    title: string;
    commandTemplate: string;
    variables: string[];
    values: Record<string, string>;
  } | null>(null);

  // Copy feedback state
  const [copiedSnippetId, setCopiedSnippetId] = useState<number | null>(null);

  // 1. Fetch snippets from SQLite on mount
  const fetchSnippets = async () => {
    if (!window.serverOperator?.getSnippets) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await window.serverOperator.getSnippets();
      setSnippets(rows || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load snippets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnippets();
  }, []);

  // 2. Open Add/Edit form
  const handleOpenForm = (snippet?: TerminalSnippet) => {
    if (snippet) {
      setFormId(snippet.id);
      setFormTitle(snippet.title);
      setFormDescription(snippet.description || '');
      setFormCommand(snippet.command);
    } else {
      setFormId(undefined);
      setFormTitle('');
      setFormDescription('');
      setFormCommand('');
    }
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setFormId(undefined);
    setFormTitle('');
    setFormDescription('');
    setFormCommand('');
  };

  // 3. Save Snippet (Create or Update)
  const handleSaveSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formCommand.trim() || !window.serverOperator?.saveSnippet) return;
    setFormSaving(true);
    try {
      const res = await window.serverOperator.saveSnippet({
        id: formId,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        command: formCommand.trim(),
      });
      if (res.ok) {
        handleCloseForm();
        fetchSnippets();
      } else {
        setError(res.error || 'Failed to save snippet');
      }
    } catch (e: any) {
      setError(e?.message || 'Error saving snippet');
    } finally {
      setFormSaving(false);
    }
  };

  // 4. Delete Snippet
  const handleDeleteSnippet = async (snippet: TerminalSnippet, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.serverOperator?.deleteSnippet) return;
    if (!window.confirm(`Are you sure you want to delete the snippet "${snippet.title}"?\nThis action is permanent.`)) {
      return;
    }
    try {
      const res = await window.serverOperator.deleteSnippet({ id: snippet.id });
      if (res.ok) {
        fetchSnippets();
      } else {
        setError(res.error || 'Failed to delete snippet');
      }
    } catch (e: any) {
      setError(e?.message || 'Error deleting snippet');
    }
  };

  // 5. Parse and Execute Snippet
  const handleSnippetClick = (snippet: TerminalSnippet) => {
    const commandText = snippet.command;
    // Regex matches {{variable_name}}
    const regex = /\{\{([^}]+)\}\}/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(commandText)) !== null) {
      const varName = match[1].trim();
      if (!matches.includes(varName)) {
        matches.push(varName);
      }
    }

    if (matches.length > 0) {
      // Show values prompt modal
      const initialValues: Record<string, string> = {};
      matches.forEach((v) => {
        initialValues[v] = '';
      });
      setPromptModal({
        title: snippet.title,
        commandTemplate: commandText,
        variables: matches,
        values: initialValues,
      });
    } else {
      // Paste directly
      pasteCommand(commandText);
    }
  };

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptModal) return;

    let finalCommand = promptModal.commandTemplate;
    promptModal.variables.forEach((v) => {
      const val = promptModal.values[v].trim() || `{{${v}}}`;
      // Replace all occurrences of {{v}} or {{ v }}
      const escapedVar = v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const varRegex = new RegExp(`\\{\\{\\s*${escapedVar}\\s*\\}\\}`, 'g');
      finalCommand = finalCommand.replace(varRegex, val);
    });

    setPromptModal(null);
    pasteCommand(finalCommand);
  };

  const handleCopySnippetText = async (snippet: TerminalSnippet, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(snippet.command);
      setCopiedSnippetId(snippet.id);
      setTimeout(() => setCopiedSnippetId(null), 2000);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };

  const handleCopySubstitutedCommand = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!promptModal) return;
    let finalCommand = promptModal.commandTemplate;
    promptModal.variables.forEach((v) => {
      const val = promptModal.values[v].trim() || `{{${v}}}`;
      const escapedVar = v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const varRegex = new RegExp(`\\{\\{\\s*${escapedVar}\\s*\\}\\}`, 'g');
      finalCommand = finalCommand.replace(varRegex, val);
    });
    try {
      await navigator.clipboard.writeText(finalCommand);
      setPromptModal(null);
    } catch (err) {
      console.error('Failed to copy command:', err);
    }
  };

  const pasteCommand = (cmdText: string) => {
    // Send event to Paste handler (App.tsx and Panel.tsx)
    window.dispatchEvent(
      new CustomEvent('paste-to-active-terminal', {
        detail: { command: cmdText },
      })
    );
  };

  // Filter snippets based on query
  const filteredSnippets = snippets.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      s.command.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full bg-[var(--bg-secondary)] text-[var(--text-primary)] min-w-0">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] shrink-0 bg-[var(--bg-secondary)]">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <Terminal size={14} className="text-[var(--accent)]" />
          <span>Snippets Library</span>
        </div>
        <button
          type="button"
          onClick={() => handleOpenForm()}
          className="p-1 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent)] transition-all cursor-pointer"
          title="Create New Snippet"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        {/* Search Bar */}
        {!showForm && (
          <div className="p-2 border-b border-[var(--border)] shrink-0 bg-[var(--bg-secondary)]/50">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search snippets..."
                className="w-full pl-8 pr-3 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content Views */}
        {showForm ? (
          /* Create / Edit Form */
          <form onSubmit={handleSaveSnippet} className="flex-1 flex flex-col min-h-0 p-3 space-y-3.5 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                {formId ? 'Edit Snippet' : 'New Snippet'}
              </span>
              <button
                type="button"
                onClick={handleCloseForm}
                className="p-1 rounded text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3">
              {/* Title */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Title <span className="text-[var(--error)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Restart API"
                  className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Description
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional brief usage summary..."
                  className="w-full h-16 p-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none"
                />
              </div>

              {/* Command text */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    Command <span className="text-[var(--error)]">*</span>
                  </label>
                  <Tooltip content="Use double curly braces like {{domain}} or {{port}} to configure variables prompted when run." position="top">
                    <span className="text-[10px] text-[var(--accent)] flex items-center gap-0.5 cursor-help">
                      <Info size={11} /> Placeholders
                    </span>
                  </Tooltip>
                </div>
                <textarea
                  required
                  value={formCommand}
                  onChange={(e) => setFormCommand(e.target.value)}
                  placeholder="e.g. ping {{host}} -c 4"
                  className="w-full h-24 p-2 rounded bg-[var(--bg-primary)] border border-[var(--border)] font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-y"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={formSaving}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent)]/90 disabled:opacity-50 transition-all cursor-pointer"
              >
                {formSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save Snippet
              </button>
              <button
                type="button"
                onClick={handleCloseForm}
                className="px-3 py-2 rounded border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          /* Snippet List */
          <div className="flex-grow overflow-y-auto p-2 space-y-2 min-h-0">
            {error && (
              <div className="px-2.5 py-2 rounded bg-[var(--error)]/10 border border-[var(--error)]/40 text-[var(--error)] text-[11px] mb-2">
                {error}
              </div>
            )}

            {loading && snippets.length === 0 ? (
              <div className="flex items-center justify-center py-8 gap-2 text-[var(--text-secondary)] text-xs">
                <Loader2 size={14} className="animate-spin" /> Loading library…
              </div>
            ) : filteredSnippets.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs text-[var(--text-muted)] italic">
                {searchQuery ? 'No matching snippets found.' : 'No snippets saved. Click + to add.'}
              </div>
            ) : (
              filteredSnippets.map((snippet) => (
                <div
                  key={snippet.id}
                  onClick={() => handleSnippetClick(snippet)}
                  className="group relative rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-2.5 shadow-sm hover:border-[var(--accent)]/50 hover:bg-[var(--bg-tertiary)]/20 transition-all duration-150 cursor-pointer flex flex-col gap-1 min-w-0"
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <span className="font-semibold text-xs text-[var(--text-primary)] truncate" title={snippet.title}>
                      {snippet.title}
                    </span>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1 shrink-0 bg-gradient-to-l from-[var(--bg-primary)] pl-4">
                      <button
                        type="button"
                        onClick={(e) => handleCopySnippetText(snippet, e)}
                        className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer animate-fade-in"
                        title="Copy Snippet Command"
                      >
                        {copiedSnippetId === snippet.id ? <Check size={11} className="text-[var(--success)] animate-pulse" /> : <Copy size={11} />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenForm(snippet);
                        }}
                        className="p-1 rounded hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
                        title="Edit Snippet"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSnippet(snippet, e)}
                        className="p-1 rounded hover:bg-[var(--error)]/15 text-[var(--text-secondary)] hover:text-[var(--error)] cursor-pointer"
                        title="Delete Snippet"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {snippet.description && (
                    <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                      {snippet.description}
                    </p>
                  )}

                  <code className="mt-1 block bg-[var(--bg-secondary)] border border-[var(--border)] px-1.5 py-1 rounded text-[10px] font-mono text-[var(--text-muted)] truncate whitespace-nowrap select-none">
                    {snippet.command}
                  </code>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Variables Input Dialog / Prompt Modal */}
      {promptModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
                <Terminal size={14} className="text-[var(--accent)]" />
                Configure Variables
              </span>
              <button
                type="button"
                onClick={() => setPromptModal(null)}
                className="p-1 rounded text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleModalSubmit} className="p-4 space-y-4 flex flex-col">
              <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Enter values for placeholders in <strong className="text-[var(--text-primary)]">{promptModal.title}</strong>:
              </div>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {promptModal.variables.map((v) => (
                  <div key={v} className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono">
                      {v}
                    </label>
                    <input
                      type="text"
                      required
                      value={promptModal.values[v]}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPromptModal((prev) => {
                          if (!prev) return prev;
                          return {
                            ...prev,
                            values: {
                              ...prev.values,
                              [v]: val,
                            },
                          };
                        });
                      }}
                      placeholder={`Enter value for ${v}`}
                      className="w-full px-2.5 py-1.5 rounded bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                ))}
              </div>

              {/* Template Preview */}
              <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded p-2.5">
                <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                  Preview Command
                </span>
                <code className="text-[10px] font-mono text-[var(--text-primary)] break-all block whitespace-pre-wrap">
                  {(() => {
                    let cmd = promptModal.commandTemplate;
                    promptModal.variables.forEach((v) => {
                      const val = promptModal.values[v].trim() || `{{${v}}}`;
                      const escapedVar = v.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                      const varRegex = new RegExp(`\\{\\{\\s*${escapedVar}\\s*\\}\\}`, 'g');
                      cmd = cmd.replace(varRegex, val);
                    });
                    return cmd;
                  })()}
                </code>
              </div>

              {/* Modal Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPromptModal(null)}
                  className="px-3.5 py-1.5 rounded border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCopySubstitutedCommand}
                  className="flex items-center gap-1 py-1.5 px-3.5 rounded border border-[var(--border)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs text-[var(--text-primary)] cursor-pointer"
                >
                  <Copy size={12} /> Copy
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1 py-1.5 px-4 rounded bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent)]/95 shadow-sm cursor-pointer"
                >
                  Paste & Run <ArrowRight size={12} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
