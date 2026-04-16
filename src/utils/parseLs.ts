/** Parse one line of ls -la: return { isDir, name } or null (supports 8+ columns for different ls formats) */
export function parseLsLine(line: string): { isDir: boolean; name: string } | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 8) return null;
  const perm = parts[0];
  const name = (parts.length >= 9 ? parts.slice(8) : [parts[7]]).join(' ').trim();
  if (!name || name === '.' || name === '..') return null;
  const isDir = perm.startsWith('d');
  return { isDir, name };
}
