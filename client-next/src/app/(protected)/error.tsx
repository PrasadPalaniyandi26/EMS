'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[EMS Error Boundary]', error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6" style={{ background: 'var(--shell-bg)' }}>
      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-red-400" />
      </div>
      <div className="text-center space-y-1.5 max-w-sm">
        <h2 className="text-[15px] font-bold" style={{ color: 'var(--shell-text)' }}>Something went wrong</h2>
        <p className="text-[12.5px]" style={{ color: 'var(--shell-text-muted)' }}>
          {error?.message || 'An unexpected error occurred. Please try again.'}
        </p>
        {error?.digest && (
          <p className="text-[10px] font-mono" style={{ color: 'var(--shell-text-muted)' }}>Error ID: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 h-9 px-5 rounded-lg text-[12.5px] font-semibold text-white transition-all hover:brightness-110"
        style={{ background: 'var(--shell-accent)' }}
      >
        <RefreshCw className="w-4 h-4" /> Try again
      </button>
    </div>
  );
}
