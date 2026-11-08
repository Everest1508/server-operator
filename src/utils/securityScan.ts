// Security check: one read-only shell script runs on the server, prints tab-separated records, and the
// renderer turns them into findings. Nothing in the script changes the server. Fixes are offered separately
// and only run when the user confirms one.
//
// The script avoids ${...} so it can live in a template literal, and it is sent base64-encoded so the
// user's login shell never has to parse it.

export type Severity = 'critical' | 'warning' | 'info' | 'ok';

export interface Finding {
  id: string;
  severity: Severity;
  category: 'Exposure' | 'Passwords' | 'Compromise' | 'SSH' | 'Firewall' | 'Scan';
  title: string;
  detail: string;
  /** Copyable instructions or commands. */
  fix?: string;
  /** A single command the app can run for the user, after a confirm. */
  runFix?: { label: string; command: string; confirm: string };
}

export interface PortMapping {
  hostIp: string;
  hostPort: string;
  ctrPort: string;
  proto: string;
  public: boolean;
}

export interface ScanContainer {
  name: string;
  image: string;
  ports: PortMapping[];
  configFiles: string;
  service: string;
}

export interface ScanData {
  complete: boolean;
  priv: 'root' | 'sudo' | 'none';
  docker: 'ok' | 'denied' | 'none' | 'unknown';
  iface: string;
  containers: ScanContainer[];
  redisPing: Record<string, string>;
  redisData: Record<string, string[]>;
  envPasswords: { container: string; variable: string; verdict: string; length: number }[];
  drift: { container: string; path: string }[];
  listeners: { local: string; process: string }[];
  top: { pid: string; user: string; cpu: number; args: string }[];
  miners: { pid: string; user: string; args: string }[];
  badExe: { pid: string; exe: string }[];
  poolConns: string[];
  sshd: Record<string, string>;
  authorizedKeys: number | null;
  ufw: string | null;
  dockerUserRules: number | null;
  proxies: string[];
}

const SCAN_SCRIPT = `
PRIV=none
if [ "$(id -u)" = "0" ]; then PRIV=root; elif sudo -n true 2>/dev/null; then PRIV=sudo; fi
S() { if [ "$PRIV" = sudo ]; then sudo -n "$@"; else "$@"; fi; }
echo "SEROP_SCAN 1"
printf 'PRIV\\t%s\\n' "$PRIV"
printf 'IFACE\\t%s\\n' "$(ip route 2>/dev/null | awk '/^default/{print $5; exit}')"

D=""
if command -v docker >/dev/null 2>&1; then
  if docker ps -q >/dev/null 2>&1; then D="docker"
  elif [ "$PRIV" = sudo ] && sudo -n docker ps -q >/dev/null 2>&1; then D="sudo -n docker"
  elif [ "$PRIV" = root ]; then D="docker"; fi
  if [ -n "$D" ]; then printf 'DOCKER\\tok\\n'; else printf 'DOCKER\\tdenied\\n'; fi
else
  printf 'DOCKER\\tnone\\n'
fi

if [ -n "$D" ]; then
  $D ps --format '{{.Names}}\\t{{.Image}}\\t{{.Ports}}\\t{{.Label "com.docker.compose.project.config_files"}}\\t{{.Label "com.docker.compose.service"}}' 2>/dev/null | while IFS= read -r l; do printf 'CT\\t%s\\n' "$l"; done
  for c in $($D ps --format '{{.Names}}' 2>/dev/null); do
    img=$($D inspect -f '{{.Config.Image}}' "$c" 2>/dev/null)
    case "$img" in
      *redis*|*valkey*|*keydb*)
        r=$(timeout 6 $D exec "$c" sh -c 'unset REDISCLI_AUTH; (redis-cli ping || valkey-cli ping) 2>&1' 2>&1 | head -1)
        printf 'REDISPING\\t%s\\t%s\\n' "$c" "$r"
        f=$(timeout 6 $D exec "$c" sh -c 'ls -A /data 2>/dev/null' 2>/dev/null | tr '\\n' ' ')
        printf 'REDISDATA\\t%s\\t%s\\n' "$c" "$f"
        ;;
    esac
    $D inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$c" 2>/dev/null | while IFS= read -r kv; do
      k=$(printf '%s' "$kv" | cut -d= -f1)
      v=$(printf '%s' "$kv" | cut -d= -f2-)
      case "$k" in
        POSTGRES_HOST_AUTH_METHOD)
          [ "$v" = trust ] && printf 'ENVPW\\t%s\\t%s\\ttrust\\t0\\n' "$c" "$k" ;;
        MYSQL_ALLOW_EMPTY_PASSWORD|ALLOW_EMPTY_PASSWORD)
          case "$v" in yes|1|true) printf 'ENVPW\\t%s\\t%s\\tempty\\t0\\n' "$c" "$k" ;; esac ;;
        POSTGRES_PASSWORD|MYSQL_ROOT_PASSWORD|MYSQL_PASSWORD|MARIADB_ROOT_PASSWORD|MARIADB_PASSWORD|MONGO_INITDB_ROOT_PASSWORD|REDIS_PASSWORD|PGADMIN_DEFAULT_PASSWORD|RABBITMQ_DEFAULT_PASS)
          n=$(printf '%s' "$v" | wc -c | tr -d ' ')
          w=ok
          [ "$n" -lt 16 ] && w=weak
          printf '%s' "$v" | grep -qiE 'pass|admin|root|secret|changeme|postgres|mysql|test|demo|qwerty|letmein|12345' && w=weak
          printf 'ENVPW\\t%s\\t%s\\t%s\\t%s\\n' "$c" "$k" "$w" "$n" ;;
      esac
    done
    $D diff "$c" 2>/dev/null | awk -v c="$c" '$1=="A" && $2 ~ /^\\/(tmp|var\\/tmp|dev\\/shm)\\/\\./ {printf "DRIFT\\t%s\\t%s\\n", c, $2}' | head -5
  done
fi

S ss -tlnpH 2>/dev/null | awk '{print $4 "\\t" $6}' | while IFS= read -r l; do printf 'LST\\t%s\\n' "$l"; done

ps -eo pid=,user=,pcpu=,args= --sort=-pcpu 2>/dev/null | head -8 | while IFS= read -r l; do printf 'TOP\\t%s\\n' "$l"; done
ps -eo pid=,user=,args= 2>/dev/null | grep -iE 'xmrig|minerd|cpuminer|stratum[+]|[.]syscache|sc-node|kdevtmpfsi|kinsing|c3pool|supportxmr|nanopool|moneroocean' | grep -v grep | head -10 | while IFS= read -r l; do printf 'MINER\\t%s\\n' "$l"; done
S sh -c 'for p in /proc/[0-9]*; do e=$(readlink "$p/exe" 2>/dev/null) || continue; case "$e" in /memfd:*) ;; /tmp/*|/var/tmp/*|/dev/shm/*|/data/.*|*" (deleted)") printf "BADEXE\\t%s\\t%s\\n" "$(basename "$p")" "$e";; esac; done' 2>/dev/null | head -15
ss -tnH state established 2>/dev/null | awk '{print $4}' | grep -E ':(3333|4444|5555|7777|10128|14433|14444|20128|45700)$' | head -5 | while IFS= read -r l; do printf 'POOL\\t%s\\n' "$l"; done

if [ "$PRIV" != none ]; then
  S sshd -T 2>/dev/null | grep -iE '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication) ' | while read -r k v; do printf 'SSHD\\t%s\\t%s\\n' "$k" "$v"; done
fi
n=0
[ -f "$HOME/.ssh/authorized_keys" ] && n=$(grep -cE '^(ssh-|ecdsa-|sk-)' "$HOME/.ssh/authorized_keys")
printf 'AUTHKEYS\\t%s\\n' "$n"

if [ "$PRIV" != none ]; then
  if command -v ufw >/dev/null 2>&1 || [ -x /usr/sbin/ufw ]; then printf 'UFW\\t%s\\n' "$(S ufw status 2>/dev/null | head -1)"; fi
  if [ -n "$D" ]; then printf 'DUSER\\t%s\\n' "$(S iptables -S DOCKER-USER 2>/dev/null | grep -- '-A DOCKER-USER' | grep -vc RETURN)"; fi
fi
for x in nginx caddy cloudflared traefik haproxy apache2 httpd; do pgrep -x "$x" >/dev/null 2>&1 && printf 'PROXY\\t%s\\n' "$x"; done
echo "SEROP_SCAN_END"
`;

/** The command to send through runCommand. The script is ASCII, so btoa is safe. */
export function buildScanCommand(): string {
  return `echo ${btoa(SCAN_SCRIPT)} | base64 -d | sh 2>/dev/null`;
}

const PORT_RE = /(?:(\d{1,3}(?:\.\d{1,3}){3}|\[[^\]]*\]|::):)?(\d+)(?:-\d+)?->(\d+)(?:-\d+)?\/(tcp|udp)/g;

export function parsePorts(raw: string): PortMapping[] {
  const out: PortMapping[] = [];
  for (const m of raw.matchAll(PORT_RE)) {
    const hostIp = m[1] ?? '0.0.0.0';
    const local = hostIp.startsWith('127.') || hostIp === '[::1]' || hostIp === '::1';
    out.push({ hostIp, hostPort: m[2], ctrPort: m[3], proto: m[4], public: !local });
  }
  return out;
}

export function parseScan(raw: string): ScanData {
  const d: ScanData = {
    complete: raw.includes('SEROP_SCAN_END'),
    priv: 'none', docker: 'unknown', iface: '', containers: [], redisPing: {}, redisData: {}, envPasswords: [],
    drift: [], listeners: [], top: [], miners: [], badExe: [], poolConns: [], sshd: {}, authorizedKeys: null,
    ufw: null, dockerUserRules: null, proxies: [],
  };
  for (const line of raw.split('\n')) {
    const f = line.replace(/\r$/, '').split('\t');
    switch (f[0]) {
      case 'PRIV': d.priv = (f[1] as ScanData['priv']) || 'none'; break;
      case 'IFACE': d.iface = (f[1] || '').trim(); break;
      case 'DOCKER': d.docker = (f[1] as ScanData['docker']) || 'unknown'; break;
      case 'CT': d.containers.push({ name: f[1] || '', image: f[2] || '', ports: parsePorts(f[3] || ''), configFiles: f[4] || '', service: f[5] || '' }); break;
      case 'REDISPING': d.redisPing[f[1]] = (f[2] || '').trim(); break;
      case 'REDISDATA': d.redisData[f[1]] = (f[2] || '').trim().split(/\s+/).filter(Boolean); break;
      case 'ENVPW': d.envPasswords.push({ container: f[1], variable: f[2], verdict: f[3], length: Number(f[4]) || 0 }); break;
      case 'DRIFT': d.drift.push({ container: f[1], path: f[2] }); break;
      case 'LST': if (f[1]) d.listeners.push({ local: f[1], process: f[2] || '' }); break;
      case 'TOP': {
        const m = (f.slice(1).join('\t')).trim().match(/^(\d+)\s+(\S+)\s+([\d.]+)\s+(.*)$/);
        if (m) d.top.push({ pid: m[1], user: m[2], cpu: Number(m[3]), args: m[4] });
        break;
      }
      case 'MINER': {
        const m = (f.slice(1).join('\t')).trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
        if (m) d.miners.push({ pid: m[1], user: m[2], args: m[3] });
        break;
      }
      case 'BADEXE': d.badExe.push({ pid: f[1], exe: f[2] || '' }); break;
      case 'POOL': d.poolConns.push(f[1]); break;
      case 'SSHD': if (f[1]) d.sshd[f[1].toLowerCase()] = (f[2] || '').toLowerCase(); break;
      case 'AUTHKEYS': d.authorizedKeys = Number(f[1]) || 0; break;
      case 'UFW': d.ufw = (f[1] || '').trim(); break;
      case 'DUSER': d.dockerUserRules = Number(f[1]) || 0; break;
      case 'PROXY': if (f[1]) d.proxies.push(f[1]); break;
    }
  }
  return d;
}

// Container ports and images that hold data and should never face the internet.
const DB_PORTS = new Set(['5432', '3306', '6379', '27017', '27018', '9200', '9300', '11211', '5984', '8086', '1433', '26257', '9042', '7687', '8123', '9000', '5672', '2379']);
const DB_IMAGE = /(postgres|postgis|timescale|mysql|mariadb|redis|valkey|keydb|mongo(?!-express)|elasticsearch|opensearch|memcached|couchdb|influxdb|cassandra|neo4j|rabbitmq|mssql|clickhouse|etcd)/i;
const ADMIN_IMAGE = /(pgadmin|adminer|phpmyadmin|mongo-express|redis-commander|redisinsight|portainer|kibana)/i;
const REDIS_IMAGE = /(redis|valkey|keydb)/i;
const REDIS_DATA_OK = /^(dump\.rdb|appendonly\.aof|appendonlydir|temp-.*\.rdb|.*\.rdb|.*\.aof)$/;
const LISTEN_DB_PORT = /:(5432|3306|6379|6380|6381|27017|9200|11211|5984|8086|1433|9042|7687|2379)$/;

const uniqBy = <T,>(arr: T[], key: (t: T) => string) => {
  const seen = new Set<string>();
  return arr.filter((t) => { const k = key(t); if (seen.has(k)) return false; seen.add(k); return true; });
};

function composeHint(c: ScanContainer, p: PortMapping): string {
  const file = c.configFiles.split(',')[0];
  const where = file ? `In ${file}, under the "${c.service || c.name}" service` : `In the compose file for ${c.name}`;
  const dir = file ? file.replace(/\/[^/]+$/, '') : '<project folder>';
  return `${where}, change the port line\n  - "${p.hostPort}:${p.ctrPort}"\nto\n  - "127.0.0.1:${p.hostPort}:${p.ctrPort}"\n(or delete the ports: block if nothing outside Docker needs it), then run:\n  cd ${dir} && docker compose up -d ${c.service || ''}`.trimEnd();
}

function blockCommand(iface: string, hostPort: string): string {
  const ifPart = iface ? `-i ${iface} ` : '';
  return `sudo iptables -I DOCKER-USER ${ifPart}-p tcp -m conntrack --ctorigdstport ${hostPort} --ctdir ORIGINAL -j DROP`;
}

export function analyzeScan(d: ScanData): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);
  const byName = new Map(d.containers.map((c) => [c.name, c]));
  const isPublic = (name: string) => !!byName.get(name)?.ports.some((p) => p.public);

  if (!d.complete) {
    add({ id: 'scan-incomplete', severity: 'warning', category: 'Scan', title: 'The scan did not finish', detail: 'The server stopped responding part-way, so some checks are missing. Run it again.' });
  }

  // ── Exposure ──
  const otherPublic: string[] = [];
  for (const c of d.containers) {
    const pub = uniqBy(c.ports.filter((p) => p.public), (p) => `${p.hostPort}/${p.proto}`);
    if (pub.length === 0) continue;
    const isDb = DB_IMAGE.test(c.image) || pub.some((p) => DB_PORTS.has(p.ctrPort));
    const isAdmin = ADMIN_IMAGE.test(c.image);
    if (isDb) {
      const first = pub[0];
      add({
        id: `exposed-db-${c.name}`,
        severity: 'critical',
        category: 'Exposure',
        title: `${c.name} (${c.image}) is reachable from the internet on port ${pub.map((p) => p.hostPort).join(', ')}`,
        detail: 'Bots scan the whole internet for open databases within hours. With no password, or a guessable one, they read your data, wipe it for ransom, or run a crypto miner inside the container. Docker publishes ports past UFW, so the firewall does not protect this.',
        fix: `${composeHint(c, first)}\n\nTo block it right now, until you change the compose file:\n  ${blockCommand(d.iface, first.hostPort)}`,
        runFix: {
          label: `Block port ${first.hostPort} now`,
          command: pub.map((p) => blockCommand(d.iface, p.hostPort)).join(' && '),
          confirm: `Block port ${pub.map((p) => p.hostPort).join(', ')} from the internet?\n\nApps on this server can still reach ${c.name}. The block lasts until the server reboots, so also change the compose file.`,
        },
      });
    } else if (isAdmin) {
      add({
        id: `exposed-admin-${c.name}`,
        severity: 'warning',
        category: 'Exposure',
        title: `Admin panel ${c.name} (${c.image}) is open to the internet on port ${pub.map((p) => p.hostPort).join(', ')}`,
        detail: 'Database admin panels are a favourite target for password guessing, and they hold the keys to every database they manage.',
        fix: `${composeHint(c, pub[0])}\n\nThen reach it through an SSH tunnel:\n  ssh -L ${pub[0].hostPort}:127.0.0.1:${pub[0].hostPort} user@this-server`,
      });
    } else {
      otherPublic.push(...pub.map((p) => `${c.name} → ${p.hostPort}`));
    }
  }
  if (otherPublic.length > 0 && d.proxies.length > 0) {
    add({
      id: 'exposed-apps',
      severity: 'info',
      category: 'Exposure',
      title: `${otherPublic.length} app port${otherPublic.length === 1 ? '' : 's'} open to the internet next to ${d.proxies.join(', ')}`,
      detail: `${otherPublic.join(', ')}\n\nIf ${d.proxies.join('/')} already forwards traffic to these apps, they don't need to be public. Binding them to 127.0.0.1 hides unauthenticated debug pages and admin routes.`,
      fix: 'In each compose file, change "8000:8000" to "127.0.0.1:8000:8000", then run docker compose up -d.',
    });
  }
  for (const l of d.listeners) {
    if (/docker-proxy/.test(l.process)) continue;
    const isAll = /^(0\.0\.0\.0|\*|\[::\]|::):/.test(l.local);
    if (!isAll || !LISTEN_DB_PORT.test(l.local)) continue;
    const proc = l.process.match(/\(\("([^"]+)"/)?.[1] || 'A program';
    add({
      id: `listen-${l.local}`,
      severity: 'critical',
      category: 'Exposure',
      title: `${proc} listens on ${l.local} for everyone`,
      detail: 'This database is installed directly on the server and accepts connections from any address.',
      fix: 'Set it to listen on 127.0.0.1 only (bind 127.0.0.1 for Redis, listen_addresses = \'localhost\' for Postgres, bind-address = 127.0.0.1 for MySQL), then restart it. Also deny the port in UFW.',
    });
  }

  // ── Passwords ──
  for (const [name, reply] of Object.entries(d.redisPing)) {
    if (!/PONG/i.test(reply)) continue;
    const pub = isPublic(name);
    add({
      id: `redis-nopass-${name}`,
      severity: pub ? 'critical' : 'warning',
      category: 'Passwords',
      title: `Redis ${name} has no password`,
      detail: pub
        ? 'It is also published to the internet. This is the exact setup that crypto-mining worms look for.'
        : 'Only containers on its Docker network can reach it today, but one changed ports: line would expose it. Add a password as a second layer.',
      fix: 'In the compose file:\n  command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes\n  environment:\n    REDISCLI_AUTH: ${REDIS_PASSWORD}   # keeps the healthcheck working\nAdd REDIS_PASSWORD=$(openssl rand -hex 32) to .env, pass it to the app (redis://:PASSWORD@redis:6379), then docker compose up -d.',
    });
  }
  for (const e of d.envPasswords) {
    if (e.verdict === 'ok') continue;
    const pub = isPublic(e.container);
    const what = e.verdict === 'trust' ? 'lets anyone log in without a password' : e.verdict === 'empty' ? 'allows an empty root password' : `looks easy to guess (${e.length} characters or a common word)`;
    add({
      id: `weakpw-${e.container}-${e.variable}`,
      severity: pub || e.verdict !== 'weak' ? 'critical' : 'warning',
      category: 'Passwords',
      title: `${e.variable} on ${e.container} ${what}`,
      detail: pub ? 'The database is also reachable from the internet, so assume it has been tried.' : 'It is only reachable inside Docker right now, but change it before anything else exposes it.',
      fix: 'Generate a new one with: openssl rand -hex 32\nPut it in .env (not in docker-compose.yml), update the app\'s DATABASE_URL, and change it in the database too, for Postgres:\n  docker exec -it <container> psql -U <user> -c "ALTER USER <user> PASSWORD \'<new>\';"',
    });
  }

  // ── Compromise ──
  const driftByCt = new Map<string, string[]>();
  for (const x of d.drift) driftByCt.set(x.container, [...(driftByCt.get(x.container) || []), x.path]);
  for (const [name, files] of Object.entries(d.redisData)) {
    const odd = files.filter((f) => !REDIS_DATA_OK.test(f));
    if (odd.length) driftByCt.set(name, [...(driftByCt.get(name) || []), ...odd.map((f) => `/data/${f}`)]);
  }
  for (const [name, files] of driftByCt) {
    add({
      id: `drift-${name}`,
      severity: 'critical',
      category: 'Compromise',
      title: `${name} contains files it shouldn't: ${files.slice(0, 4).join(', ')}${files.length > 4 ? '…' : ''}`,
      detail: 'Hidden files in /tmp or a Redis data folder are how droppers and miners persist. Treat this container as compromised.',
      fix: `Save copies to look at later, then remove the container and its data volume and recreate it with a password and no public port:\n  docker stop ${name} && docker rm ${name}\n  docker volume ls   # find and remove its data volume\nAfterwards, change every password the container could reach.`,
      runFix: { label: `Stop ${name}`, command: `docker stop ${name}`, confirm: `Stop ${name}? Apps that use it will lose their connection until you recreate it.` },
    });
  }
  for (const m of d.miners) {
    // The pattern can also match a shell, an editor or grep whose arguments mention a miner. Only flag the
    // process when the program itself looks like one.
    const prog = (m.args.split(/\s+/)[0] || '').replace(/^.*\//, '');
    if (/^(-?(ba|da|z|k)?sh|grep|egrep|rg|less|more|vim?|nano|cat|tail|head|sudo|ssh|tmux|screen|watch|timeout|node|python3?)$/.test(prog)) continue;
    add({
      id: `miner-${m.pid}`,
      severity: 'critical',
      category: 'Compromise',
      title: `Possible crypto miner running (PID ${m.pid}, user ${m.user})`,
      detail: m.args.slice(0, 200),
      fix: 'Find which container it belongs to (cat /proc/<pid>/cgroup) and remove that container and its volumes. If it is not in a container, the host itself is compromised: reinstall.',
      runFix: { label: `Kill PID ${m.pid}`, command: `sudo kill -9 ${m.pid}`, confirm: `Kill process ${m.pid}? It may come back if its container restarts it.` },
    });
  }
  const tmpExe = d.badExe.filter((b) => !/\(deleted\)$/.test(b.exe));
  for (const b of tmpExe) {
    add({
      id: `badexe-${b.pid}`,
      severity: 'critical',
      category: 'Compromise',
      title: `PID ${b.pid} runs a program from ${b.exe}`,
      detail: 'Legitimate software does not run from temporary or hidden data folders. This is how malware usually runs.',
      fix: `Check it: ps -o pid,user,args -p ${b.pid}; cat /proc/${b.pid}/cgroup`,
    });
  }
  const deletedExe = d.badExe.filter((b) => /\(deleted\)$/.test(b.exe));
  if (deletedExe.length) {
    add({
      id: 'deleted-exe',
      severity: 'info',
      category: 'Compromise',
      title: `${deletedExe.length} process${deletedExe.length === 1 ? '' : 'es'} run from a deleted file`,
      detail: `${deletedExe.slice(0, 5).map((b) => `${b.pid}: ${b.exe}`).join('\n')}\n\nThis is usually just a service that hasn't been restarted since an update. Malware also deletes its file after starting, so check anything you don't recognise.`,
    });
  }
  for (const c of d.poolConns) {
    add({ id: `pool-${c}`, severity: 'critical', category: 'Compromise', title: `Connection to a mining-pool port: ${c}`, detail: 'Ports like 3333, 4444 and 14444 are used by mining pools.', fix: 'Find the process with: sudo ss -tnp | grep ' + c });
  }
  const minerPids = new Set(out.filter((f) => f.id.startsWith('miner-')).map((f) => f.id.slice(6)));
  for (const t of d.top) {
    if (t.cpu < 80 || minerPids.has(t.pid)) continue;
    add({ id: `cpu-${t.pid}`, severity: 'warning', category: 'Compromise', title: `PID ${t.pid} is using ${t.cpu}% CPU`, detail: `${t.user}: ${t.args.slice(0, 200)}\n\nMiners usually sit near 100%. If you don't recognise this program, look closer.` });
  }

  // ── SSH ──
  if (d.sshd.passwordauthentication === 'yes') {
    const noKeys = d.authorizedKeys === 0;
    add({
      id: 'ssh-password',
      severity: 'warning',
      category: 'SSH',
      title: 'SSH accepts passwords',
      detail: noKeys
        ? 'Your account has no SSH keys either, so a guessed or leaked password is enough to get in.'
        : 'Bots try password logins on every server around the clock. Keys can\'t be guessed.',
      fix: `${noKeys ? 'First, on your own computer:\n  ssh-copy-id user@this-server\nand check that key login works. Then on the server:\n' : 'On the server:\n'}  sudo sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sudo grep -rl 'PasswordAuthentication yes' /etc/ssh/sshd_config.d/ | xargs -r sudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/'
  sudo sshd -t && sudo systemctl restart ssh
Keep your current session open until a new login works.`,
    });
  }
  if (d.sshd.permitrootlogin === 'yes') {
    add({ id: 'ssh-root', severity: 'warning', category: 'SSH', title: 'SSH allows root to log in with a password', detail: 'Root is the first account bots try.', fix: 'Set PermitRootLogin prohibit-password (or no) in /etc/ssh/sshd_config, then: sudo sshd -t && sudo systemctl restart ssh' });
  }

  // ── Firewall ──
  const anyPublicDocker = d.containers.some((c) => c.ports.some((p) => p.public));
  if (d.ufw !== null && /inactive/i.test(d.ufw)) {
    add({ id: 'ufw-off', severity: 'warning', category: 'Firewall', title: 'The UFW firewall is off', detail: 'Any program that starts listening on a port is immediately reachable from the internet.', fix: 'Open the Firewall rules tab, allow SSH (22) plus 80 and 443, then turn the firewall on.' });
  } else if (d.ufw !== null && /active/i.test(d.ufw) && anyPublicDocker) {
    add({ id: 'ufw-docker', severity: 'info', category: 'Firewall', title: 'Docker ports skip UFW', detail: 'Ports published by Docker (0.0.0.0:...) are reachable even when UFW denies them. Docker\'s own iptables rules run before UFW\'s. Bind ports to 127.0.0.1, or add DOCKER-USER rules.' });
  }

  // ── Coverage notes ──
  if (d.docker === 'denied') {
    add({ id: 'docker-denied', severity: 'warning', category: 'Scan', title: 'Couldn\'t read Docker', detail: 'This user isn\'t in the docker group and can\'t use sudo without a password, so containers weren\'t checked.', fix: 'sudo usermod -aG docker $USER   (then reconnect)' });
  }
  if (d.priv === 'none') {
    add({ id: 'no-sudo', severity: 'info', category: 'Scan', title: 'Some checks were skipped', detail: 'SSH settings, the firewall and other users\' processes need root. This user can\'t use sudo without a password, so those checks were skipped.' });
  }

  if (!out.some((f) => f.severity === 'critical' || f.severity === 'warning')) {
    add({ id: 'all-good', severity: 'ok', category: 'Scan', title: 'No problems found', detail: `Checked ${d.containers.length} container${d.containers.length === 1 ? '' : 's'}, open ports, passwords, running processes, SSH and the firewall.` });
  }
  const rank: Record<Severity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
