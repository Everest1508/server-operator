import { useSyncExternalStore } from 'react';

export type LivePhase = 'countdown' | 'running' | 'done' | 'failed' | 'stopped';

/** The one scheduled job whose toast is on screen: counting down, running live, or just ended. */
export interface LiveSchedule {
  rowId: number;
  name: string;
  runAt: number;
  phase: LivePhase;
  output: string;
  code?: number;
  /** Cancel a job that has not started (countdown) or stop one that is running. */
  act?: () => void | Promise<void>;
}

let live: LiveSchedule | null = null;
const listeners = new Set<() => void>();

export function setLiveSchedule(next: LiveSchedule | null) {
  live = next;
  listeners.forEach((l) => l());
}

export function getLiveSchedule() {
  return live;
}

export function useLiveSchedule(): LiveSchedule | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => live,
  );
}

const dismissed = new Set<number>();

/** Close the toast for good: the watcher will not reopen it for this job. */
export function dismissLiveSchedule(rowId: number) {
  dismissed.add(rowId);
  if (live?.rowId === rowId) setLiveSchedule(null);
}

export function isLiveDismissed(rowId: number) {
  return dismissed.has(rowId);
}
