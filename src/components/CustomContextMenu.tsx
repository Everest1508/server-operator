import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Undo2,
  Redo2,
  Scissors,
  Copy,
  Clipboard,
  CheckSquare,
  ExternalLink,
  Code2,
} from 'lucide-react';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  isEditable: boolean;
  selectedText: string;
  linkUrl: string | null;
  targetElement: HTMLElement | null;
}

export function CustomContextMenu() {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    isEditable: false,
    selectedText: '',
    linkUrl: null,
    targetElement: null,
  });

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;

      // Skip custom context menu for elements that provide their own specific UI menus (e.g. sidebar file tree rows)
      if (target?.closest('[data-tree-row], [data-repo-tree-row]')) {
        return;
      }

      // Check if target is editable (input, textarea, contenteditable, or inside Monaco editor)
      const inputEl = target?.closest('input, textarea, [contenteditable="true"], .monaco-editor, .xterm');
      const isEditable = Boolean(inputEl);

      // Check for link
      const anchorEl = target?.closest('a') as HTMLAnchorElement | null;
      const linkUrl = anchorEl?.href || null;

      // Check selected text
      const selection = window.getSelection()?.toString() || '';

      e.preventDefault();

      // Ensure menu pops up right where user right-clicked, constrained within viewport boundaries
      const menuWidth = 220;
      const menuHeight = 320;
      const posX = Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8));
      const posY = Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 8));

      setMenuState({
        visible: true,
        x: Math.max(8, posX),
        y: Math.max(8, posY),
        isEditable,
        selectedText: selection,
        linkUrl,
        targetElement: target,
      });
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuState((prev) => ({ ...prev, visible: false }));
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuState((prev) => ({ ...prev, visible: false }));
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', () => setMenuState((prev) => ({ ...prev, visible: false })), true);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (!menuState.visible) return null;

  const closeMenu = () => setMenuState((prev) => ({ ...prev, visible: false }));

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const cmdKey = isMac ? '⌘' : 'Ctrl+';

  // Actions
  const handleUndo = () => {
    closeMenu();
    document.execCommand('undo');
  };

  const handleRedo = () => {
    closeMenu();
    document.execCommand('redo');
  };

  const handleCut = () => {
    closeMenu();
    document.execCommand('cut');
  };

  const handleCopy = () => {
    closeMenu();
    if (menuState.selectedText) {
      void navigator.clipboard.writeText(menuState.selectedText);
    } else {
      document.execCommand('copy');
    }
  };

  const handlePaste = async () => {
    closeMenu();
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      const el = menuState.targetElement;
      if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        const start = el.selectionStart || 0;
        const end = el.selectionEnd || 0;
        const val = el.value;
        el.value = val.substring(0, start) + text + val.substring(end);
        el.selectionStart = el.selectionEnd = start + text.length;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.execCommand('insertText', false, text);
      }
    } catch (_) {
      document.execCommand('paste');
    }
  };

  const handleSelectAll = () => {
    closeMenu();
    const el = menuState.targetElement;
    if (!el) {
      document.execCommand('selectAll');
      return;
    }

    // 1. Text Inputs & Textareas
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.select();
      return;
    }

    // 2. Monaco Editor: Trigger native Monaco Select All action so lines highlight properly
    const monacoEl = el.closest('.monaco-editor');
    if (monacoEl) {
      const textarea = (monacoEl.querySelector('textarea.inputarea') || monacoEl.querySelector('textarea')) as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.focus();
        const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const evt = new KeyboardEvent('keydown', {
          key: 'a',
          code: 'KeyA',
          keyCode: 65,
          which: 65,
          ctrlKey: !isMac,
          metaKey: isMac,
          bubbles: true,
          cancelable: true,
        });
        textarea.dispatchEvent(evt);
        document.execCommand('selectAll');
        return;
      }
    }

    // 3. Log blocks (<pre>), code blocks (<code>), tables, scrollable containers (.overflow-auto), tab panels
    const scopedContainer =
      el.closest(
        'pre, code, table, [role="tabpanel"], .overflow-auto, .overflow-y-auto, .overflow-x-auto, article, form, blockquote, .select-text'
      ) || el.parentElement || el;

    if (scopedContainer) {
      const range = document.createRange();
      range.selectNodeContents(scopedContainer);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } else {
      document.execCommand('selectAll');
    }
  };

  const handleCopyLink = () => {
    closeMenu();
    if (menuState.linkUrl) {
      void navigator.clipboard.writeText(menuState.linkUrl);
    }
  };

  const handleOpenLink = () => {
    closeMenu();
    if (menuState.linkUrl) {
      window.open(menuState.linkUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleInspect = () => {
    closeMenu();
    if (window.serverOperator?.inspectElement) {
      void window.serverOperator.inspectElement({ x: menuState.x, y: menuState.y });
    } else if (window.serverOperator?.openDevTools) {
      void window.serverOperator.openDevTools();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={{ duration: 0.1, ease: 'easeOut' }}
        style={{ left: menuState.x, top: menuState.y }}
        className="fixed z-[999999] min-w-[210px] rounded-xl border border-border/40 bg-bg-secondary/95 backdrop-blur-xl p-1.5 shadow-2xl text-xs font-sans text-text-primary select-none space-y-0.5"
      >
        {menuState.isEditable && (
          <>
            <button
              type="button"
              onClick={handleUndo}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-bg-tertiary hover:text-accent transition-colors duration-100 text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Undo2 size={13} className="text-text-muted" />
                Undo
              </span>
              <kbd className="text-[10px] font-mono text-text-muted">{cmdKey}Z</kbd>
            </button>
            <button
              type="button"
              onClick={handleRedo}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-bg-tertiary hover:text-accent transition-colors duration-100 text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Redo2 size={13} className="text-text-muted" />
                Redo
              </span>
              <kbd className="text-[10px] font-mono text-text-muted">{cmdKey}Y</kbd>
            </button>
            <div className="h-px bg-border/20 my-1" />
            <button
              type="button"
              onClick={handleCut}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-bg-tertiary hover:text-accent transition-colors duration-100 text-left cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Scissors size={13} className="text-text-muted" />
                Cut
              </span>
              <kbd className="text-[10px] font-mono text-text-muted">{cmdKey}X</kbd>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-bg-tertiary hover:text-accent transition-colors duration-100 text-left cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Copy size={13} className="text-text-muted" />
            Copy
          </span>
          <kbd className="text-[10px] font-mono text-text-muted">{cmdKey}C</kbd>
        </button>

        {menuState.isEditable && (
          <button
            type="button"
            onClick={handlePaste}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-bg-tertiary hover:text-accent transition-colors duration-100 text-left cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Clipboard size={13} className="text-text-muted" />
              Paste
            </span>
            <kbd className="text-[10px] font-mono text-text-muted">{cmdKey}V</kbd>
          </button>
        )}

        <button
          type="button"
          onClick={handleSelectAll}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-bg-tertiary hover:text-accent transition-colors duration-100 text-left cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <CheckSquare size={13} className="text-text-muted" />
            Select All
          </span>
          <kbd className="text-[10px] font-mono text-text-muted">{cmdKey}A</kbd>
        </button>

        {menuState.linkUrl && (
          <>
            <div className="h-px bg-border/20 my-1" />
            <button
              type="button"
              onClick={handleOpenLink}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-bg-tertiary hover:text-accent transition-colors duration-100 text-left truncate cursor-pointer"
            >
              <ExternalLink size={13} className="text-text-muted shrink-0" />
              Open Link
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-bg-tertiary hover:text-accent transition-colors duration-100 text-left truncate cursor-pointer"
            >
              <Copy size={13} className="text-text-muted shrink-0" />
              Copy Link Address
            </button>
          </>
        )}

        <div className="h-px bg-border/20 my-1" />
        <button
          type="button"
          onClick={handleInspect}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-bg-tertiary hover:text-accent transition-colors duration-100 text-left cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Code2 size={13} className="text-text-muted" />
            Inspect Element
          </span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
