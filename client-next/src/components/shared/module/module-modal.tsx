'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Standard dialog widths. The app had nine ad-hoc widths (460-1100px); these four cover them.
export const MODAL_SIZES = {
  sm: 'sm:max-w-[500px]',
  md: 'sm:max-w-[680px]',
  lg: 'sm:max-w-[880px]',
  xl: 'sm:max-w-[1100px]',
} as const;

interface ModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  footerLeft?: React.ReactNode;
  size?: keyof typeof MODAL_SIZES;
  /** Escape hatch for a one-off width; prefer `size` */
  maxWidth?: string;
  icon?: React.ReactNode;
  headerBg?: string;
  onSave?: () => void;
  /** False while a required field is empty or invalid: the save button stays disabled. Every form dialog passes it. */
  canSave?: boolean;
  saveLabel?: string;
  isDestructive?: boolean;
}

export function ModuleModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  footerLeft,
  size = 'md',
  maxWidth,
  icon,
  headerBg,
  onSave,
  canSave = true,
  saveLabel = "Save Changes",
  isDestructive = false
}: ModuleModalProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const origin = useRef({ mx: 0, my: 0, ox: 0, oy: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setOffset({ x: 0, y: 0 });
      scrollRef.current?.scrollTo(0, 0);
    }
  }, [isOpen]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragging.current = true;
    origin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [offset]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setOffset({
      x: origin.current.ox + (e.clientX - origin.current.mx),
      y: origin.current.oy + (e.clientY - origin.current.my),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden border rounded-lg flex flex-col modal-glow",
          maxWidth ?? MODAL_SIZES[size]
        )}
        style={{
          background: 'var(--popover)',
          borderColor: 'var(--shell-border)',
          // 50vw/50vh = true viewport center, independent of sidebar or any layout.
          // Inline style wins over .dialog-centered CSS class.
          left: '50vw',
          top: '50vh',
          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
        }}
        showCloseButton={false}
      >
        {/* Header — drag handle */}
        <DialogHeader
          className={cn("px-5 gap-0 flex flex-row items-center justify-between shrink-0 border-none space-y-0", headerBg)}
          style={{
            height: '52px',
            background: 'transparent',
            borderBottom: '1px solid var(--shell-border)',
            cursor: 'grab',
            userSelect: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="flex items-center gap-2.5">
            <DialogTitle
              className="text-[15px] font-semibold"
              style={{ color: isDestructive ? 'var(--danger)' : 'var(--shell-text)' }}
            >
              {title}
            </DialogTitle>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 transition-colors"
            style={{ color: 'var(--shell-text-muted)', cursor: 'pointer' }}
            aria-label="Close Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </DialogHeader>

        {/* Content Body */}
        <div ref={scrollRef} className="py-4 px-6 overflow-y-auto custom-scrollbar flex-1 min-h-0" style={{ color: 'var(--shell-text)', maxHeight: 'calc(90dvh - 52px - 60px - env(safe-area-inset-bottom, 0px))' }}>
          {children}
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3 flex flex-row items-center justify-between shrink-0"
          style={{ borderTop: '1px solid var(--shell-border)' }}>
          <div className="flex-1">
            {footerLeft}
          </div>
          <div className="flex items-center gap-2.5">
            {footer || (
              <>
                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="h-9 px-4 text-[13px] font-medium"
                  style={{ color: 'var(--shell-text-muted)' }}
                >
                  Cancel
                </Button>
                <Button
                  variant={isDestructive ? "destructive" : "default"}
                  className="font-medium text-[13px] h-9 px-5 rounded-md"
                  style={!isDestructive ? { background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' } : {}}
                  onClick={onSave}
                  disabled={!canSave}
                >
                  {saveLabel}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
