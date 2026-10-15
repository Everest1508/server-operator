import { useEffect, useRef } from 'react';
import type { ProxySettings, ServerConnection } from '../types';
import { buildScheduleCheckCommand, EXIT_TAG, scheduleLogPath } from './scheduleCommand';
import { pushNotification } from './notifications';

/**
 * Scheduled jobs run on the target's own cron, so Serop can't be told when one fires.
 * Every 30s it checks the jobs whose time has passed: the cron entry removes itself when the
 * job starts ("running"), and the job writes its exit code to its log when it ends ("ran" / "error").
 * Each step is announced with a toast, a bell entry and a system notification.
 */
export function useScheduleWatcher(servers: ServerConnection[], proxy: ProxySettings) {
  const latest = useRef({ servers, proxy });
  latest.current = { servers, proxy };

  useEffect(() => {
    const api = window.serverOperator;
    if (!api) return;
    let busy = false;
    const lateWarned = new Set<number>();

    const announce = (id: string, kind: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
      pushNotification({ id, kind, title, message });
      try { new Notification(title, { body: message }); } catch { /* system notifications unavailable */ }
    };

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const rows = await api.scheduleList();
        const now = Date.now();
        for (const row of rows) {
          const due = new Date(row.runAt).getTime();
          if ((row.status !== 'scheduled' && row.status !== 'running') || due >= now) continue;
          const { servers: list, proxy: px } = latest.current;
          const server = list.find((s) => s.id === row.serverId);
          if (!server) continue;
          const isWindows = (server.connectionType === 'local' || server.id.startsWith('local:')) && api.platform === 'win32';
          const run = (command: string) => api.runCommand({ connection: server, command, proxy: px.enabled ? px : undefined });
          const what = `${row.serverName}: ${row.command.split('\n')[0]}`;

          if (row.status === 'scheduled') {
            const check = await run(buildScheduleCheckCommand(row.marker, isWindows));
            if (!check.ok) continue;
            if (!(check.stdout || '').includes('NONE')) {
              // still installed well after its time: cron did not fire it
              if (now - due > 2 * 60000 && !lateWarned.has(row.id)) {
                lateWarned.add(row.id);
                announce(`sched-late-${row.id}`, 'warning', 'Scheduled command has not started', `${what}\nIt is past its time but still waiting in cron. Is the cron service running on the server?`);
              }
              continue;
            }
            await api.scheduleUpdateStatus({ id: row.id, status: 'running' });
            row.status = 'running';
            announce(`sched-${row.id}`, 'info', 'Scheduled command started', what);
          }

          if (isWindows) {
            await api.scheduleUpdateStatus({ id: row.id, status: 'ran' });
            continue;
          }
          const log = await run(`tail -n 12 ${scheduleLogPath(row.marker, false)} 2>/dev/null`);
          const text = (log.stdout || '').trim();
          const m = text.match(/\[serop-exit:(\d+)\]/);
          if (!m) continue; // still running
          const code = Number(m[1]);
          const output = text.replace(/\[serop-exit:\d+\]/, '').trim().split('\n').slice(-6).join('\n');
          await api.scheduleUpdateStatus({ id: row.id, status: code === 0 ? 'ran' : 'error' });
          announce(
            `sched-${row.id}`,
            code === 0 ? 'success' : 'error',
            code === 0 ? 'Scheduled command finished' : `Scheduled command failed (exit ${code})`,
            `${what}\n${output || '(no output)'}`,
          );
        }
      } catch { /* transient SSH/db errors: try again next tick */ }
      busy = false;
    };

    const t = setInterval(() => void tick(), 30000);
    void tick();
    return () => clearInterval(t);
  }, []);
}
