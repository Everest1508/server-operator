import { useState } from 'react';
import type { ServerConnection } from '../types';
import { Input } from './ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-border/30 px-5 py-4 bg-bg-secondary/40">
          <DialogTitle>Add New Server Profile</DialogTitle>
          <DialogDescription className="sr-only">Enter the SSH connection details for the server.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">Display Name</label>
            <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Production API Server" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">Host address</label>
            <Input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="e.g., 192.168.1.100 or ssh.example.com" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">Username</label>
            <Input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g., root, ubuntu, or deployer" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">SSH Private Key Path</label>
            <Input type="text" value={privateKeyPath} onChange={(e) => setPrivateKeyPath(e.target.value)} placeholder="e.g., ~/.ssh/id_ed25519" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-secondary mb-1.5">Remote CWD/Project Path (optional)</label>
            <Input type="text" value={projectPath} onChange={(e) => setProjectPath(e.target.value)} placeholder="e.g., /var/www/my-app" />
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
      </DialogContent>
    </Dialog>
  );
}
