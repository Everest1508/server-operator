import { useEffect, useRef } from 'react';
import type { ProxySettings, ServerConnection } from '../types';
import { buildScheduleCheckCommand, scheduleLogPath } from './scheduleCommand';
import { pushNotification } from './notifications';

/**
 * Scheduled jobs run on the target's own cron, so Serop can't be told when one fires.
 * Every 30s, look at jobs whose time has passed: if the cron entry removed itself the job
 * ran, so mark it, read the tail of its log and tell the user (bell, toast, system banner).
 */
export function useScheduleWatcher(servers: ServerConnection[], proxy: ProxySettings) {
  const latest = useRef({ servers, proxy });
  latest.current = { servers, proxy };

  useEffect(() => {
    const api = window.serverOperator;
    if (!api) return;
    let busy = false;

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const rows = await api.scheduleList();
        const now = Date.now();
        for (const row of rows) {
          if (row.status !== 'scheduled' || new Date(row.runAt).getTime() >= now) continue;
          const { servers: list, proxy: px } = latest.current;
          const server = list.find((s) => s.id === row.serverId);
          if (!server) continue;
          const isWindows = (server.connectionType === 'local' || server.id.startsWith('local:')) && api.platform === 'win32';
          const run = (command: string) => api.runCommand({ connection: server, command, proxy: px.enabled ? px : undefined });

          const check = await run(buildScheduleCheckCommand(row.marker, isWindows));
          if (!check.ok || !(check.stdout || '').includes('NONE')) continue;

          await api.scheduleUpdateStatus({ id: row.id, status: 'ran' });
          const log = isWindows ? null : await run(`tail -n 8 ${scheduleLogPath(row.marker, false)} 2>/dev/null`);
          const output = (log?.stdout || '').trim();
          const title = 'Scheduled command ran';
          const message = `${row.serverName}: ${row.command.split('\n')[0]}${output ? `\n${output}` : '\n(no output)'}`;
          pushNotification({ id: `sched-${row.id}`, kind: 'success', title, message });
          try { new Notification(title, { body: message }); } catch { /* system notifications unavailable */ }
        }
      } catch { /* transient SSH/db errors: try again next tick */ }
      busy = false;
    };

    const t = setInterval(() => void tick(), 30000);
    void tick();
    return () => clearInterval(t);
  }, []);
}
