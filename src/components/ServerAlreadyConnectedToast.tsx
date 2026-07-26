import React, { useEffect } from 'react';
import { Server, CheckCircle2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ServerAlreadyConnectedToastProps {
  serverName: string | null;
  onDismiss: () => void;
}

export function ServerAlreadyConnectedToast({
  serverName,
  onDismiss,
}: ServerAlreadyConnectedToastProps) {
  useEffect(() => {
    if (!serverName) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 3500);
    return () => clearTimeout(timer);
  }, [serverName, onDismiss]);

  return (
    <AnimatePresence>
      {serverName && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed top-12 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-secondary/95 border border-accent/40 shadow-2xl backdrop-blur-xl max-w-sm select-none"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/15 text-accent shrink-0">
            <Server size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-primary truncate">
              <CheckCircle2 size={13} className="text-success shrink-0" />
              <span className="truncate">{serverName}</span>
            </div>
            <p className="text-[11px] text-text-muted truncate mt-0.5">
              Server is already connected. Switched to active tab.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
            title="Dismiss notification"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
