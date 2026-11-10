import { cn } from '@/lib/utils';

// A titled block on a dashboard or analysis page: one bordered surface, a 44px header with the title and an optional action, then the content.
export function Panel({ title, action, className, children }: { title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-lg border border-[var(--shell-border)] bg-[var(--shell-surface)]', className)}>
      <header className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[var(--shell-border)] px-4 py-2">
        <h2 className="text-[15px] font-semibold leading-tight text-balance text-[var(--shell-text)]">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function PanelLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md px-1 text-[13px] font-medium text-[var(--shell-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">
      {children}
    </button>
  );
}
