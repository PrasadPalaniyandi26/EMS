'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, PlusCircle } from 'lucide-react';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, EmailInput, PhoneInput, isValidEmail, isValidPhone } from '@/components/shared/modal-primitives';

// ─── Country List ─────────────────────────────────────────────────────────────
export const COUNTRY_LIST = [
  'Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria',
  'Bahrain', 'Bangladesh', 'Belgium', 'Brazil', 'Canada', 'Chile', 'China',
  'Colombia', 'Croatia', 'Czech Republic', 'Denmark', 'Egypt', 'Finland',
  'France', 'Germany', 'Ghana', 'Greece', 'Hong Kong', 'Hungary', 'India',
  'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Japan',
  'Jordan', 'Kenya', 'Kuwait', 'Lebanon', 'Malaysia', 'Mexico', 'Morocco',
  'Netherlands', 'New Zealand', 'Nigeria', 'Norway', 'Oman', 'Pakistan',
  'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia',
  'Saudi Arabia', 'Singapore', 'South Africa', 'South Korea', 'Spain',
  'Sri Lanka', 'Sweden', 'Switzerland', 'Taiwan', 'Thailand', 'Turkey',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Vietnam', 'Zimbabwe',
];

// ─── Shared Styles ────────────────────────────────────────────────────────────
const inp = 'w-full h-10 text-sm modal-input rounded-lg';
const sel = 'w-full h-10 text-sm modal-input rounded-lg';

// ─── Field ────────────────────────────────────────────────────────────────────
// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--shell-text-muted)]">{label}</span>
      <div className="h-[1px] flex-1" style={{ background: 'var(--shell-border)' }} />
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: any) => void;
  editing: any | null;
  businessTypes: string[];
  countries?: string[];
}

// ─── ClientModal ──────────────────────────────────────────────────────────────
export function ClientModal({ isOpen, onClose, onSave, editing, businessTypes: initialBusinessTypes }: ClientModalProps) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    business_type: '',
    // address col 2
    street: '',
    address: '',
    city: '',
    country: '',
    postal_code: '',
    tax_id: '',
    payment_terms: 'Net 30',
    is_active: true,
  });

  const [businessTypes, setBusinessTypes] = useState(initialBusinessTypes);
  const [showNewIndustry, setShowNewIndustry] = useState(false);
  const [newIndustryName, setNewIndustryName] = useState('');

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (editing) {
      // Safe address parsing: guard against fewer than expected parts
      const rawParts = (editing.address || '').split(', ');
      const [addrStreet = '', addrLine2 = '', addrCity = '', addrPostal = ''] = rawParts;
      setForm({
        name: editing.name || '',
        description: editing.description || '',
        contact_name: editing.contact_name || '',
        contact_email: editing.contact_email || '',
        contact_phone: editing.contact_phone || '',
        business_type: editing.business_type || '',
        street: (editing as any).street || addrStreet,
        address: (editing as any).addr2 || addrLine2,
        city: (editing as any).city || addrCity,
        country: (editing as any).country || '',
        postal_code: (editing as any).postal_code || addrPostal,
        tax_id: (editing as any).tax_id || '',
        payment_terms: (editing as any).payment_terms || 'Net 30',
        is_active: editing.is_active === 1 || editing.is_active === true,
      });
    } else {
      setForm({
        name: '', description: '', contact_name: '', contact_email: '',
        contact_phone: '', business_type: '',
        street: '', address: '', city: '', country: '', postal_code: '',
        tax_id: '', payment_terms: 'Net 30', is_active: true,
      });
    }
    setShowNewIndustry(false);
    setNewIndustryName('');
  }, [editing, isOpen]);

  const handleAddIndustry = () => {
    if (!newIndustryName.trim()) return;
    setBusinessTypes((prev) => [...prev, newIndustryName.trim()]);
    set('business_type', newIndustryName.trim());
    setNewIndustryName('');
    setShowNewIndustry(false);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (form.contact_email && !isValidEmail(form.contact_email)) return;
    if (!isValidPhone(form.contact_phone)) return;
    const addressStr = [form.street, form.address, form.city, form.postal_code]
      .filter(Boolean).join(', ');
    onSave({ ...form, address: addressStr });
  };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Client' : 'Add New Client'}
      icon={editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={handleSubmit}
      saveLabel={editing ? 'Save Changes' : 'Create Client'}
      size="lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">

        {/* LEFT column: Client Info */}
        <div className="space-y-2.5">

          <SectionHeader label="Client Info" />

          <Field label="Client Name *">
            <Input className={inp} placeholder="Legal entity name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>

          <Field label="Description">
            <Input className={inp} placeholder="Brief description" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>

          <Field label="Contact Name">
            <Input className={inp} placeholder="Primary contact person" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
          </Field>

          <Field label="Email Address">
            <EmailInput
              value={form.contact_email}
              onChange={(v) => set('contact_email', v)}
              placeholder="official@company.com"
            />
          </Field>

          <Field label="Contact No">
            <PhoneInput
              value={form.contact_phone}
              onChange={(v) => set('contact_phone', v)}
              placeholder="+1 555 0123"
            />
          </Field>

          <Field label="Industry Sector">
            <Select value={form.business_type} onValueChange={(v) => set('business_type', v)}>
              <SelectTrigger className={sel}>
                <SelectValue placeholder="Select sector" />
              </SelectTrigger>
              <SelectContent>
                {businessTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => setShowNewIndustry(!showNewIndustry)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--shell-accent)] hover:underline mt-1"
            >
              <PlusCircle className="w-3 h-3" /> CREATE NEW SECTOR
            </button>
            {showNewIndustry && (
              <div className="mt-1 flex gap-2">
                <Input
                  className="h-10 text-sm modal-input border-[var(--shell-border)] text-[var(--shell-text)] rounded-lg flex-1"
                  placeholder="e.g. Quantum Computing"
                  value={newIndustryName}
                  onChange={(e) => setNewIndustryName(e.target.value)}
                />
                <Button type="button" size="sm" onClick={handleAddIndustry}
                  className="h-10 btn-action-primary font-semibold text-[12.5px] px-3 border border-[var(--shell-border)]">
                  Add
                </Button>
              </div>
            )}
          </Field>

        </div>

        {/* RIGHT column: Address + Billing + Status */}
        <div className="space-y-2.5">

          <SectionHeader label="Address" />

          <Field label="Street">
            <Input className={inp} placeholder="123 Main Street" value={form.street} onChange={(e) => set('street', e.target.value)} />
          </Field>

          <Field label="Address (optional)">
            <Input className={inp} placeholder="Apt / Suite / Building" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>

          <Field label="City">
            <Input className={inp} placeholder="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
          </Field>

          <Field label="Country">
            <Select value={form.country} onValueChange={(v) => set('country', v)}>
              <SelectTrigger className={sel}>
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                {COUNTRY_LIST.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Postal Code">
            <Input className={inp} placeholder="ZIP / Postal" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
          </Field>

          <SectionHeader label="Billing" />

          <Field label="Tax ID / VAT Number">
            <Input className={inp} placeholder="e.g. GB123456789" value={form.tax_id} onChange={(e) => set('tax_id', e.target.value)} />
          </Field>

          <Field label="Payment Terms">
            <Select value={form.payment_terms} onValueChange={(v) => set('payment_terms', v)}>
              <SelectTrigger className={sel}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['Net 15', 'Net 30', 'Net 60', 'Due on Receipt'].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* ── STATUS TOGGLE ── */}
          <div className="pt-1">
            <p id="client-status-label" className="mb-2 block text-xs font-semibold" style={{ color: 'var(--shell-text-muted)' }}>Status</p>
            <div role="radiogroup" aria-labelledby="client-status-label" className="flex p-1 modal-toggle-track rounded-lg gap-1 h-9 w-56">
              {([
                { label: 'Active',   val: true,  active: 'text-[var(--success)] border border-[var(--success)] shadow-sm' },
                { label: 'Inactive', val: false, active: 'text-[var(--danger)] border border-[var(--danger)] shadow-sm' },
              ]).map(({ label, val, active }) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={form.is_active === val}
                  onClick={() => set('is_active', val)}
                  className={`flex-1 py-1.5 text-center text-[11px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    form.is_active === val ? active : 'text-[var(--shell-text-muted)] border border-transparent hover:text-[var(--shell-text)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        </div>

      </div>
    </ModuleModal>
  );
}
