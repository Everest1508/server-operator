import { useEffect, useState } from 'react';
import { Bell, FolderGit2, Link2, LogIn, Users } from 'lucide-react';
import type { ServerConnection } from '../types';
import { Select } from './Select';
import {
  ApiProject,
  ApiTeam,
  createTeam,
  inviteToTeam,
  listMyProjects,
  projectToConnection,
  listTeams,
  markNotificationRead,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/Button';
import { Input } from './ui/Input';


interface CloudTeamViewProps {
  onConnectServer?: (server: ServerConnection) => void;
  connectingToId?: string | null;
}

export function CloudTeamView({ onConnectServer, connectingToId }: CloudTeamViewProps) {
  const { user, logout, notifications, refreshInbox } = useAuth();
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [teamName, setTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [teamsRes, projectsRes] = await Promise.all([
        listTeams(),
        listMyProjects().catch(() => ({ projects: [] as ApiProject[] })),
      ]);
      setTeams(teamsRes.teams);
      setProjects(projectsRes.projects);
      if (!selectedTeamId && teamsRes.teams[0]) setSelectedTeamId(teamsRes.teams[0].id);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cloud data');
    }
  };

  useEffect(() => {
    loadData();
    refreshInbox();
  }, [refreshInbox]);

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    setMessage('');
    try {
      await createTeam(teamName.trim());
      setTeamName('');
      setMessage('Team created.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    }
  };

  const handleInvite = async () => {
    if (!selectedTeamId || !inviteEmail.trim()) return;
    setMessage('');
    try {
      await inviteToTeam(selectedTeamId, inviteEmail.trim());
      setInviteEmail('');
      setMessage('Added to team.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add teammate');
    }
  };

  const handleDismissNotification = async (notificationId: string) => {
    try {
      await markNotificationRead(notificationId);
      await refreshInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss notification');
    }
  };

  const handleOpenProject = (project: ApiProject) => {
    setMessage('');
    setError('');
    const connection = projectToConnection(project);
    if (onConnectServer) onConnectServer(connection);
    else window.dispatchEvent(new CustomEvent('connect-shared-server', { detail: { server: connection } }));
    setMessage(`Opening "${project.name}"…`);
  };

  const unreadNotifications = notifications.filter((n) => !n.readAt);

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-bg-primary">
    <div className="p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
          <Users size={18} className="text-accent" />
          Teams & Cloud
        </h1>
        <p className="text-[11px] text-text-secondary mt-1">
          Manage your teams, invitations and the projects you can open.
        </p>
      </div>

      {user?.isGuest && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-text-primary">You are in guest mode</p>
            <p className="text-[11px] text-text-secondary mt-0.5">Create an account to manage teams and open projects.</p>
          </div>
          <Button className="shrink-0"
            onClick={logout}
          >
            <LogIn size={13} /> Sign in / Create account
          </Button>
        </div>
      )}

      {(message || error) && (
        <div className={`text-[11px] px-3 py-2 rounded-lg border ${error ? 'border-error/30 text-error bg-error/5' : 'border-accent/30 text-accent bg-accent/5'}`}>
          {error || message}
        </div>
      )}

      <section className="rounded-xl border border-border/20 bg-bg-secondary/25 p-4 space-y-3">
        <h3 className="text-xs font-bold flex items-center gap-2"><Bell size={14} /> Inbox</h3>
        {unreadNotifications.length === 0 ? (
          <p className="text-[11px] text-text-secondary">No new notifications.</p>
        ) : (
          unreadNotifications.map((n) => (
            <div key={n.id} className="rounded-lg border border-border/20 bg-bg-primary/30 px-3 py-2.5">
              <p className="text-xs font-semibold text-text-primary">{n.title}</p>
              <p className="text-[11px] text-text-secondary mt-0.5">{n.body}</p>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => handleDismissNotification(n.id)} className="px-2.5 py-1 rounded-md border border-border/30 text-[11px] font-semibold">Dismiss</button>
              </div>
            </div>
          ))
        )}
      </section>

      {!user?.isGuest && (
        <>
          <section className="rounded-xl border border-border/20 bg-bg-secondary/25 p-4 space-y-3">
            <h3 className="text-xs font-bold flex items-center gap-2"><Users size={14} /> Teams</h3>
            <div className="flex gap-2">
              <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="New team name" className="flex-1" />
              <Button onClick={handleCreateTeam}>Create</Button>
            </div>
            {teams.length > 0 && (
              <Select
                value={selectedTeamId}
                onChange={setSelectedTeamId}
                options={teams.map((t) => ({ value: t.id, label: `${t.name} (${t.role})` }))}
              />
            )}
            {selectedTeamId && (
              <div className="flex gap-2">
                <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Teammate email" className="flex-1" />
                <button type="button" onClick={handleInvite} className="px-3 py-2 rounded-lg border border-border/30 text-xs font-semibold">Invite</button>
              </div>
            )}
          </section>

        </>
      )}

      <section className="rounded-xl border border-border/20 bg-bg-secondary/25 p-4 space-y-3">
        <h3 className="text-xs font-bold flex items-center gap-2"><FolderGit2 size={14} /> Your projects</h3>
        <p className="text-[11px] text-text-secondary">Projects you have been given access to. Opening one shows only that project's Docker containers and logs.</p>
        {projects.length === 0 ? (
          <p className="text-[11px] text-text-secondary">No projects yet. Ask a team admin to give you access to one.</p>
        ) : (
          projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/20 bg-bg-primary/30 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-text-primary truncate">{p.name}</p>
                <p className="text-[10px] text-text-secondary truncate">{connectingToId === `project:${p.id}` ? 'Connecting…' : 'Docker and logs'}</p>
              </div>
              <button
                type="button"
                disabled={connectingToId === `project:${p.id}`}
                onClick={() => handleOpenProject(p)}
                className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-50 shrink-0"
              >
                <Link2 size={11} />
                Open
              </button>
            </div>
          ))
        )}
      </section>
    </div>
    </div>
  );
}
