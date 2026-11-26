'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { relatedLinks } from '@/lib/related-pages';

// Shortcuts to the pages that belong with this one, at the right end of the tab row. The list lives in lib/related-pages.ts.
export function RelatedLinks() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role_name);
  const links = relatedLinks(pathname, role);
  if (!links.length) return null;
  return (
    <nav aria-label="Related pages" className="ml-auto flex items-center gap-4 self-center overflow-x-auto max-sm:w-full max-sm:border-t max-sm:border-[var(--shell-border)] max-sm:px-3">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="whitespace-nowrap py-1 text-[13px] font-medium text-[var(--shell-accent)] hover:underline max-lg:py-2.5 focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]">{l.label}</Link>
      ))}
    </nav>
  );
}
