import React from 'react';
import { cn } from '@/lib/utils';

// Responsive form layout: one column on phones, two (or three) from the `sm` breakpoint up.
// Replaces the bare `grid grid-cols-2` that squeezed fields on a 375px screen.
export function FormGrid({ cols = 2, className, children }: { cols?: 2 | 3; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('grid grid-cols-1 gap-x-6 gap-y-4', cols === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2', className)}>
      {children}
    </div>
  );
}
