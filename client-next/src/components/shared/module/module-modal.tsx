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

interface ModuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  footerLeft?: React.ReactNode;
  maxWidth?: string;
  icon?: React.ReactNode;
  headerBg?: string;
  onSave?: () => void;
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
  maxWidth = "sm:max-w-[660px]",
  icon,
  headerBg,
  onSave,
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
          "p-0 gap-0 overflow-hidden border shadow-2xl rounded-xl flex flex-col modal-glow mx-4 sm:mx-0",
          maxWidth
        )}
        style={{
          background: 'var(--shell-surface)',
          borderColor: 'var(--shell-border)',
          backdropFilter: 'blur(2px)',
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
            height: '44px',
            background: isDestructive ? 'var(--destructive)' : 'var(--shell-surface)',
            borderBottom: '1px solid var(--shell-border)',
            cursor: 'grab',
            userSelect: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="flex items-center gap-2.5">
            {icon && <div style={{ color: isDestructive ? 'var(--destructive-foreground)' : 'var(--shell-text-muted)' }}>{icon}</div>}
            <DialogTitle
              className="text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: isDestructive ? 'var(--destructive-foreground)' : 'var(--shell-text-muted)' }}
            >
              {title}
            </DialogTitle>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors"
            style={{ color: isDestructive ? 'var(--destructive-foreground)' : 'var(--shell-text-muted)', opacity: 0.8, cursor: 'pointer' }}
            aria-label="Close Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </DialogHeader>

        {/* Content Body */}
        <div ref={scrollRef} className="py-4 px-6 overflow-y-auto custom-scrollbar flex-1 min-h-0" style={{ color: 'var(--shell-text)', background: 'var(--shell-bg)', maxHeight: 'calc(90dvh - 44px - 60px - env(safe-area-inset-bottom, 0px))' }}>
          {children}
        </div>

        {/* Footer */}
        <DialogFooter className="px-5 py-3 flex flex-row items-center justify-between shrink-0"
          style={{ borderTop: '1px solid var(--shell-border)', background: 'var(--shell-surface)' }}>
          <div className="flex-1">
            {footerLeft}
          </div>
          <div className="flex items-center gap-2.5">
            {footer || (
              <>
                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="h-8 px-4 text-[11.5px] font-medium"
                  style={{ color: 'var(--shell-text-muted)' }}
                >
                  Cancel
                </Button>
                <Button
                  variant={isDestructive ? "destructive" : "default"}
                  className="font-semibold text-[11.5px] h-8 px-5 rounded-lg transition-all active:scale-95"
                  style={!isDestructive ? { background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' } : {}}
                  onClick={onSave}
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
