'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Plus, Pencil } from 'lucide-react';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, EmailInput, PhoneInput, SegmentedControl, isValidEmail, isValidPhone, inp } from '@/components/shared/modal-primitives';
import { AddressFields, type AddressKey } from '@/components/shared/address-fields';
import { SectorSelect } from '@/components/shared/reference-selects';
import { isValidGstin, stateCodeOf } from '@/lib/invoice-gst';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (form: any) => void;
  editing: any | null;
}

const EMPTY = {
  name: '',
  description: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  business_type: '',
  street: '',
  address_line2: '',
  city: '',
  state: '',
  country: '',
  postal_code: '',
  gstin: '',
  payment_terms_days: '30',
  is_active: true,
};

// The shared address block names the second line "line2"; a client stores it as address_line2
const ADDRESS_FIELD: Record<AddressKey, keyof typeof EMPTY> = {
  street: 'street', line2: 'address_line2', city: 'city', state: 'state', country: 'country', postal_code: 'postal_code',
};

// ─── ClientModal ──────────────────────────────────────────────────────────────
export function ClientModal({ isOpen, onClose, onSave, editing }: ClientModalProps) {
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));
  // A GSTIN must agree with the state, when both are given
  const gstStateOk = !form.gstin || !form.state || !isValidGstin(form.gstin) || !stateCodeOf(null, form.state) || stateCodeOf(form.gstin, null) === stateCodeOf(null, form.state);

  useEffect(() => {
    if (editing) {
      const e = editing as any;
      // Clients saved before the address was stored in parts only have one joined line: street, line 2, city, postal code
      const hasParts = e.street || e.address_line2 || e.city || e.state || e.postal_code;
      const [oldStreet = '', oldLine2 = '', oldCity = '', oldPostal = ''] = hasParts ? [] : (e.address || '').split(', ');
      setForm({
        name: e.name || '',
        description: e.description || '',
        contact_name: e.contact_name || '',
        contact_email: e.contact_email || '',
        contact_phone: e.contact_phone || '',
        business_type: e.business_type || '',
        street: e.street || oldStreet,
        address_line2: e.address_line2 || oldLine2,
        city: e.city || oldCity,
        state: e.state || '',
        country: e.country || '',
        postal_code: e.postal_code || oldPostal,
        gstin: e.gstin || '',
        payment_terms_days: String(e.payment_terms_days ?? 30),
        is_active: e.is_active === 1 || e.is_active === true,
      });
    } else {
      setForm(EMPTY);
    }
  }, [editing, isOpen]);


  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (form.contact_email && !isValidEmail(form.contact_email)) return;
    if (!isValidPhone(form.contact_phone)) return;
    // The table and detail panel show the address as one line; the parts are saved too
    const addressStr = [form.street, form.address_line2, form.city, form.state, form.postal_code].filter(Boolean).join(', ');
    onSave({ ...form, gstin: form.gstin.trim().toUpperCase(), payment_terms_days: Number(form.payment_terms_days), address: addressStr });
  };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? 'Edit Client' : 'Add New Client'}
      icon={editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      onSave={handleSubmit}
      canSave={!!form.name.trim() && (!form.contact_email || isValidEmail(form.contact_email)) && isValidPhone(form.contact_phone) && isValidGstin(form.gstin) && gstStateOk}
      saveLabel={editing ? 'Save Changes' : 'Create Client'}
      size="xl"
    >
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-5 md:grid-cols-3">

        {/* Column 1: who the client is */}
        <div className="space-y-3">
          <Field label="Client Name" required>
            <Input className={inp} placeholder="Legal entity name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Description">
            <Input className={inp} placeholder="Brief description" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <SectorSelect value={form.business_type} onChange={(name) => set('business_type', name)} />
          <div>
            <p id="client-status-label" className="mb-2 block text-[13px] font-medium" style={{ color: 'var(--shell-text)' }}>Status</p>
            <SegmentedControl
              labelledBy="client-status-label"
              value={form.is_active}
              onChange={(v) => set('is_active', v)}
              options={[
                { value: true, label: 'Active', tone: 'success' },
                { value: false, label: 'Inactive', tone: 'danger' },
              ]}
            />
          </div>
        </div>

        {/* Column 2: how to reach and bill them */}
        <div className="space-y-3">
          <Field label="Contact Name">
            <Input className={inp} placeholder="Primary contact person" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
          </Field>
          <Field label="Email Address">
            <EmailInput value={form.contact_email} onChange={(v) => set('contact_email', v)} placeholder="official@company.com" />
          </Field>
          <Field label="Contact No">
            <PhoneInput value={form.contact_phone} onChange={(v) => set('contact_phone', v)} placeholder="+1 555 0123" />
          </Field>
          <Field label="GSTIN" hint="For tax invoices. Its first two digits give the client's state." error={!isValidGstin(form.gstin) ? 'A GSTIN has 15 characters, for example 33ABCDE1234F1Z5.' : !gstStateOk ? 'Does not match the state.' : undefined}>
            <Input className={inp} maxLength={15} placeholder="33ABCDE1234F1Z5" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} />
          </Field>
          <Field label="Payment terms" hint="How many days after the invoice date a client has to pay.">
            <NativeSelect value={form.payment_terms_days} onChange={(e) => set('payment_terms_days', e.target.value)}>
              {[['0', 'Due on receipt'], ['15', '15 days'], ['30', '30 days'], ['45', '45 days'], ['60', '60 days'], ['90', '90 days']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              {!['0', '15', '30', '45', '60', '90'].includes(form.payment_terms_days) && <option value={form.payment_terms_days}>{form.payment_terms_days} days</option>}
            </NativeSelect>
          </Field>
        </div>

        {/* Column 3: where they are */}
        <div className="space-y-3">
          <AddressFields
            value={{
              street: form.street, line2: form.address_line2, city: form.city,
              state: form.state, country: form.country, postal_code: form.postal_code,
            }}
            onChange={(key, v) => set(ADDRESS_FIELD[key], v)}
          />
        </div>

      </div>
    </ModuleModal>
  );
}
