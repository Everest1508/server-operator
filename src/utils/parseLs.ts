/** Parse one line of ls output or formatted entry string: return { isDir, name } or null */
export function parseLsLine(line: string): { isDir: boolean; name: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);

  // Simple entry format: "d filename" or "- filename"
  if (parts.length >= 2 && (parts[0] === 'd' || parts[0] === '-')) {
    const name = parts.slice(1).join(' ').trim();
    if (!name || name === '.' || name === '..') return null;
    return { isDir: parts[0] === 'd', name };
  }

  // Standard ls -la format (8+ columns)
  if (parts.length >= 8) {
    const perm = parts[0];
    const name = (parts.length >= 9 ? parts.slice(8) : [parts[7]]).join(' ').trim();
    if (!name || name === '.' || name === '..') return null;
    const isDir = perm.startsWith('d');
    return { isDir, name };
  }

  return null;
}
