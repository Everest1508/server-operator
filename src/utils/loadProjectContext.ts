import type { ServerConnection, ProxySettings } from '../types';
import { parseLsLine } from './parseLs';

const DEPLOYMENT_FILES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
  '.env',
  'package.json',
  'vercel.json',
  'netlify.toml',
  '.dockerignore',
];
const DEPLOYMENT_PATTERNS = [/^Dockerfile\.?/i, /^docker-compose.*\.ya?ml$/i];

function isDeploymentFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (DEPLOYMENT_FILES.some((f) => lower === f.toLowerCase())) return true;
  return DEPLOYMENT_PATTERNS.some((re) => re.test(name));
}

function parseListing(stdout: string): Array<{ isDir: boolean; name: string }> {
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => parseLsLine(line))
    .filter((e): e is { isDir: boolean; name: string } => e != null);
}

/**
 * Load project context: tree up to 3 levels + full content of deployment-related files.
 * Uses listDir and readFile from window.serverOperator.
 */
export async function loadProjectContext(
  connection: ServerConnection,
  projectPath: string,
  proxy: ProxySettings | undefined,
  api: { listDir: typeof window.serverOperator.listDir; readFile: typeof window.serverOperator.readFile }
): Promise<{ context: string; error?: string }> {
  const listDir = api.listDir;
  const readFile = api.readFile;
  const dirPath = (relative: string) => (relative === '.' ? projectPath : `${projectPath}/${relative}`);

  const lines: string[] = [];
  const deploymentFilePaths: string[] = [];

  async function addToTree(relativePath: string, indent: string, level: number): Promise<void> {
    if (level > 3) return;
    const pathForList = dirPath(relativePath);
    const res = await listDir({ connection, dirPath: pathForList, proxy });
    if (!res.ok || !res.stdout) return;
    const entries = parseListing(res.stdout);
    for (const e of entries) {
      const nextRelative = relativePath === '.' ? e.name : `${relativePath}/${e.name}`;
      lines.push(`${indent}${e.isDir ? '[dir]  ' : '       '}${e.name}`);
      if (e.isDir && level < 3) {
        await addToTree(nextRelative, indent + '  ', level + 1);
      } else if (!e.isDir && isDeploymentFile(e.name)) {
        const relativeFile = relativePath === '.' ? e.name : `${relativePath}/${e.name}`;
        const fullPath = projectPath === '.' || projectPath === '' ? relativeFile : `${projectPath}/${relativeFile}`;
        deploymentFilePaths.push(fullPath);
      }
    }
  }

  try {
    await addToTree('.', '  ', 1);
    const treeSection = `Project: ${projectPath}\n${lines.join('\n')}`;
    const fileParts: string[] = [treeSection];

    for (const filePath of deploymentFilePaths) {
      const res = await readFile({ connection, filePath, proxy });
      if (res.ok && res.content != null) {
        fileParts.push(`\n--- FILE: ${filePath} ---\n${res.content}`);
      }
    }

    return { context: fileParts.join('\n') };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { context: '', error: msg };
  }
}
