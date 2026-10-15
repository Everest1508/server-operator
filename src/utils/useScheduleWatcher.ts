import { useEffect, useRef } from 'react';
import type { ProxySettings, ServerConnection } from '../types';
import { buildScheduleCancelCommand, buildScheduleCheckCommand, buildScheduleStopCommand, scheduleLogPath } from './scheduleCommand';
import { pushNotification } from './notifications';
import { getLiveSchedule, isLiveDismissed, setLiveSchedule } from './scheduleLive';

// job-control chatter the shell prints when a job is stopped (it includes the encoded script)
const NOISE_RE = /^(sh|bash): line \d+: +\d+ +(Done|Terminated|Killed)|^\s+\d+\s+\| (base64|sh)/;
const clean = (t: string) => t.split('\n').filter((l) => !NOISE_RE.test(l)).join('\n');
const EXIT_RE = /\[serop-exit:(\d+)\]/;
const SLOW_MS = 30000;
const FAST_MS = 2000;

/** Kill a running scheduled job on its server (shell + direct children). */
export async function stopScheduledJob(server: ServerConnection, proxy: ProxySettings, id: number, marker: string) {
  const api = window.serverOperator;
  await api.runCommand({ connection: server, command: buildScheduleStopCommand(marker), proxy: proxy.enabled ? proxy : undefined });
  await api.scheduleUpdateStatus({ id, status: 'cancelled' });
}

/**
 * Scheduled jobs run on the target's own cron, so Serop can't be told when one fires. It polls the
 * jobs whose time is near or past: the cron entry removes itself when the job starts ("running")
 * and the job writes its exit code to its log when it ends. While a job is within a minute of
 * starting, or running, polling speeds up and drives the live toast (countdown, then live output).
 */
export function useScheduleWatcher(servers: ServerConnection[], proxy: ProxySettings) {
  const latest = useRef({ servers, proxy });
  latest.current = { servers, proxy };

  useEffect(() => {
    const api = window.serverOperator;
    if (!api) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const lateWarned = new Set<number>();

    const announce = (id: string, kind: 'success' | 'error' | 'info' | 'warning', title: string, message: string) => {
      pushNotification({ id, kind, title, message, quiet: true });
      try { new Notification(title, { body: message }); } catch { /* system notifications unavailable */ }
    };

    const tick = async (): Promise<boolean> => {
      let fast = false;
      const rows = await api.scheduleList();
      const now = Date.now();
      const open = rows.filter((r) => r.status === 'scheduled' || r.status === 'running');
      const cur = getLiveSchedule();
      // a job that was cancelled or deleted elsewhere: drop its toast
      if (cur && (cur.phase === 'countdown' || cur.phase === 'running') && !open.some((r) => r.id === cur.rowId)) setLiveSchedule(null);

      for (const row of open) {
        const due = new Date(row.runAt).getTime();
        const { servers: list, proxy: px } = latest.current;
        const server = list.find((s) => s.id === row.serverId);
        if (!server) continue;
        const isWindows = (server.connectionType === 'local' || server.id.startsWith('local:')) && api.platform === 'win32';
        const run = (command: string) => api.runCommand({ connection: server, command, proxy: px.enabled ? px : undefined });
        const what = `${row.serverName}: ${row.command.split('\n')[0]}`;
        const showLive = !isLiveDismissed(row.id);

        if (row.status === 'scheduled') {
          if (due - now > 60000) continue;
          fast = true;
          if (showLive && now < due + 120000) {
            const mine = getLiveSchedule();
            if (!mine || mine.rowId !== row.id || mine.phase !== 'countdown') {
              setLiveSchedule({
                rowId: row.id, name: what, runAt: due, phase: 'countdown', output: '',
                act: async () => {
                  await run(buildScheduleCancelCommand(row.marker, isWindows));
                  await api.scheduleUpdateStatus({ id: row.id, status: 'cancelled' });
                  setLiveSchedule(null);
                },
              });
            }
          }
          if (due > now) continue;
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

        // running: stream the log into the toast until the exit code shows up
        fast = true;
        if (isWindows) {
          await api.scheduleUpdateStatus({ id: row.id, status: 'ran' });
          continue;
        }
        const log = await run(`tail -n 60 ${scheduleLogPath(row.marker, false)} 2>/dev/null`);
        const text = (log.stdout || '').trimEnd();
        const m = text.match(EXIT_RE);
        const output = clean(text.replace(EXIT_RE, '')).trim();
        const act = async () => {
          await stopScheduledJob(server, latest.current.proxy, row.id, row.marker);
        };
        if (!m) {
          if (showLive) setLiveSchedule({ rowId: row.id, name: what, runAt: due, phase: 'running', output, act });
          continue;
        }
        const code = Number(m[1]);
        const wasStopped = code === 143 || code === 137;
        await api.scheduleUpdateStatus({ id: row.id, status: code === 0 ? 'ran' : wasStopped ? 'cancelled' : 'error' });
        const tail = output.split('\n').slice(-6).join('\n') || '(no output)';
        if (showLive) setLiveSchedule({ rowId: row.id, name: what, runAt: due, phase: code === 0 ? 'done' : wasStopped ? 'stopped' : 'failed', output, code });
        announce(
          `sched-${row.id}`,
          code === 0 ? 'success' : 'error',
          code === 0 ? 'Scheduled command finished' : wasStopped ? 'Scheduled command stopped' : `Scheduled command failed (exit ${code})`,
          `${what}\n${tail}`,
        );
      }
      return fast;
    };

    const loop = async () => {
      let fast = false;
      try { fast = await tick(); } catch { /* transient SSH/db errors: try again next tick */ }
      if (!stopped) timer = setTimeout(loop, fast ? FAST_MS : SLOW_MS);
    };
    void loop();
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
}
