import { parseLsLine } from './parseLs';

/**
 * Build a text tree from the project(s) added via "Add as project" (right-click on dirs).
 * Uses cached repo tree listings (no server call).
 */
export function buildProjectTreeText(
  repos: string[],
  repoTreeListings: Record<string, string>
): string {
  const lines: string[] = [];
  const listingKey = (repo: string, path: string) => `${repo}:${path}`;

  function formatListing(repo: string, pathKey: string, indent: string): void {
    const key = listingKey(repo, pathKey);
    const raw = repoTreeListings[key];
    if (!raw) return;
    const lsLines = raw.trim().split('\n').filter(Boolean);
    const entries = lsLines
      .map(parseLsLine)
      .filter((e): e is { isDir: boolean; name: string } => e != null);
    for (const e of entries) {
      lines.push(`${indent}${e.isDir ? '[dir]  ' : '       '}${e.name}`);
      if (e.isDir) {
        const nextPath = pathKey === '.' ? e.name : `${pathKey}/${e.name}`;
        formatListing(repo, nextPath, indent + '  ');
      }
    }
  }

  for (const repo of repos) {
    lines.push(`${repo}/`);
    formatListing(repo, '.', '  ');
    lines.push('');
  }
  return lines.join('\n').trim();
}
