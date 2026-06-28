'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ModuleShellProps {
  children: React.ReactNode;
  actionsRow?: React.ReactNode;
  searchRow?: React.ReactNode;
  intelligencePanel?: React.ReactNode;
  className?: string;
  showPanel?: boolean;
}

export function ModuleShell({
  children,
  actionsRow,
  searchRow,
  intelligencePanel,
  className,
  showPanel
}: ModuleShellProps) {
  const [panelOpen, setPanelOpen] = useState(true);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (showPanel && mounted.current) setPanelOpen(true);
  }, [showPanel]);

  const handleClose = useCallback(() => {
    if (mounted.current) setPanelOpen(false);
  }, []);

  const panelVisible = panelOpen;

  const panel = intelligencePanel
    ? React.cloneElement(intelligencePanel as React.ReactElement<any>, {
        onClose: handleClose,
        hasSelection: !!showPanel,
      })
    : null;

  return (
    <div className={cn("flex flex-col h-full w-full overflow-hidden", className)} style={{ background: 'var(--shell-bg)' }}>
      {/* Row 1: Action Controls — full width */}
      {actionsRow && (
        <div className="px-4 py-2 flex items-center justify-between shrink-0">
          {actionsRow}
        </div>
      )}

      {/* Row 2: Tactical Filters & Search — full width */}
      {searchRow && (
        <div className="px-4 h-[62px] flex items-center shrink-0">
          {searchRow}
        </div>
      )}

      {/* Table + panel side by side on desktop; panel as bottom sheet on mobile */}
      <div className="flex flex-1 min-h-0 gap-3 px-3 pb-3 lg:pb-3 overflow-hidden relative" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>

        {/* Table card */}
        <main className="flex-1 flex flex-col min-w-0 rounded-xl shadow-sm overflow-hidden" style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}>
          {children}
        </main>

        {/* ── Mobile: bottom sheet backdrop ── */}
        {panelVisible && (
          <div className="lg:hidden fixed inset-0 bg-black/50 z-30" onClick={handleClose} />
        )}

        {/* ── Mobile: bottom sheet / Desktop: side panel ── */}
        {panel && (
          <div
            className={cn(
              "transition-all duration-300 ease-in-out",
              /* Desktop — side panel */
              "lg:flex lg:flex-col lg:rounded-xl lg:shadow-sm lg:relative lg:overflow-hidden",
              panelVisible
                ? "lg:w-[360px] lg:opacity-100"
                : "lg:w-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none",
              /* Mobile — bottom sheet */
              "fixed inset-x-0 bottom-0 z-40 lg:static lg:inset-auto lg:z-auto",
              "rounded-t-2xl lg:rounded-xl",
              panelVisible
                ? "translate-y-0 max-h-[80dvh]"
                : "translate-y-full max-h-[80dvh]",
              "flex flex-col overflow-hidden shadow-2xl lg:shadow-sm",
            )}
            style={{ background: 'var(--shell-surface)', border: '1px solid var(--shell-border)' }}
          >
            {/* Mobile drag handle */}
            <div className="lg:hidden flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--shell-border)' }} />
            </div>
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              {panel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
