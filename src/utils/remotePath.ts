export function normalizeRemotePath(path: string): string {
  const trimmed = (path || '').trim();
  if (!trimmed) return '.';
  if (trimmed === '~' || trimmed.startsWith('~/')) {
    return trimmed.replace(/\/+$/, '') || '~';
  }

  const isAbsolute = trimmed.startsWith('/');
  const segments = trimmed.split('/');
  const stack: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else if (!isAbsolute) {
        stack.push('..');
      }
      continue;
    }
    stack.push(segment);
  }

  if (isAbsolute) return stack.length ? `/${stack.join('/')}` : '/';
  return stack.join('/') || '.';
}

export function resolveRemotePath(basePath: string | undefined, nextPath: string): string {
  const trimmedNext = (nextPath || '').trim();
  if (!trimmedNext) return normalizeRemotePath(basePath || '.');
  if (trimmedNext.startsWith('/') || trimmedNext === '~' || trimmedNext.startsWith('~/')) {
    return normalizeRemotePath(trimmedNext);
  }

  const normalizedBase = normalizeRemotePath(basePath || '.');
  if (trimmedNext === '.') return normalizedBase;
  if (normalizedBase === '/') return normalizeRemotePath(`/${trimmedNext}`);
  if (normalizedBase === '.') return normalizeRemotePath(trimmedNext);
  return normalizeRemotePath(`${normalizedBase}/${trimmedNext}`);
}

export function joinRemotePath(basePath: string, nextPath: string): string {
  return resolveRemotePath(basePath, nextPath);
}
