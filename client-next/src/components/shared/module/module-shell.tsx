import React from 'react';
import { cn } from '@/lib/utils';

interface ModuleShellProps {
  children: React.ReactNode;
  actionsRow?: React.ReactNode;
  searchRow?: React.ReactNode;
  intelligencePanel?: React.ReactNode;
  className?: string;
  showPanel?: boolean;
}

/**
 * ModuleShell
 * Global standard for all management hub landing pages.
 * Enforces:
 * 1. Fixed height viewport with theme-bg
 * 2. Standard action & search toolbar heights and spacing
 * 3. Consistent split-view for Intelligence Side Panels
 */
export function ModuleShell({
  children,
  actionsRow,
  searchRow,
  intelligencePanel,
  className,
  showPanel
}: ModuleShellProps) {
  return (
    <div className={cn("flex h-full w-full overflow-hidden bg-theme-bg", className)}>
      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Row 1: Action Controls */}
        {actionsRow && (
          <div className="px-4 py-2 flex items-center justify-between border-b border-casper/20 bg-white/40">
            {actionsRow}
          </div>
        )}

        {/* Row 2: Tactical Filters & Search */}
        {searchRow && (
          <div className="px-4 py-0">
            {searchRow}
          </div>
        )}

        {/* Dynamic content area (Table) */}
        <div className="flex-1 flex flex-col min-h-0 bg-white px-4 pb-0">
          {children}
        </div>
      </main>

      {/* Intelligence Side Panel */}
      {showPanel && intelligencePanel}
    </div>
  );
}
