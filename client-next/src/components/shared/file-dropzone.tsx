'use client';

import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const RECEIPT_MAX_MB = 10;

export function validateReceipt(f: File): boolean {
  if (!RECEIPT_TYPES.includes(f.type)) {
    toast.error('Invalid file type. Only PDF, JPG, PNG, and WEBP are allowed.');
    return false;
  }
  if (f.size > RECEIPT_MAX_MB * 1024 * 1024) {
    toast.error(`File too large. Maximum size is ${RECEIPT_MAX_MB}MB.`);
    return false;
  }
  return true;
}

// Receipt / document drop zone shared by the expense, income and recurring dialogs. A real button, so Enter and
// Space open the file picker; the file is checked here and only a valid one reaches `onFile`.
export function FileDropzone({
  label, onFile, busy, busyTitle, busyHint,
}: {
  label: string;
  onFile: (f: File) => void;
  /** Shows a spinner and blocks picking another file while the file is being processed */
  busy?: boolean;
  busyTitle?: React.ReactNode;
  busyHint?: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const labelId = React.useId();

  const accept = (f?: File) => { if (f && validateReceipt(f)) onFile(f); };

  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-[13px] font-medium" style={{ color: 'var(--shell-text)' }}>{label}</p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }}
      />
      <button
        type="button"
        aria-labelledby={labelId}
        aria-busy={busy}
        className={cn(
          'group flex w-full cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-accent)]',
          dragging ? 'border-[var(--shell-accent)]' : 'border-[var(--shell-border)] hover:border-[var(--shell-accent)]',
        )}
        onClick={() => !busy && inputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files[0]); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
      >
        {busy
          ? <Loader2 aria-hidden className="h-7 w-7 shrink-0 animate-spin text-[var(--shell-accent)]" />
          : <UploadCloud aria-hidden className={cn('h-7 w-7 shrink-0 transition-colors', dragging ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-muted)] group-hover:text-[var(--shell-accent)]')} />}
        <span>
          {busy ? (
            <>
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--shell-accent)]">{busyTitle}</span>
              {busyHint && <span className="block text-[12px] text-[var(--shell-text-muted)]">{busyHint}</span>}
            </>
          ) : (
            <>
              <span className="block text-[12px] font-medium text-[var(--shell-text-muted)]">
                Drag &amp; drop or <span className="font-semibold text-[var(--shell-accent)]">browse files</span>
              </span>
              <span className="block text-[12px] text-[var(--shell-text-muted)]">PDF, JPG, PNG, WebP · max {RECEIPT_MAX_MB} MB</span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}
