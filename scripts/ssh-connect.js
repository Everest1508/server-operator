#!/usr/bin/env node
/**
 * Standalone Node.js script to connect to a server via SSH.
 * Supports password or private key; optional SOCKS5 proxy (e.g. Tor).
 *
 * Usage:
 *   node scripts/ssh-connect.js
 *
 * Configure via environment variables:
 *   SSH_HOST       - Server host (required)
 *   SSH_USER       - SSH username (required)
 *   SSH_KEY_PATH   - Path to private key (optional; use with key auth)
 *   SSH_PASSWORD   - Password (optional; use if no key)
 *   SSH_PROXY      - SOCKS5 proxy: "host:port" (e.g. 127.0.0.1:9050) or "true" for default Tor (127.0.0.1:9050)
 *
 * Example (direct):
 *   SSH_HOST=my.server.com SSH_USER=ubuntu SSH_KEY_PATH=./creds node scripts/ssh-connect.js
 *
 * Example (via Tor):
 *   SSH_HOST=xxx.onion SSH_USER=me SSH_KEY_PATH=./creds SSH_PROXY=127.0.0.1:9050 node scripts/ssh-connect.js
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const host = process.env.SSH_HOST || '';
const username = process.env.SSH_USER || '';
const keyPath = process.env.SSH_KEY_PATH || '';
const password = process.env.SSH_PASSWORD || '';
// "host:port" or "true" / "1" / "yes" for default Tor (127.0.0.1:9050)
const rawProxy = process.env.SSH_PROXY || '';
const proxyEnv = /^(true|1|yes)$/i.test(rawProxy) ? '127.0.0.1:9050' : rawProxy;

if (!host || !username) {
  console.error('Usage: set SSH_HOST and SSH_USER (and either SSH_KEY_PATH or SSH_PASSWORD).');
  console.error('Optional: SSH_PROXY=127.0.0.1:9050 for SOCKS5 (e.g. Tor).');
  process.exit(1);
}

const usePassword = password.length > 0;
const useKey = !usePassword && keyPath.length > 0;

if (!usePassword && !useKey) {
  console.error('Set either SSH_KEY_PATH or SSH_PASSWORD.');
  process.exit(1);
}

function resolveKeyPath(p) {
  const s = path.resolve(p);
  if (fs.existsSync(s)) return s;
  if (fs.existsSync(path.join(process.cwd(), p))) return path.join(process.cwd(), p);
  return s;
}

function connectSSH() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const config = {
      host,
      port: 22,
      username,
      readyTimeout: 30000,
    };

    if (usePassword) {
      config.password = password;
      config.tryKeyboard = true;
    } else {
      try {
        const resolved = resolveKeyPath(keyPath);
        if (!fs.existsSync(resolved)) {
          reject(new Error(`Key file not found: ${resolved}`));
          return;
        }
        config.privateKey = fs.readFileSync(resolved, 'utf8');
      } catch (e) {
        reject(e);
        return;
      }
    }

    conn.on('ready', () => resolve(conn)).on('error', (e) => reject(e));

    if (usePassword) {
      conn.on('keyboard-interactive', (_name, _inst, _lang, _prompts, finish) => finish([password]));
    }

    if (proxyEnv) {
      const [proxyHost, proxyPortStr] = proxyEnv.split(':');
      const proxyPort = parseInt(proxyPortStr || '9050', 10);
      const { SocksClient } = require('socks');
      console.error('Connecting via SOCKS5 proxy', proxyHost + ':' + proxyPort, '...');
      SocksClient.createConnection({
        proxy: { host: proxyHost || '127.0.0.1', port: proxyPort, type: 5 },
        command: 'connect',
        destination: { host, port: 22 },
        timeout: 60000,
      })
        .then(({ socket }) => {
          conn.connect({ ...config, sock: socket });
        })
        .catch((e) => reject(e));
    } else {
      conn.connect(config);
    }
  });
}

async function main() {
  console.error('Connecting to', username + '@' + host, proxyEnv ? '(via proxy)' : '', '...');
  const conn = await connectSSH();
  console.error('Connected.\n');

  return new Promise((resolve, reject) => {
    conn.shell((err, stream) => {
      if (err) {
        conn.end();
        reject(err);
        return;
      }
      stream.pipe(process.stdout);
      process.stdin.pipe(stream);
      stream.stderr.pipe(process.stderr);

      stream.on('close', (code) => {
        conn.end();
        resolve(code);
      });
    });
  });
}

main().then((code) => process.exit(code ?? 0)).catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
