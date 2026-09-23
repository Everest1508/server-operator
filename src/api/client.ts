export interface ApiUser {
  id: string;
  email: string | null;
  displayName: string;
  isGuest: boolean;
}

export interface ApiTeam {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  role: string;
}

export interface ApiTeamMember {
  userId: string;
  role: string;
  joinedAt: string;
  displayName: string;
  email: string | null;
}

export interface ApiNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface ApiSharedServer {
  id: string;
  teamId: string;
  ownerId: string;
  name: string;
  host: string;
  username: string;
  connectionType: string;
  privateKeyPath: string | null;
  projectPath: string | null;
  isShareable: boolean;
  hasStoredPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SharedServerCredentials {
  id: string;
  name: string;
  host: string;
  username: string;
  connectionType: string;
  privateKeyPath: string | null;
  projectPath: string | null;
  password?: string;
}

const STORAGE_KEY_TOKEN = 'server-operator:auth-token';
const STORAGE_KEY_USER = 'server-operator:auth-user';

export function getCrmBaseUrl(): string {
  return import.meta.env.VITE_CRM_BASE_URL?.trim() || 'http://localhost:8011';
}

export function loadStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_TOKEN);
  } catch {
    return null;
  }
}

export function loadStoredUser(): ApiUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
}

export function saveAuthSession(token: string, user: ApiUser) {
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const authToken = token ?? loadStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const url = `${getCrmBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Network error';
    throw new Error(`${reason} — could not reach ${url}. Check VITE_CRM_BASE_URL and rebuild if needed.`);
  }

  let data: T & { ok?: boolean; error?: string };
  try {
    data = (await res.json()) as T & { ok?: boolean; error?: string };
  } catch {
    throw new Error(`Invalid response from ${url} (${res.status})`);
  }

  if (!res.ok || data.ok === false) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data;
}

export async function loginGuest() {
  const user: ApiUser = {
    id: `guest-${crypto.randomUUID()}`,
    email: null,
    displayName: 'Guest',
    isGuest: true,
  };
  return { token: 'guest', user };
}

export async function fetchMe(token?: string) {
  return apiRequest<{ user: ApiUser }>('/oauth/me/', {}, token);
}

export async function listTeams() {
  return apiRequest<{ teams: ApiTeam[] }>('/api/serop/teams');
}

export async function createTeam(name: string) {
  return apiRequest<{ team: ApiTeam }>('/api/serop/teams', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function fetchTeam(teamId: string) {
  return apiRequest<{ team: ApiTeam; members: ApiTeamMember[] }>(`/api/serop/teams/${teamId}`);
}

export async function inviteToTeam(teamId: string, email: string) {
  return apiRequest<{ ok: boolean }>(`/api/serop/teams/${teamId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function listInbox() {
  return apiRequest<{ notifications: ApiNotification[] }>('/api/serop/inbox');
}

export async function markNotificationRead(notificationId: string) {
  return apiRequest<{ ok: boolean }>(`/api/serop/inbox/${notificationId}/read`, { method: 'POST' });
}

export async function listSharedServers() {
  return apiRequest<{ servers: ApiSharedServer[] }>('/api/serop/shared-servers');
}

export async function shareServer(payload: {
  teamId: string;
  name: string;
  host: string;
  username: string;
  connectionType?: string;
  privateKeyPath?: string;
  projectPath?: string;
  password?: string;
}) {
  return apiRequest<{ server: ApiSharedServer }>('/api/serop/shared-servers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchSharedServerCredentials(serverId: string) {
  return apiRequest<{ credentials: SharedServerCredentials }>(`/api/serop/shared-servers/${serverId}/credentials`);
}

export async function deleteSharedServer(serverId: string) {
  return apiRequest<{ ok: boolean }>(`/api/serop/shared-servers/${serverId}`, { method: 'DELETE' });
}

export function connectInboxWebSocket(token: string, onMessage: (data: unknown) => void): WebSocket | null {
  try {
    const base = getCrmBaseUrl().replace(/^http/, 'ws');
    const ws = new WebSocket(`${base}/ws/inbox/?token=${encodeURIComponent(token)}`);
    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data as string));
      } catch {
        // ignore malformed messages
      }
    };
    return ws;
  } catch {
    return null;
  }
}
