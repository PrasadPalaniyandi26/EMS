import React from 'react';
import { X, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleIntelligencePanelProps {
  children: React.ReactNode;
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  width?: string;
  className?: string;
}

/**
 * ModuleIntelligencePanel
 * Standardizes the "Floating Card" detail view used across all modules.
 * Enforces:
 * 1. Slide-in animation & shadow theme
 * 2. Premium header aesthetics (bg-juniper)
 * 3. Global dismissal logic
 */
export function ModuleIntelligencePanel({
  children,
  title,
  icon = <Activity className="h-3 w-3" />,
  onClose,
  width = "w-[400px]",
  className
}: ModuleIntelligencePanelProps) {
  return (
    <aside className={cn(
      width,
      "bg-white border-l border-casper flex flex-col overflow-hidden animate-in slide-in-from-right duration-300",
      className
    )}>
      {/* Header Area */}
      <div className="h-[52px] px-5 bg-juniper text-white flex justify-between items-center shrink-0">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] mt-0.5 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <button 
          onClick={onClose} 
          className="text-white hover:bg-white/10 rounded p-1 transition-colors"
          aria-label="Close Intelligence Panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-[#FAF9F6]">
        {children}
      </div>
    </aside>
  );
}
