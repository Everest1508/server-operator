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
      <div className="w-full max-w-md rounded-2xl border border-border/40 bg-bg-secondary/95 shadow-2xl backdrop-blur-md overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/30 px-5 py-4 bg-bg-secondary/40">
          <h2 className="text-sm font-semibold text-text-primary">Add New Server Profile</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all"
          >
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production API Server"
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted/65 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">Host address</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="e.g., 192.168.1.100 or ssh.example.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted/65 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g., root, ubuntu, or deployer"
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted/65 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">SSH Private Key Path</label>
            <input
              type="text"
              value={privateKeyPath}
              onChange={(e) => setPrivateKeyPath(e.target.value)}
              placeholder="e.g., ~/.ssh/id_ed25519"
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted/65 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">Remote CWD/Project Path (optional)</label>
            <input
              type="text"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              placeholder="e.g., /var/www/my-app"
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-primary/50 border border-border/30 text-text-primary placeholder-text-muted/65 focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent/40 transition-all text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:bg-bg-tertiary/60 transition-all duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent hover:bg-accent-hover text-white transition-all duration-150 shadow-md shadow-accent/15"
            >
              Add Server Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
