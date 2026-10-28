// Allowlist check for commands run from a project connection: read-only inspection, `git pull`/`fetch`, and
// `docker compose` lifecycle in the project folder. `sudo` is accepted only in front of git and docker.
// Returns null when the command is allowed, or a short reason it was refused.

const path = require('path');

const SIMPLE = new Set(['ls', 'cat', 'head', 'tail', 'grep', 'wc', 'pwd', 'echo', 'df', 'du', 'free', 'uptime', 'whoami', 'id', 'ps', 'stat', 'ss', 'cut']);
const GIT = new Set(['status', 'log', 'diff', 'show', 'rev-parse', 'pull', 'fetch']);
const DOCKER = new Set(['ps', 'logs', 'inspect', 'images', 'stats', 'top', 'port', 'version', 'info']);
const COMPOSE = new Set(['ps', 'logs', 'config', 'top', 'images', 'ls', 'version']);
// Lifecycle only against the project folder the command runs in: no flag may point compose somewhere else.
const COMPOSE_LIFECYCLE = new Set(['up', 'down', 'restart', 'start', 'stop', 'build', 'pull']);
const SYSTEMCTL = new Set(['status', 'is-active', 'is-enabled']);
const COMPOSE_FLAGS_WITH_VALUE = new Set(['-f', '--file', '-p', '--project-name', '--project-directory', '--env-file', '--profile']);
const FIND_WRITES = /^-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)$/;

// Split into segments at && || | and reject anything that could write, chain or substitute.
function splitSegments(cmd) {
  const segments = [];
  let cur = '';
  let quote = '';
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    const rest = cmd.slice(i);
    if (quote === "'") {
      if (ch === "'") quote = '';
      cur += ch;
      continue;
    }
    if (ch === '`' || rest.startsWith('$(')) return { error: 'command substitution is not allowed' };
    if (quote === '"') {
      if (ch === '"') quote = '';
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    const redirect = rest.match(/^2>&1|^2>\s*\/dev\/null/);
    if (redirect) { i += redirect[0].length - 1; continue; }
    if (rest.startsWith('&&') || rest.startsWith('||')) { segments.push(cur); cur = ''; i++; continue; }
    if (ch === '|') { segments.push(cur); cur = ''; continue; }
    if (';&<>(){}\n\r'.includes(ch)) return { error: `"${ch === '\n' || ch === '\r' ? 'new line' : ch}" is not allowed` };
    cur += ch;
  }
  if (quote) return { error: 'unterminated quote' };
  segments.push(cur);
  return { segments };
}

function words(segment) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(segment))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

// A path given to a compose flag must stay inside the project folder (relative paths resolve against it).
function insideProject(value, projectPath) {
  const root = path.posix.normalize(String(projectPath || '')).replace(/\/+$/, '');
  if (!root || root === '.') return !value.startsWith('/') && !path.posix.normalize(value).startsWith('..');
  const abs = path.posix.normalize(value.startsWith('/') ? value : path.posix.join(root, value));
  return abs === root || abs.startsWith(root + '/');
}

function segmentProblem(segment, projectPath) {
  const t = words(segment);
  if (!t.length) return 'empty command';
  let [prog, ...args] = t;
  if (prog === 'sudo') {
    if (args[0] === '-n') args = args.slice(1);
    [prog, ...args] = args;
    if (prog !== 'git' && prog !== 'docker') return 'sudo is only allowed in front of git and docker';
  }
  if (SIMPLE.has(prog)) return null;
  if (prog === 'sort') return args.some((a) => a === '-o' || a.startsWith('--output') || /^-[a-zA-Z]*o/.test(a)) ? 'sort -o writes a file' : null;
  if (prog === 'find') return args.some((a) => FIND_WRITES.test(a)) ? 'find action can modify files' : null;
  if (prog === 'git') {
    if (!GIT.has(args[0])) return `git ${args[0] ?? ''} is not read-only`.replace('  ', ' ');
    return args.some((a) => a.startsWith('--output') || a === '--ext-diff') ? 'git option can write' : null;
  }
  if (prog === 'systemctl') return SYSTEMCTL.has(args[0]) ? null : `systemctl ${args[0] ?? ''} is not read-only`.replace('  ', ' ');
  if (prog === 'journalctl') return args.some((a) => /^--(vacuum|rotate|flush|sync|setup-keys|relinquish|smart-relinquish|update-catalog)/.test(a)) ? 'journalctl option modifies logs' : null;
  if (prog === 'docker') {
    const sub = args[0];
    if (sub === 'compose') {
      let redirected = '';
      for (let i = 1; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith('-')) {
          let flag = a;
          let value = '';
          const eq = a.match(/^(--[a-z-]+)=(.*)$/);
          const short = a.match(/^(-f|-p)(.+)$/);
          if (eq) { flag = eq[1]; value = eq[2]; }
          else if (short) { flag = short[1]; value = short[2]; }
          else if (COMPOSE_FLAGS_WITH_VALUE.has(a)) { value = args[++i] ?? ''; }
          else continue;
          if (!COMPOSE_FLAGS_WITH_VALUE.has(flag)) continue;
          if (flag === '-p' || flag === '--project-name') redirected = '-p / --project-name';
          else if (flag !== '--profile' && !insideProject(value, projectPath)) redirected = `${flag} ${value}`.trim();
          continue;
        }
        if (COMPOSE.has(a)) return null;
        if (COMPOSE_LIFECYCLE.has(a)) return redirected ? `docker compose ${a} cannot use ${redirected}: only files inside the project folder are allowed, and no -p` : null;
        return `docker compose ${a} is not allowed`;
      }
      return 'docker compose needs a read-only subcommand';
    }
    return DOCKER.has(sub) ? null : `docker ${sub ?? ''} is not read-only`.replace('  ', ' ');
  }
  return `${prog} is not in the read-only list`;
}

function readOnlyCommandProblem(cmd, projectPath) {
  const text = String(cmd || '').trim();
  if (!text) return 'empty command';
  const { segments, error } = splitSegments(text);
  if (error) return error;
  for (const s of segments) {
    const problem = segmentProblem(s.trim(), projectPath);
    if (problem) return problem;
  }
  return null;
}

module.exports = { readOnlyCommandProblem };
