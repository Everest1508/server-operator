/**
 * Fuzzy file-path matching for quick open: the query's characters must appear in order. Matches in the file
 * name beat matches in folders, and consecutive characters and word starts score higher.
 * Returns null when the path does not match, otherwise a score (higher is better) and the matched indexes.
 */
export function fuzzyMatch(query: string, path: string): { score: number; positions: number[] } | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return { score: 0, positions: [] };
  const p = path.toLowerCase();
  const nameStart = path.lastIndexOf('/') + 1;

  // Prefer a match that lies entirely inside the file name.
  const inName = matchFrom(q, p, path, nameStart);
  if (inName) return { score: inName.score + 100, positions: inName.positions };
  return matchFrom(q, p, path, 0);
}

function isWordStart(original: string, i: number): boolean {
  if (i === 0) return true;
  const prev = original[i - 1];
  if (prev === '/' || prev === '.' || prev === '-' || prev === '_' || prev === ' ') return true;
  // camelCase boundary: lower followed by upper
  return prev === prev.toLowerCase() && original[i] !== original[i].toLowerCase();
}

function matchFrom(q: string, p: string, original: string, start: number) {
  const positions: number[] = [];
  let score = 0;
  let qi = 0;
  let last = -1;
  for (let i = start; i < p.length && qi < q.length; i++) {
    if (p[i] !== q[qi]) continue;
    if (last === i - 1) score += 6; // consecutive
    if (isWordStart(original, i)) score += 8;
    if (last >= 0) score -= Math.min(i - last - 1, 10) * 0.5; // gaps cost a little
    positions.push(i);
    last = i;
    qi++;
  }
  if (qi < q.length) return null;
  score -= p.length * 0.05; // shorter paths win ties
  return { score, positions };
}
