'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

// Shared themed class strings for form inputs and selects
export const inp = [
  'w-full h-9 text-[13px] rounded-lg px-3',
  'border focus:outline-none focus:ring-1 transition-colors',
].join(' ');

export const sel = [
  'w-full h-9 text-[13px] rounded-lg',
  'border focus:outline-none focus:ring-1 transition-colors',
].join(' ');

export const inputStyle = {
  background: 'var(--shell-bg)',
  borderColor: 'var(--shell-border)',
  color: 'var(--shell-text)',
};

export const focusStyle = {
  '--tw-ring-color': 'var(--shell-accent)',
  borderColor: 'var(--shell-accent)',
} as React.CSSProperties;

// Field wrapper with label
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--shell-text-muted)' }}>
        {label}
      </Label>
      {children}
    </div>
  );
}

// Section divider with label
export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--shell-text-muted)' }}>{label}</span>
      <div className="h-px flex-1" style={{ background: 'var(--shell-border)' }} />
    </div>
  );
}

// Themed section card (replaces bg-white/8)
export function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg p-4 ${className || ''}`} style={{ background: 'var(--shell-bg)', border: '1px solid var(--shell-border)' }}>
      {children}
    </div>
  );
}

// Toggle pill group (replaces bg-black/20 pill)
export function ToggleGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex p-1 gap-1 rounded-lg" style={{ background: 'var(--shell-bg)', border: '1px solid var(--shell-border)' }}>
      {children}
    </div>
  );
}

export function ToggleOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 px-3 py-1 text-[12px] font-medium rounded-md transition-all"
      style={active
        ? { background: 'var(--shell-surface)', color: 'var(--shell-text)', border: '1px solid var(--shell-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
        : { color: 'var(--shell-text-muted)', border: '1px solid transparent' }
      }
    >
      {children}
    </button>
  );
}

// ─── PhoneInput ───────────────────────────────────────────────────────────────
// Blocks alphabet keys; validates E.164-style format on blur.
// Accepts optional, validates only when a value is present.

const PHONE_REGEX = /^\+?[0-9\s\-().]{7,20}$/;

interface PhoneInputProps {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  className = '',
  placeholder = '+91 98765 43210',
  disabled,
}: PhoneInputProps) {
  const [error, setError] = useState('');

  const validate = (v: string) => {
    if (!v) { setError(''); return; }
    setError(PHONE_REGEX.test(v) ? '' : 'Include country code e.g. +1 555 0123');
  };

  return (
    <div>
      <Input
        type="tel"
        className={`${inp} modal-input ${className}`}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => { onChange(e.target.value); if (error) validate(e.target.value); }}
        onBlur={(e) => validate(e.target.value)}
        onKeyDown={(e) => { if (/^[a-zA-Z]$/.test(e.key)) e.preventDefault(); }}
      />
      {error && <p className="text-[10px] text-red-500 font-medium mt-0.5">{error}</p>}
    </div>
  );
}

// Returns true when value is empty or passes regex — use in submit handlers.
export function isValidPhone(v: string): boolean {
  return !v || PHONE_REGEX.test(v);
}

// ─── EmailInput ───────────────────────────────────────────────────────────────
// Validates on blur; clears error on change. readOnly prop locks the field.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailInputProps {
  value: string;
  onChange?: (v: string) => void;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  required?: boolean;
}

export function EmailInput({
  value,
  onChange,
  className = '',
  placeholder = 'user@company.com',
  readOnly,
  disabled,
  required,
}: EmailInputProps) {
  const [error, setError] = useState('');

  const validate = (v: string) => {
    if (!v && !required) { setError(''); return; }
    setError(EMAIL_REGEX.test(v) ? '' : 'Enter a valid email address');
  };

  return (
    <div>
      <Input
        type="email"
        className={`${inp} modal-input ${className}`}
        placeholder={placeholder}
        value={value}
        readOnly={readOnly}
        disabled={disabled}
        onChange={(e) => { onChange?.(e.target.value); if (error) validate(e.target.value); }}
        onBlur={(e) => { if (!readOnly) validate(e.target.value); }}
        style={readOnly ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
      />
      {error && <p className="text-[10px] text-red-500 font-medium mt-0.5">{error}</p>}
    </div>
  );
}

// Returns true when value passes email regex — use in submit handlers.
export function isValidEmail(v: string): boolean {
  return EMAIL_REGEX.test(v);
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
// Replaces native browser confirm() with a themed modal. Use the hook to
// trigger it imperatively: const { confirmDialog, ConfirmDialog } = useConfirm()

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel, destructive = false }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm mx-4 rounded-2xl shadow-2xl border overflow-hidden"
        style={{ background: 'var(--shell-surface)', borderColor: 'var(--shell-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center gap-3 px-5 py-4 border-b ${destructive ? 'bg-red-500/10 border-red-500/20' : 'border-[var(--shell-border)]'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${destructive ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
            <AlertTriangle className={`w-4 h-4 ${destructive ? 'text-red-400' : 'text-amber-400'}`} />
          </div>
          <h3 className="text-[13px] font-bold" style={{ color: 'var(--shell-text)' }}>{title}</h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-[12.5px]" style={{ color: 'var(--shell-text-muted)' }}>{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-4">
          <button
            onClick={onCancel}
            className="h-8 px-4 rounded-lg text-[12px] font-semibold border transition-all hover:bg-[var(--shell-hover)]"
            style={{ borderColor: 'var(--shell-border)', color: 'var(--shell-text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`h-8 px-4 rounded-lg text-[12px] font-bold text-white transition-all ${destructive ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; title: string; message: string; confirmLabel: string; destructive: boolean; resolve: ((v: boolean) => void) | null }>({
    open: false, title: '', message: '', confirmLabel: 'Confirm', destructive: false, resolve: null,
  });

  const confirm = (title: string, message: string, opts?: { confirmLabel?: string; destructive?: boolean }): Promise<boolean> =>
    new Promise((resolve) => {
      setState({ open: true, title, message, confirmLabel: opts?.confirmLabel || 'Confirm', destructive: opts?.destructive ?? false, resolve });
    });

  const handleConfirm = () => { state.resolve?.(true); setState((s) => ({ ...s, open: false, resolve: null })); };
  const handleCancel = () => { state.resolve?.(false); setState((s) => ({ ...s, open: false, resolve: null })); };

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      destructive={state.destructive}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, dialog };
}

// ─── CurrencyInput ────────────────────────────────────────────────────────────
// Number input with currency symbol prefix; blocks e/E/+/- keys.
// symbol prop defaults to ₹. className is applied to the <input> element.

interface CurrencyInputProps {
  value: string;
  onChange: (v: string) => void;
  symbol?: string;
  className?: string;
  placeholder?: string;
  min?: string;
  disabled?: boolean;
}

export function CurrencyInput({
  value,
  onChange,
  symbol = '₹',
  className = '',
  placeholder = '0.00',
  min = '0',
  disabled,
}: CurrencyInputProps) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--shell-text-muted)] font-bold text-sm select-none pointer-events-none">
        {symbol}
      </span>
      <Input
        type="number"
        className={`${inp} modal-input pl-7 font-bold ${className}`}
        placeholder={placeholder}
        min={min}
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
      />
    </div>
  );
}
