import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldQuestion } from 'lucide-react';

interface HostKeyPromptInfo {
  promptId: string;
  host: string;
  port: number;
  fingerprint: string;
  previousFingerprint: string | null;
  status: 'new' | 'changed';
}

/** Asks the user to trust an SSH server's fingerprint on first connect, and warns when it changes. */
export function HostKeyPrompt() {
  const [queue, setQueue] = useState<HostKeyPromptInfo[]>([]);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      const info = (e as CustomEvent<HostKeyPromptInfo>).detail;
      setQueue((q) => [...q, info]);
    };
    window.addEventListener('ssh-host-key-prompt', onPrompt);
    return () => window.removeEventListener('ssh-host-key-prompt', onPrompt);
  }, []);

  const current = queue[0];
  if (!current) return null;

  const answer = (trust: boolean) => {
    window.serverOperator?.answerHostKeyPrompt({ promptId: current.promptId, trust });
    setQueue((q) => q.slice(1));
  };
  const changed = current.status === 'changed';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-bg-secondary p-5 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          {changed ? (
            <ShieldAlert size={22} className="text-error shrink-0" />
          ) : (
            <ShieldQuestion size={22} className="text-warning shrink-0" />
          )}
          <h2 className="text-sm font-bold text-text-primary">
            {changed ? 'Server fingerprint changed' : 'Trust this server?'}
          </h2>
        </div>
        <p className="text-xs text-text-secondary mb-3">
          {changed
            ? `The fingerprint for ${current.host} is different from the one you trusted before. Someone may be intercepting the connection, or the server was reinstalled. Only continue if you know it was reinstalled.`
            : `This is the first time you connect to ${current.host}. Check that the fingerprint matches what your server shows (ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub).`}
        </p>
        {changed && current.previousFingerprint && (
          <div className="mb-2">
            <div className="text-[10px] uppercase tracking-wide text-text-secondary mb-1">Previously trusted</div>
            <code className="block break-all rounded-lg bg-bg-primary px-3 py-2 text-[11px] text-text-secondary">
              {current.previousFingerprint}
            </code>
          </div>
        )}
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-wide text-text-secondary mb-1">
            {changed ? 'Now presented' : 'Fingerprint'}
          </div>
          <code className="block break-all rounded-lg bg-bg-primary px-3 py-2 text-[11px] text-text-primary">
            {current.fingerprint}
          </code>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => answer(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-tertiary text-text-primary hover:opacity-90"
          >
            Cancel
          </button>
          <button
            onClick={() => answer(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:opacity-90 ${
              changed ? 'bg-error' : 'bg-accent'
            }`}
          >
            {changed ? 'Trust new fingerprint' : 'Trust and connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
