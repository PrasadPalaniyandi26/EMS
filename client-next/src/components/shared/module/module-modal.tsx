'use client';

import React from 'react';
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

/**
 * ModuleModal
 * Global standard for all management hub modals (Add/Edit/Action).
 * Enforces:
 * 1. Wide layout (default 700px)
 * 2. Standardized header (bg-juniper or bg-rose for destructive)
 * 3. Consistent internal padding and background
 */
export function ModuleModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  footerLeft,
  maxWidth = "sm:max-w-[700px]",
  icon,
  headerBg,
  onSave,
  saveLabel = "Save Changes",
  isDestructive = false
}: ModuleModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className={cn(
          "p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col",
          maxWidth
        )}
        showCloseButton={false}
      >
        {/* Standardized Header */}
        <DialogHeader className={cn(
          "h-[52px] px-5 text-white flex flex-row items-center justify-between shrink-0 border-none space-y-0",
          headerBg || (isDestructive ? "bg-rose-600" : "bg-juniper")
        )}>
          <div className="flex items-center gap-3">
            {icon && <div className="text-white/80">{icon}</div>}
            <DialogTitle className="text-[12px] font-bold uppercase tracking-[0.2em] mt-0.5">
              {title}
            </DialogTitle>
          </div>
          <button 
            onClick={onClose} 
            className="text-white hover:bg-white/10 rounded p-1 transition-colors"
            aria-label="Close Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        {/* Content Body */}
        <div className="p-8 max-h-[85vh] overflow-y-auto custom-scrollbar flex-1">
          {children}
        </div>

        {/* Standardized Footer */}
        <DialogFooter className="bg-mystic/20 border-t border-casper/30 p-8 pt-4 flex flex-row items-center justify-between shrink-0">
          <div className="flex-1">
            {footerLeft}
          </div>
          <div className="flex items-center gap-3">
            {footer || (
              <>
                <Button 
                  variant="outline" 
                  onClick={onClose} 
                  className="bg-white border-casper text-juniper font-bold text-xs uppercase tracking-widest hover:bg-casper/10 h-11 px-6 shadow-sm"
                >
                  Cancel
                </Button>
                <Button 
                  className={cn(
                    "font-bold text-xs uppercase tracking-widest h-11 px-8 rounded-lg shadow-lg transition-all active:scale-95",
                    isDestructive 
                      ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20" 
                      : "bg-juniper hover:brightness-110 shadow-juniper/20"
                  )} 
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
