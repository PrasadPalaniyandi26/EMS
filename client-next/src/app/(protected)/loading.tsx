// Shown while a page's code loads on navigation, so the workspace never flashes blank.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex h-full flex-col" style={{ background: 'var(--shell-surface)' }}>
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4" style={{ borderColor: 'var(--shell-border)' }}>
        <div className="h-8 w-20 rounded-md bg-[var(--shell-hover)] motion-safe:animate-pulse" />
        <div className="ml-auto h-8 w-52 rounded-md bg-[var(--shell-hover)] motion-safe:animate-pulse" />
      </div>
      <div className="flex-1 overflow-hidden">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b px-4 py-3.5" style={{ borderColor: 'var(--shell-border)' }}>
            {[18, 30, 16, 14, 12].map((w, j) => (
              <div key={j} className="h-3.5 rounded-sm bg-[var(--shell-hover)] motion-safe:animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
