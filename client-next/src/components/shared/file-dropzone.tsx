'use client';

import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
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


// Receipt / document drop zone shared by the expense, income and recurring dialogs: a large drop area with a
// real "Browse files" button (so keyboard and screen-reader users get a proper control). The file is checked
// here and only a valid one reaches `onFile`.
export function FileDropzone({
  label, onFile, busy, busyTitle, busyHint, fill,
}: {
  label: string;
  onFile: (f: File) => void;
  /** Shows a spinner and blocks picking another file while the file is being processed */
  busy?: boolean;
  busyTitle?: React.ReactNode;
  busyHint?: React.ReactNode;
  /** Grow to the bottom of a stretched column (never shorter than two control rows) */
  fill?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const labelId = React.useId();

  const accept = (f?: File) => { if (f && validateReceipt(f)) onFile(f); };
  const browse = () => { if (!busy) inputRef.current?.click(); };

  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-1.5" : "space-y-1.5"}>
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
      <div
        role="group"
        aria-labelledby={labelId}
        aria-busy={busy}
        className={cn(
          // Two control-rows tall (a text box is 40px), one column wide
          'flex w-full items-center gap-3 rounded-lg border-2 border-dashed px-3 transition-colors',
          fill ? 'min-h-20 flex-1' : 'h-20',
          dragging ? 'border-[var(--shell-accent)] bg-[var(--shell-accent)]/10' : 'border-[var(--shell-border)]',
          !busy && 'cursor-pointer',
        )}
        onClick={browse}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) accept(e.dataTransfer.files[0]); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
      >
        {busy ? (
          <>
            <Loader2 aria-hidden className="h-7 w-7 shrink-0 animate-spin text-[var(--shell-accent)]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--shell-accent)]">{busyTitle}</span>
              {busyHint && <span className="block text-[12px] text-[var(--shell-text-muted)]">{busyHint}</span>}
            </span>
          </>
        ) : (
          <>
            <UploadCloud aria-hidden className={cn('h-7 w-7 shrink-0 transition-colors', dragging ? 'text-[var(--shell-accent)]' : 'text-[var(--shell-text-muted)]')} />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-[13px] font-medium text-[var(--shell-text)]">{dragging ? 'Drop the file here' : 'Drag & drop a file'}</span>
              <span className="block text-[12px] text-[var(--shell-text-muted)]">PDF, JPG, PNG, WebP · max {RECEIPT_MAX_MB} MB</span>
            </span>
            <Button
              type="button"
              variant="outline"
              aria-label="Browse files"
              className="h-8 shrink-0 gap-1.5 px-3 text-[12px] font-semibold"
              onClick={(e) => { e.stopPropagation(); browse(); }}
            >
              <FolderOpen aria-hidden className="h-3.5 w-3.5 text-[var(--info)]" /> Browse
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
