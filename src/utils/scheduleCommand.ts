import { escapeShellSingleQuotes } from './shellQuote';

/**
 * Builds one-time-job shell commands for the "scheduled commands" feature.
 * Rather than an always-on in-app scheduler (which can't fire while Serop is
 * closed — this app has no tray icon / background process), a scheduled
 * command is installed as a self-deleting job on the *target*'s own OS
 * scheduler: a crontab line pinned to one exact date (POSIX) or a one-time
 * Task Scheduler task (Windows local/dummy connections only — remote SSH
 * targets are assumed POSIX). The job removes itself once it fires, so it
 * only ever runs once.
 *
 * Cron fires on the target machine's own clock/timezone, not the user's —
 * a known, accepted v1 limitation (see the plan/CLAUDE.md notes).
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function scheduleLogPath(marker: string, isWindows: boolean): string {
  return isWindows ? `%TEMP%\\serop-scheduled-${marker}.log` : `~/.serop-scheduled/${marker}.log`;
}

export function buildScheduleInstallCommand(command: string, runAt: Date, marker: string, isWindows: boolean): string {
  const logPath = scheduleLogPath(marker, isWindows);

  if (isWindows) {
    const taskName = `Serop_${marker}`;
    const sd = `${pad2(runAt.getMonth() + 1)}/${pad2(runAt.getDate())}/${runAt.getFullYear()}`;
    const st = `${pad2(runAt.getHours())}:${pad2(runAt.getMinutes())}`;
    const inner = `cmd /c (${command}) >> "${logPath}" 2>&1 & schtasks /delete /tn "${taskName}" /f`;
    return `schtasks /create /tn "${taskName}" /sc once /sd ${sd} /st ${st} /f /tr "${inner.replace(/"/g, '\\"')}"`;
  }

  const minute = runAt.getMinutes();
  const hour = runAt.getHours();
  const day = runAt.getDate();
  const month = runAt.getMonth() + 1;
  const cronLine =
    `${minute} ${hour} ${day} ${month} * ` +
    `mkdir -p ~/.serop-scheduled; ( ${command} ) >> ${logPath} 2>&1 ; ` +
    `(crontab -l 2>/dev/null | grep -v '${marker}' | crontab -) # serop:${marker}`;
  const escaped = escapeShellSingleQuotes(cronLine);
  return `(crontab -l 2>/dev/null; echo '${escaped}') | crontab -`;
}

export function buildScheduleCancelCommand(marker: string, isWindows: boolean): string {
  if (isWindows) return `schtasks /delete /tn "Serop_${marker}" /f`;
  return `crontab -l 2>/dev/null | grep -v '${marker}' | crontab -`;
}

export function buildScheduleCheckCommand(marker: string, isWindows: boolean): string {
  if (isWindows) return `(schtasks /query /tn "Serop_${marker}" >nul 2>&1 && echo FOUND) || echo NONE`;
  return `(crontab -l 2>/dev/null | grep -q '${marker}' && echo FOUND) || echo NONE`;
}
