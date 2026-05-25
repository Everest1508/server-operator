export function TitleBar() {
  return (
    <div
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="h-10 shrink-0 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center justify-center text-xs font-semibold text-[var(--text-secondary)] select-none"
    >
      Server Operator
    </div>
  );
}
