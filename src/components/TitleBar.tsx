export function TitleBar() {
  return (
    <div
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="h-10 shrink-0 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center justify-center select-none"
    >
      <img src="/logo.png" alt="Serop Logo" className="h-5 w-auto object-contain" />
    </div>
  );
}
