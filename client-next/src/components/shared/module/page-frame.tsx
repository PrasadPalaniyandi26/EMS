'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { relatedLinks } from '@/lib/related-pages';
import { RelatedLinks } from '@/components/layout/related-links';

// For a page with no tabs of its own: the same tab row as the tabbed pages, with the page name as its one tab
// and the related-page links at the right. Without links the row is left out and the page fills the space.
export function PageFrame({ label, children }: { label: string; children: ReactNode }) {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role_name);
  if (!relatedLinks(pathname, role).length) return <>{children}</>;
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--shell-surface)]">
      <div className="flex shrink-0 flex-wrap gap-x-4 border-b border-[var(--shell-border)] px-4">
        <span className="-mb-px border-b-2 border-[var(--shell-accent)] px-3 py-2.5 text-[13px] font-medium text-[var(--shell-text)]">{label}</span>
        <RelatedLinks />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
