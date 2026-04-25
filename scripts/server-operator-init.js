#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_DEPLOY_SEROP = `[Deploy app]
git pull
docker compose up -d --build

[Restart api]
docker compose restart api

Quick logs = docker compose logs --tail=100 api
`;

const DEFAULT_OPS_SEROP = `[Health check]
docker compose ps
docker compose logs --tail=80

[Restart all]
docker compose restart
`;

function buildFolderReadme() {
  return `# .server-operator

This folder stores project-level shortcuts for the Server Operator desktop app.

## How it works

- Put one or more \`.serop\` files in this folder.
- Open Server Operator -> Deploy tab.
- Select your project and \`.serop\` file.
- Click **Run** on a shortcut.

## \`.serop\` syntax

- \`[Name]\` starts a section.
- Following lines are command steps.
- Steps in one section are joined with \`&&\`.
- \`Name = command\` or \`Name: command\` creates a one-line shortcut.
`;
}

function buildAiContext(profile) {
  const lines = [
    '# Server Operator AI Context',
    '',
    'This project uses Server Operator shortcuts in:',
    '',
    '`.server-operator/*.serop`',
    '',
    '## Project profile',
    '',
    `- Project name: ${profile.projectName || 'Unknown project'}`,
    `- Runtime stack: ${profile.runtime || 'Not specified'}`,
    `- Deployment style: ${profile.deploymentStyle || 'Not specified'}`,
    `- Uses Docker: ${profile.usesDocker ? 'yes' : 'no'}`,
    `- Uses Nginx: ${profile.usesNginx ? 'yes' : 'no'}`,
    `- Uses database: ${profile.usesDatabase ? 'yes' : 'no'}`,
    `- Services: ${profile.services || 'Not specified'}`,
    '',
    '## What agents should do',
    '',
    '1. Keep reusable deploy and operations commands in `.serop` files.',
    '2. Use section format:',
    '',
    '```txt',
    '[Name]',
    'command step 1',
    'command step 2',
    '```',
    '',
    '3. Commands inside one section run together with `&&` in Server Operator.',
    '4. One-line shortcuts are allowed:',
    '',
    '```txt',
    'Quick logs = docker compose logs --tail=100 api',
    '```',
    '',
    '## Install and setup requirements',
    '',
    profile.installRequirements || 'No custom install requirements provided yet.',
    '',
    '## Agent notes',
    '',
    profile.agentNotes || 'No additional notes.',
    '',
    '## Recommended files',
    '',
    '- `deploy.serop` for deploy/rebuild commands',
    '- `ops.serop` for diagnostics/restart/log commands',
    '- `custom.serop` for environment-specific app commands',
  ];
  return lines.join('\n') + '\n';
}

function buildInstallationContext(profile) {
  return `# Installation Context

This file is intended for AI agents generating setup docs, onboarding steps, and deployment instructions.

## Answers from initializer

- Project name: ${profile.projectName || 'Unknown project'}
- Runtime stack: ${profile.runtime || 'Not specified'}
- Deployment style: ${profile.deploymentStyle || 'Not specified'}
- Uses Docker: ${profile.usesDocker ? 'yes' : 'no'}
- Uses Nginx: ${profile.usesNginx ? 'yes' : 'no'}
- Uses database: ${profile.usesDatabase ? 'yes' : 'no'}
- Services: ${profile.services || 'Not specified'}

## Requirements and install commands

${profile.installRequirements || 'No custom requirements provided yet.'}

## Preferred shortcuts

- Deploy command: ${profile.deployCommand || 'git pull && docker compose up -d --build'}
- Restart command: ${profile.restartCommand || 'docker compose restart'}
- Logs command: ${profile.logsCommand || 'docker compose logs --tail=100'}
- Health check command: ${profile.healthCommand || 'docker compose ps'}

## Notes for generated docs

${profile.agentNotes || 'No additional notes.'}
`;
}

function buildCustomSerop(profile) {
  const deploy = profile.deployCommand || 'git pull && docker compose up -d --build';
  const restart = profile.restartCommand || 'docker compose restart';
  const logs = profile.logsCommand || 'docker compose logs --tail=100';
  const health = profile.healthCommand || 'docker compose ps';
  return `[Deploy]
${deploy}

[Restart]
${restart}

[Health check]
${health}

Quick logs = ${logs}
`;
}

function parseYesNo(value, defaultYes) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return defaultYes;
  return normalized === 'y' || normalized === 'yes' || normalized === 'true' || normalized === '1';
}

function printHelp() {
  console.log(`server-operator-init

Create .server-operator with starter .serop files and AI context.

Usage:
  server-operator-init [--path <project-dir>] [--force] [--dry-run] [--interactive]

Options:
  --path <dir>      Target project directory (default: current directory)
  --force           Overwrite existing files
  --dry-run         Print planned actions without writing files
  --interactive     Ask setup questions and generate context from answers
  --help            Show this help
`);
}

function parseArgs(argv) {
  let targetPath = process.cwd();
  let force = false;
  let dryRun = false;
  let interactive = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--interactive') {
      interactive = true;
      continue;
    }
    if (arg === '--path') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --path');
      }
      targetPath = next;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false, force, dryRun, interactive, targetPath };
}

function ensureDir(folderPath, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] mkdir -p ${folderPath}`);
    return;
  }
  fs.mkdirSync(folderPath, { recursive: true });
}

function writeFile(filePath, content, force, dryRun) {
  if (fs.existsSync(filePath) && !force) {
    console.log(`skip  ${filePath} (exists, use --force to overwrite)`);
    return 'skipped';
  }
  if (dryRun) {
    console.log(`[dry-run] write ${filePath}`);
    return 'written';
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`write ${filePath}`);
  return 'written';
}

async function collectInteractiveProfile() {
  if (!process.stdin.isTTY) {
    throw new Error('Interactive mode needs a TTY terminal.');
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const ask = (label) => new Promise((resolve) => rl.question(label, resolve));
  try {
    const projectName = String(await ask('Project name: ')).trim();
    const runtime = String(await ask('Runtime stack (node/python/php/go/etc): ')).trim();
    const deploymentStyle = String(await ask('Deployment style (docker/systemd/nginx/k8s/other): ')).trim();
    const usesDocker = parseYesNo(await ask('Uses Docker? (Y/n): '), true);
    const usesNginx = parseYesNo(await ask('Uses Nginx? (y/N): '), false);
    const usesDatabase = parseYesNo(await ask('Uses database? (y/N): '), false);
    const services = String(await ask('Main services (comma separated): ')).trim();
    const deployCommand = String(await ask('Deploy command (blank for default): ')).trim();
    const restartCommand = String(await ask('Restart command (blank for default): ')).trim();
    const logsCommand = String(await ask('Logs command (blank for default): ')).trim();
    const healthCommand = String(await ask('Health check command (blank for default): ')).trim();
    const installRequirements = String(
      await ask('Install requirements/steps for AI docs (short paragraph, optional): ')
    ).trim();
    const agentNotes = String(await ask('Any additional AI notes? (optional): ')).trim();
    return {
      projectName,
      runtime,
      deploymentStyle,
      usesDocker,
      usesNginx,
      usesDatabase,
      services,
      deployCommand,
      restartCommand,
      logsCommand,
      healthCommand,
      installRequirements,
      agentNotes,
    };
  } finally {
    rl.close();
  }
}

function buildFiles(profile) {
  return [
    { name: 'deploy.serop', content: DEFAULT_DEPLOY_SEROP },
    { name: 'ops.serop', content: DEFAULT_OPS_SEROP },
    { name: 'custom.serop', content: buildCustomSerop(profile) },
    { name: 'AI_CONTEXT.md', content: buildAiContext(profile) },
    { name: 'INSTALLATION_CONTEXT.md', content: buildInstallationContext(profile) },
    { name: 'README.md', content: buildFolderReadme() },
  ];
}

async function run() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }
  const projectRoot = path.resolve(parsed.targetPath);
  const folderPath = path.join(projectRoot, '.server-operator');
  const profile = parsed.interactive ? await collectInteractiveProfile() : {
    projectName: '',
    runtime: '',
    deploymentStyle: 'docker',
    usesDocker: true,
    usesNginx: false,
    usesDatabase: false,
    services: '',
    deployCommand: '',
    restartCommand: '',
    logsCommand: '',
    healthCommand: '',
    installRequirements: '',
    agentNotes: '',
  };
  const files = buildFiles(profile);

  ensureDir(folderPath, parsed.dryRun);
  let written = 0;
  let skipped = 0;
  for (const file of files) {
    const status = writeFile(path.join(folderPath, file.name), file.content, parsed.force, parsed.dryRun);
    if (status === 'written') written += 1;
    else skipped += 1;
  }
  console.log('');
  console.log(`Done. Folder: ${folderPath}`);
  console.log(`Files written: ${written}`);
  console.log(`Files skipped: ${skipped}`);
  if (parsed.interactive) {
    console.log('Generated profile-aware AI context and custom shortcuts.');
  }
}

try {
  run().catch((error) => {
    const message = error && error.message ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  });
} catch (error) {
  const message = error && error.message ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}
