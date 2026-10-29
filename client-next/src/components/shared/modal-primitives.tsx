'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shared themed class strings for form inputs and selects.
// Keyboard focus shows a 2px accent ring (focus-visible), so mouse clicks stay quiet and tabbing is obvious.
// 40px high: the one control height for forms (the app mixed 32, 36 and 40px), and a comfortable touch target.
export const inp = [
  'w-full h-10 text-sm rounded-lg px-3',
  'border outline-none transition-colors',
  'focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)] focus-visible:border-[var(--shell-accent)]',
].join(' ');

export const sel = [
  'w-full h-10 text-sm rounded-lg',
  'border outline-none transition-colors',
  'focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)] focus-visible:border-[var(--shell-accent)]',
].join(' ');

// Styled native <select> with the dropdown arrow. Six files each pasted their own copy of the arrow SVG.
// Native on purpose: the OS picker is the best experience on phones, and it is fully keyboard accessible.
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(sel, 'modal-input appearance-none pr-8 pl-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50', className)}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--shell-text-muted)]" />
    </div>
  );
}

export const inputStyle = {
  background: 'var(--shell-bg)',
  borderColor: 'var(--shell-border)',
  color: 'var(--shell-text)',
};

export const focusStyle = {
  '--tw-ring-color': 'var(--shell-accent)',
  borderColor: 'var(--shell-accent)',
} as React.CSSProperties;

// Field wrapper: label + control + optional hint and error.
// The label is linked to the control (so clicking it focuses the field and screen readers announce it),
// and an error is announced and tied to the control through aria-invalid / aria-describedby.
// It finds the control inside `children` itself, so existing callers need no change; pass `htmlFor`
// only if the control already has its own id.
interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}

const CONTROL_SELECTOR = 'input:not([type="hidden"]):not([type="file"]), select, textarea, [role="combobox"], [role="switch"], [role="checkbox"]';

export function Field({ label, required, hint, error, htmlFor, children }: FieldProps) {
  const autoId = useId();
  const baseId = htmlFor ?? `field-${autoId.replace(/:/g, '')}`;
  const errorId = `${baseId}-error`;
  const hintId = `${baseId}-hint`;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [controlId, setControlId] = useState(baseId);

  // Runs after every render because the control can mount later (conditional children)
  useEffect(() => {
    const control = bodyRef.current?.querySelector<HTMLElement>(CONTROL_SELECTOR);
    if (!control) return;
    if (!control.id) control.id = baseId;
    if (control.id !== controlId) setControlId(control.id);

    const describedBy = error ? errorId : hint ? hintId : '';
    if (describedBy) control.setAttribute('aria-describedby', describedBy);
    else control.removeAttribute('aria-describedby');
    if (error) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
    if (required) control.setAttribute('aria-required', 'true');
  });

  return (
    <div className="space-y-1.5">
      <Label htmlFor={controlId} className="text-xs font-semibold" style={{ color: 'var(--shell-text-muted)' }}>
        {label}
        {required && <span aria-hidden className="ml-0.5 text-[var(--danger)]">*</span>}
      </Label>
      <div ref={bodyRef}>{children}</div>
      {hint && !error && <p id={hintId} className="text-[11px]" style={{ color: 'var(--shell-text-muted)' }}>{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-[11px] font-medium text-[var(--danger)]">{error}</p>}
    </div>
  );
}

// Drop-in for a bare <Label> that sits directly above one control in the same container: it links itself to
// that control (so clicking it focuses the field and the control is announced by name). Use `Field` for new
// code; this exists so older dialogs can be fixed by swapping the tag.
export function AutoLabel({ className, children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLLabelElement>(null);
  const autoId = useId();
  useEffect(() => {
    const label = ref.current;
    const control = label?.parentElement?.querySelector<HTMLElement>(CONTROL_SELECTOR);
    if (!label || !control) return;
    if (!control.id) control.id = `field-${autoId.replace(/:/g, '')}`;
    if (label.htmlFor !== control.id) label.htmlFor = control.id;
  });
  return <Label ref={ref} className={className} style={style}>{children}</Label>;
}

// Section divider with label
export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--shell-text-muted)' }}>{label}</span>
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
        aria-invalid={error ? true : undefined}
      />
      {error && <p role="alert" className="text-[11px] text-[var(--danger)] font-medium mt-0.5">{error}</p>}
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
        aria-invalid={error ? true : undefined}
      />
      {error && <p role="alert" className="text-[11px] text-[var(--danger)] font-medium mt-0.5">{error}</p>}
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

// Built on ModuleModal (the shadcn/Radix dialog), so it has a real dialog role, traps focus, closes on
// Escape and returns focus to what opened it. The old version was a hand-rolled overlay with none of that.
// Focus starts on Cancel so a stray Enter never confirms a destructive action.
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel, destructive = false }: ConfirmDialogProps) {
  return (
    <ModuleModal
      isOpen={open}
      onClose={onCancel}
      title={title}
      maxWidth="sm:max-w-[420px]"
      isDestructive={destructive}
      icon={<AlertTriangle className="w-4 h-4" />}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} autoFocus className="h-8 px-4 text-[11.5px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            className="h-8 px-5 text-[11.5px] font-semibold"
            style={!destructive ? { background: 'var(--shell-accent)', color: 'var(--shell-accent-fg)' } : undefined}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--shell-text)' }}>{message}</p>
    </ModuleModal>
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
