import type { ServerConnection } from '../types';

export const STORAGE_KEY_SERVERS = 'server-operator-servers';

export function readStoredServers(): ServerConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SERVERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ServerConnection[]) : [];
  } catch {
    return [];
  }
}

/** Fills in `password` from `passwordEnc`. Servers without a stored password pass through unchanged. */
export async function revealServerPasswords(servers: ServerConnection[]): Promise<ServerConnection[]> {
  const api = window.serverOperator;
  const encrypted = servers.filter((s) => s.passwordEnc && !s.password);
  if (!api?.decryptSecrets || encrypted.length === 0) return servers;
  const plain = await api.decryptSecrets(encrypted.map((s) => s.passwordEnc as string));
  const byId = new Map(encrypted.map((s, i) => [s.id, plain[i]]));
  return servers.map((s) => {
    const pw = byId.get(s.id);
    return pw ? { ...s, password: pw } : s;
  });
}

/**
 * Returns the servers as they should be written to localStorage.
 * Passwords are replaced by `passwordEnc`. If the OS cannot encrypt, the plain password is kept.
 */
export async function protectServerPasswords(servers: ServerConnection[]): Promise<ServerConnection[]> {
  const api = window.serverOperator;
  const withPassword = servers.filter((s) => s.password);
  if (!api?.encryptSecrets || withPassword.length === 0) return servers;
  const out = await api.encryptSecrets(withPassword.map((s) => s.password as string));
  const byId = new Map(withPassword.map((s, i) => [s.id, out[i]]));
  return servers.map((s) => {
    if (s.password === '' && s.passwordEnc) {
      const { passwordEnc: _old, ...rest } = s;
      return rest;
    }
    const enc = byId.get(s.id);
    if (!enc || !enc.startsWith('enc:v1:')) return s;
    const { password: _drop, ...rest } = s;
    return { ...rest, passwordEnc: enc };
  });
}
