/** Escape for use inside single-quoted POSIX shell segments. */
export function escapeShellSingleQuotes(s: string): string {
  return s.replace(/'/g, "'\\''");
}
