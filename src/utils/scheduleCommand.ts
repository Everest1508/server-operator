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

export function buildScheduleInstallCommand(command: string, runAt: Date, marker: string, isWindows: boolean, cwd?: string): string {
  const logPath = scheduleLogPath(marker, isWindows);

  if (isWindows) {
    const taskName = `Serop_${marker}`;
    const sd = `${pad2(runAt.getMonth() + 1)}/${pad2(runAt.getDate())}/${runAt.getFullYear()}`;
    const st = `${pad2(runAt.getHours())}:${pad2(runAt.getMinutes())}`;
    const run = cwd ? `cd /d \"${cwd}\" && ${command}` : command;
    const inner = `cmd /c (${run}) >> "${logPath}" 2>&1 & schtasks /delete /tn "${taskName}" /f`;
    return `schtasks /create /tn "${taskName}" /sc once /sd ${sd} /st ${st} /f /tr "${inner.replace(/"/g, '\\"')}"`;
  }

  // cron fires on the target's clock/timezone (a VPS is usually UTC), so let the
  // target turn the absolute moment into its own "min hour day month" fields.
  const epoch = Math.floor(runAt.getTime() / 1000);
  // cron starts in $HOME with a bare PATH, so cd into the project, widen PATH,
  // and escape % (cron treats an unescaped % as a newline).
  const cd = cwd ? `cd '${escapeShellSingleQuotes(cwd)}' && ` : '';
  const body = `export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin; ${cd}${command}`.replace(/%/g, '\\%');
  const tail =
    ` * mkdir -p ~/.serop-scheduled; ( ${body} ) >> ${logPath} 2>&1 ; ` +
    `(crontab -l 2>/dev/null | grep -v '${marker}' | crontab -) # serop:${marker}`;
  return (
    `T=$(date -d @${epoch} '+%-M %-H %-d %-m' 2>/dev/null || date -r ${epoch} '+%-M %-H %-d %-m') && ` +
    `[ -n "$T" ] && (crontab -l 2>/dev/null; printf '%s\\n' "$T"'${escapeShellSingleQuotes(tail)}') | crontab -`
  );
}

export function buildScheduleCancelCommand(marker: string, isWindows: boolean): string {
  if (isWindows) return `schtasks /delete /tn "Serop_${marker}" /f`;
  return `crontab -l 2>/dev/null | grep -v '${marker}' | crontab -`;
}

export function buildScheduleCheckCommand(marker: string, isWindows: boolean): string {
  if (isWindows) return `(schtasks /query /tn "Serop_${marker}" >nul 2>&1 && echo FOUND) || echo NONE`;
  return `(crontab -l 2>/dev/null | grep -q '${marker}' && echo FOUND) || echo NONE`;
}
