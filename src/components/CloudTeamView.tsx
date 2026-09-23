import { useEffect, useState } from 'react';
import { Bell, Link2, LogIn, Share2, Trash2, Users } from 'lucide-react';
import type { ServerConnection } from '../types';
import { Select } from './Select';
import {
  ApiSharedServer,
  ApiTeam,
  createTeam,
  deleteSharedServer,
  fetchSharedServerCredentials,
  inviteToTeam,
  listSharedServers,
  listTeams,
  markNotificationRead,
  shareServer,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const STORAGE_KEY_SERVERS = 'server-operator-servers';

function loadLocalServers(): ServerConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SERVERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ServerConnection[]) : [];
  } catch {
    return [];
  }
}

interface CloudTeamViewProps {
  onConnectServer?: (server: ServerConnection) => void;
  connectingToId?: string | null;
}

export function CloudTeamView({ onConnectServer, connectingToId }: CloudTeamViewProps) {
  const { user, logout, notifications, refreshInbox } = useAuth();
  const [teams, setTeams] = useState<ApiTeam[]>([]);
  const [sharedServers, setSharedServers] = useState<ApiSharedServer[]>([]);
  const [teamName, setTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const localServers = loadLocalServers();

  const loadData = async () => {
    try {
      const [teamsRes, serversRes] = await Promise.all([listTeams(), listSharedServers()]);
      setTeams(teamsRes.teams);
      setSharedServers(serversRes.servers);
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

  const canRemoveShared = (server: ApiSharedServer) => {
    if (!user) return false;
    if (server.ownerId === user.id) return true;
    const team = teams.find((t) => t.id === server.teamId);
    return team?.role === 'owner';
  };

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

  const handleShareServer = async () => {
    const server = localServers.find((s) => s.id === selectedServerId);
    if (!server || !selectedTeamId) return;
    setMessage('');
    try {
      await shareServer({
        teamId: selectedTeamId,
        name: server.name,
        host: server.host,
        username: server.username,
        connectionType: server.connectionType || (server.privateKeyPath ? 'ec2' : 'password'),
        privateKeyPath: server.privateKeyPath,
        projectPath: server.projectPath || server.cwd,
        password: server.password,
      });
      setMessage('Server shared with team (password stored encrypted on server).');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share server');
    }
  };

  const handleConnectShared = async (serverId: string) => {
    setMessage('');
    setError('');
    setBusyId(serverId);
    try {
      const res = await fetchSharedServerCredentials(serverId);
      const creds = res.credentials;
      const connection: ServerConnection = {
        id: `shared:${serverId}`,
        name: `${creds.name} (shared)`,
        host: creds.host,
        username: creds.username,
        connectionType: (creds.connectionType as ServerConnection['connectionType']) || 'password',
        privateKeyPath: creds.privateKeyPath || undefined,
        projectPath: creds.projectPath || undefined,
        password: creds.password,
      };
      if (onConnectServer) {
        onConnectServer(connection);
      } else {
        window.dispatchEvent(new CustomEvent('connect-shared-server', { detail: { server: connection } }));
      }
      setMessage(`Connecting to "${creds.name}"…`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to shared server');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveShared = async (server: ApiSharedServer) => {
    if (!canRemoveShared(server)) return;
    const confirmed = window.confirm(`Remove shared access to "${server.name}" for the team?`);
    if (!confirmed) return;
    setMessage('');
    setError('');
    setBusyId(server.id);
    try {
      await deleteSharedServer(server.id);
      setMessage(`Removed shared access to "${server.name}".`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove shared server');
    } finally {
      setBusyId(null);
    }
  };

  const unreadNotifications = notifications.filter((n) => !n.readAt);

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-lg font-bold text-text-primary flex items-center gap-2">
          <Users size={18} className="text-accent" />
          Teams & Cloud
        </h1>
        <p className="text-[11px] text-text-secondary mt-1">
          Manage teams, inbox invitations, and shared servers.
        </p>
      </div>

      {user?.isGuest && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-text-primary">You are in guest mode</p>
            <p className="text-[11px] text-text-secondary mt-0.5">Create an account to manage teams and share servers.</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="shrink-0 px-3 py-2 rounded-lg bg-accent text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <LogIn size={13} /> Sign in / Create account
          </button>
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
                <button type="button" onClick={() => handleDismissNotification(n.id)} className="px-2.5 py-1 rounded-md border border-border/30 text-[10px] font-semibold">Dismiss</button>
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
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="New team name" className="flex-1 px-3 py-2 rounded-lg bg-bg-primary/50 border border-border/30 text-xs" />
              <button type="button" onClick={handleCreateTeam} className="px-3 py-2 rounded-lg bg-accent text-white text-xs font-semibold">Create</button>
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
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Teammate email" className="flex-1 px-3 py-2 rounded-lg bg-bg-primary/50 border border-border/30 text-xs" />
                <button type="button" onClick={handleInvite} className="px-3 py-2 rounded-lg border border-border/30 text-xs font-semibold">Invite</button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border/20 bg-bg-secondary/25 p-4 space-y-3">
            <h3 className="text-xs font-bold flex items-center gap-2"><Share2 size={14} /> Share a server</h3>
            <p className="text-[11px] text-text-secondary">Passwords are encrypted on the backend. Teammates can connect without seeing the password.</p>
            <Select
              value={selectedServerId}
              onChange={setSelectedServerId}
              options={[
                { value: '', label: 'Select local server profile' },
                ...localServers.map((s) => ({ value: s.id, label: `${s.name} — ${s.host}` })),
              ]}
            />
            <button type="button" onClick={handleShareServer} disabled={!selectedServerId || !selectedTeamId} className="px-3 py-2 rounded-lg bg-accent text-white text-xs font-semibold disabled:opacity-50">Share to team</button>
          </section>
        </>
      )}

      <section className="rounded-xl border border-border/20 bg-bg-secondary/25 p-4 space-y-3">
        <h3 className="text-xs font-bold">Shared servers in your teams</h3>
        <p className="text-[11px] text-text-secondary">Connect directly — credentials stay hidden. Remove sharing if you own the server or the team.</p>
        {sharedServers.length === 0 ? (
          <p className="text-[11px] text-text-secondary">No shared servers yet.</p>
        ) : (
          sharedServers.map((s) => {
            const isConnecting = connectingToId === `shared:${s.id}` || busyId === s.id;
            const isOwner = s.ownerId === user?.id;
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/20 bg-bg-primary/30 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">{s.name}</p>
                  <p className="text-[10px] text-text-secondary truncate">{s.username}@{s.host}</p>
                  {isOwner && <p className="text-[9px] text-accent/80 mt-0.5">Shared by you</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={isConnecting}
                    onClick={() => handleConnectShared(s.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-[10px] font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <Link2 size={11} />
                    {isConnecting ? 'Connecting…' : 'Connect'}
                  </button>
                  {canRemoveShared(s) && (
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => handleRemoveShared(s)}
                      className="px-2.5 py-1.5 rounded-lg border border-error/30 text-error text-[10px] font-semibold inline-flex items-center gap-1 hover:bg-error/10 disabled:opacity-50"
                      title="Remove shared access"
                    >
                      <Trash2 size={11} />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
