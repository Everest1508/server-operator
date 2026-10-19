// Finds web apps running on a server: every listening port is asked "do you speak HTTP?" from inside the server,
// then matched with the process or Docker container that owns it.
export interface FoundApi {
  port: number;
  scheme: 'http' | 'https';
  /** HTTP status the app answered with, e.g. 200 or 404. */
  code: number;
  /** Docker container name, process name, or a generic label. */
  name: string;
  /** False when the app only listens on 127.0.0.1, so it can't be reached from outside the server. */
  exposed: boolean;
}

// POSIX sh, so it runs on any Linux. curl missing just means nothing answers and the list is empty.
export const DISCOVER_COMMAND = [
  `for p in $(ss -tln 2>/dev/null | tail -n +2 | awk '{print $4}' | sed 's/.*://' | sort -un); do`,
  // don't poke databases, mail, SSH and friends: they would just log a "bad request" line
  `case $p in 21|22|25|53|110|143|465|587|993|995|1433|3306|5432|5672|6379|9042|11211|27017) continue;; esac;`,
  `c=$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://127.0.0.1:$p/ 2>/dev/null); s=http;`,
  `if [ "$c" = "000" ] || [ -z "$c" ]; then c=$(curl -sk -o /dev/null -m 2 -w '%{http_code}' https://127.0.0.1:$p/ 2>/dev/null); s=https; fi;`,
  `echo "PORT $p $s $c"; done;`,
  `ss -tlnp 2>/dev/null | tail -n +2 | awk '{print "LISTEN "$4" "$6}';`,
  `docker ps --format 'DOCKER {{.Names}}|{{.Ports}}' 2>/dev/null`,
].join(' ');

const isPrivateBind = (addr: string) => /^(127\.|\[?::1\]?:)/.test(addr);

export function parseDiscovery(raw: string): FoundApi[] {
  const http = new Map<number, { scheme: 'http' | 'https'; code: number }>();
  const bind = new Map<number, { exposed: boolean; proc: string }>();
  const docker = new Map<number, string>();

  for (const line of raw.split('\n')) {
    const [kind, ...rest] = line.trim().split(' ');
    if (kind === 'PORT') {
      const [port, scheme, code] = rest;
      const c = Number(code);
      if (c > 0) http.set(Number(port), { scheme: scheme === 'https' ? 'https' : 'http', code: c });
    } else if (kind === 'LISTEN') {
      const addr = rest[0] || '';
      const port = Number(addr.slice(addr.lastIndexOf(':') + 1));
      const proc = (rest.slice(1).join(' ').match(/"([^"]+)"/) || [])[1] || '';
      const prev = bind.get(port);
      // a port can be bound twice (IPv4 + IPv6): exposed if any bind is public
      bind.set(port, { exposed: (prev?.exposed ?? false) || !isPrivateBind(addr), proc: proc || prev?.proc || '' });
    } else if (kind === 'DOCKER') {
      const [name, ports = ''] = line.trim().slice(7).split('|');
      for (const m of ports.matchAll(/:(\d+)->/g)) docker.set(Number(m[1]), name);
    }
  }

  return [...http.entries()]
    .map(([port, h]) => ({
      port,
      ...h,
      name: docker.get(port) || bind.get(port)?.proc || 'Web app',
      exposed: bind.get(port)?.exposed ?? false,
    }))
    .sort((a, b) => a.port - b.port);
}
