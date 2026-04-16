import { useState } from 'react';
import { X } from 'lucide-react';
import type { ServerConnection } from '../types';

interface AddServerModalProps {
  onClose: () => void;
  onAdd: (s: ServerConnection) => void;
}

export function AddServerModal({ onClose, onAdd }: AddServerModalProps) {
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [username, setUsername] = useState('');
  const [privateKeyPath, setPrivateKeyPath] = useState('');
  const [projectPath, setProjectPath] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !host.trim() || !username.trim() || !privateKeyPath.trim()) return;
    onAdd({
      id: crypto.randomUUID(),
      name: name.trim(),
      host: host.trim(),
      username: username.trim(),
      privateKeyPath: privateKeyPath.trim(),
      projectPath: projectPath.trim() || undefined,
      cwd: projectPath.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Add Server</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Server"
              className="w-full px-3 py-2 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.10 or server.example.com"
              className="w-full px-3 py-2 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="root or deploy"
              className="w-full px-3 py-2 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">SSH private key path</label>
            <input
              type="text"
              value={privateKeyPath}
              onChange={(e) => setPrivateKeyPath(e.target.value)}
              placeholder="/home/user/.ssh/id_rsa"
              className="w-full px-3 py-2 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Project path (optional)</label>
            <input
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="/var/www/app or leave empty"
              className="w-full px-3 py-2 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] outline-none text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-md text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
            >
              Add Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
