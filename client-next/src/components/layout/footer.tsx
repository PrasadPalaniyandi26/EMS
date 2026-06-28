'use client';

import { useAuthStore } from '@/stores/auth-store';

export function Footer() {
  const year = new Date().getFullYear();
  const user = useAuthStore((s) => s.user);

  const status = ((user as any)?.user_status || 'ACTIVE').toUpperCase();
  const isActive = status === 'ACTIVE';
  const statusLabel = isActive ? 'Active' : status === 'ON_HOLD' ? 'On Hold' : 'Inactive';
  const dotColor = isActive ? '#22c55e' : status === 'ON_HOLD' ? '#f97316' : '#ef4444';

  return (
    <footer className="footer-fixed">
      <div className="w-full flex items-center justify-between">
        <p className="text-[11px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>
          © {year} NTEMS — NilaTech Expense Management System
        </p>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: dotColor }} />
            {statusLabel}
          </span>
          <span style={{ color: 'var(--shell-border)' }}>|</span>
          <span>V1.0</span>
        </div>
      </div>
    </footer>
  );
}
