#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

const appRoot = path.resolve(__dirname, '..');
const targetFolder = path.resolve(process.argv[2] || process.cwd());

let electronBinary;
try {
  electronBinary = require('electron');
} catch (e) {
  console.error('Electron is not available. Install project dependencies first.');
  process.exit(1);
}

const child = spawn(electronBinary, [appRoot, targetFolder, '--no-sandbox'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_DEV: process.env.ELECTRON_DEV || '1',
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error(err.message || String(err));
  process.exit(1);
});
