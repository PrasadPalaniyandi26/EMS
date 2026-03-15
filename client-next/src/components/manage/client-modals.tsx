'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, PlusCircle, Save, Send } from 'lucide-react';

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
const inp = 'w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg';
const sel = 'w-full h-8 text-[12px] bg-white border-casper/50 focus:ring-1 focus:ring-juniper focus:border-juniper rounded-lg';

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">{label}</Label>
      {children}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-juniper">{label}</span>
      <div className="h-[1px] flex-1 bg-slate-100" />
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
      const parts = (editing.address || '').split(', ');
      setForm({
        name: editing.name || '',
        description: editing.description || '',
        contact_name: editing.contact_name || '',
        contact_email: editing.contact_email || '',
        contact_phone: editing.contact_phone || '',
        business_type: editing.business_type || '',
        street: (editing as any).street || parts[0] || '',
        address: (editing as any).addr2 || parts[1] || '',
        city: (editing as any).city || parts[2] || '',
        country: (editing as any).country || '',
        postal_code: (editing as any).postal_code || parts[3] || '',
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
    const addressStr = [form.street, form.address, form.city, form.postal_code]
      .filter(Boolean).join(', ');
    onSave({ ...form, address: addressStr });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-[860px] w-[95vw] p-0 overflow-hidden bg-[#FAF9F6] border-none shadow-2xl rounded-xl flex flex-col"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="h-[48px] px-5 bg-juniper text-white flex flex-row items-center justify-between shrink-0 border-none space-y-0">
          <div>
            <DialogTitle className="text-[11px] font-bold uppercase tracking-[0.2em] leading-none">
              {editing ? 'Edit Client' : 'Add New Client'}
            </DialogTitle>
            <p className="text-[8px] font-black uppercase tracking-widest opacity-60 mt-0.5">
              {editing ? `Updating ${editing.name}` : 'Client Registry'}
            </p>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 rounded p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </DialogHeader>

        {/* Body */}
        <div className="pt-3 px-6 pb-4 max-h-[82vh] overflow-y-auto custom-scrollbar flex-1 space-y-4">

          <div className="grid grid-cols-2 gap-x-6">

            {/* ── LEFT COLUMN ── */}
            <div className="space-y-3">

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
                <Input className={inp} type="email" placeholder="official@company.com" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
              </Field>

              <Field label="Contact No">
                <Input className={inp} type="tel" placeholder="+1 555 0123" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
              </Field>

              <div className="space-y-1">
                <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">Industry Sector</Label>
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
                  className="flex items-center gap-1.5 text-[9px] font-bold text-juniper hover:underline mt-1"
                >
                  <PlusCircle className="w-3 h-3" /> CREATE NEW SECTOR
                </button>
                {showNewIndustry && (
                  <div className="mt-1 flex gap-2">
                    <Input
                      className="h-8 text-[12px] bg-white border-casper/40 rounded-lg flex-1"
                      placeholder="e.g. Quantum Computing"
                      value={newIndustryName}
                      onChange={(e) => setNewIndustryName(e.target.value)}
                    />
                    <Button type="button" size="sm" onClick={handleAddIndustry}
                      className="h-8 bg-juniper hover:brightness-110 text-white text-[10px] font-bold uppercase tracking-widest px-3">
                      Add
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT COLUMN ── */}
            <div className="space-y-3">

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

              <Field label="Tax ID / VAT Number">
                <Input className={inp} placeholder="e.g. GB123456789" value={form.tax_id} onChange={(e) => set('tax_id', e.target.value)} />
              </Field>

              <div className="space-y-1">
                <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em]">Payment Terms</Label>
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
              </div>
            </div>
          </div>

          {/* ── STATUS TOGGLE ── */}
          <div className="pt-1">
            <Label className="text-[9px] font-bold text-juniper uppercase tracking-[0.1em] block mb-2">Status</Label>
            <div className="flex p-1 bg-[#FAF9F6] border border-casper/50 rounded-lg gap-1 h-9 w-56">
              {[{ label: 'Active', val: true }, { label: 'Inactive', val: false }].map(({ label, val }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => set('is_active', val)}
                  className={`flex-1 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    form.is_active === val ? 'bg-juniper text-white shadow-sm' : 'text-casper hover:text-charcoal'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="bg-mystic/20 border-t border-casper/30 px-6 py-3 flex flex-row items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose}
            className="bg-white border-casper text-juniper font-bold text-[10px] uppercase tracking-widest hover:bg-casper/10 h-9 px-5">
            Cancel
          </Button>
          <Button onClick={handleSubmit}
            className="bg-juniper hover:brightness-110 text-white font-bold text-[10px] uppercase tracking-widest h-9 px-6 flex items-center gap-2">
            {editing ? <><Save className="w-3.5 h-3.5" /> Save Changes</> : <><Send className="w-3.5 h-3.5" /> Create Client</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
