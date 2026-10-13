import { useSyncExternalStore } from 'react';

export type NotificationKind = 'success' | 'warning' | 'error' | 'info';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message?: string;
  at: number;
  read: boolean;
  /** For deploy notifications: the job record, so a click can reopen its output. */
  job?: Record<string, unknown>;
}

const STORAGE_KEY = 'serop-notifications';
const MAX_ITEMS = 60;
const listeners = new Set<() => void>();

function load(): AppNotification[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

let items: AppNotification[] = load();

function commit(next: AppNotification[]) {
  items = next.slice(0, MAX_ITEMS);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  listeners.forEach((l) => l());
}

export function pushNotification(n: Omit<AppNotification, 'id' | 'at' | 'read'> & { id?: string }) {
  const id = n.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // the same id replaces an older entry instead of adding a duplicate
  commit([{ ...n, id, at: Date.now(), read: false }, ...items.filter((x) => x.id !== id)]);
}

export function markAllNotificationsRead() {
  if (items.some((n) => !n.read)) commit(items.map((n) => ({ ...n, read: true })));
}

export function clearNotifications() {
  commit([]);
}

export function useNotifications(): AppNotification[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
  );
}

// Record how every deploy job ends, whichever screen or server it ran on.
let deployListenersInstalled = false;
export function installDeployNotificationListeners() {
  if (deployListenersInstalled || typeof window === 'undefined') return;
  deployListenersInstalled = true;
  const record = (kind: NotificationKind, title: string) => (e: Event) => {
    const d = (e as CustomEvent<any>).detail;
    const job = d?.job;
    if (!job?.id) return;
    const code = job.exitCode;
    const exitedBadly = job.status === 'finished' && code != null && code !== 0;
    pushNotification({
      id: `job-${job.id}`,
      kind: exitedBadly ? 'warning' : kind,
      title: exitedBadly ? `Deploy exited with code ${code}` : title,
      message: d?.error || job.error ? `${job.name}: ${d?.error || job.error}` : job.name,
      job,
    });
  };
  window.addEventListener('deploy:job-finished', record('success', 'Deploy finished'));
  window.addEventListener('deploy:job-error', record('error', 'Deploy failed'));
  window.addEventListener('deploy:job-cancelled', record('info', 'Deploy cancelled'));
}
