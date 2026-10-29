'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toLocalYMD } from '@/lib/currency';
import { toast } from 'sonner';
import { useClients, useProjects, useProducts, useProjectTypes, useProductTypes } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, AutoLabel, inp } from '@/components/shared/modal-primitives';

export function AllocationModal({ isOpen, onClose, user }: { isOpen: boolean; onClose: () => void; user: any }) {
  const { data: clients } = useClients();
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [form, setForm] = useState({ client_id: '', category: 'Project', type_id: '', code: '' });
  const setF = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Only load type/code data once a client is selected
  const clientId = form.client_id ? Number(form.client_id) : undefined;
  const typeId = form.type_id ? Number(form.type_id) : undefined;

  const { data: projectTypes } = useProjectTypes();
  const { data: productTypes } = useProductTypes();
  const { data: projects } = useProjects(clientId);
  const { data: products } = useProducts(clientId);

  // Type options based on category — real types from API
  const typeOptions = form.category === 'Project'
    ? (projectTypes || [])
    : (productTypes || []);

  // Code options: filter by selected type_id
  const codeOptions = form.category === 'Project'
    ? (projects || []).filter((p: any) => !typeId || p.type_id === typeId).map((p: any) => ({ id: p.id, label: p.code || p.name, name: p.name }))
    : (products || []).filter((p: any) => !typeId || p.type_id === typeId).map((p: any) => ({ id: p.id, label: p.code || p.name, name: p.name }));

  const fetchAllocations = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await api.get(`/users/${user.id}/allocations`);
      setAllocations(res.data as any[]);
    } catch { setAllocations([]); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (isOpen && user?.id) fetchAllocations();
  }, [isOpen, user]);

  // When category changes, reset type and code
  useEffect(() => {
    setF('type_id', '');
    setF('code', '');
  }, [form.category]);

  // When client or type changes, reset code
  useEffect(() => { setF('code', ''); }, [form.client_id, form.type_id]);

  const handleAddAllocation = async () => {
    if (!form.client_id) { toast.error('Please select a client.'); return; }
    if (!form.code) { toast.error('Please select a project/product code.'); return; }
    setSaving(true);
    try {
      await api.post(`/users/${user.id}/allocations`, {
        client_id: Number(form.client_id),
        category: form.category,
        type: typeOptions.find((t: any) => String(t.id) === form.type_id)?.name || form.category,
        code: form.code,
      });
      toast.success('Allocation added.');
      await fetchAllocations();
      setF('code', '');
    } catch (err: any) {
      const msg = err?.message || 'Failed to add allocation.';
      toast.error(msg);
    } finally { setSaving(false); }
  };

  const handleRemove = async () => {
    if (selected.size === 0) { toast.error('Select allocations to remove.'); return; }
    setSaving(true);
    try {
      await Promise.all([...selected].map((id) => api.delete(`/users/allocations/${id}`)));
      toast.success(`${selected.size} allocation(s) removed.`);
      setSelected(new Set());
      await fetchAllocations();
    } catch { toast.error('Failed to remove allocations.'); } finally { setSaving(false); }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resource Allocation — ${user?.username || ''}`}
      icon={<Pencil className="w-4 h-4" />}
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose} className="h-8 px-4 text-[12px] font-medium" style={{ color: 'var(--shell-text-muted)' }}>Close</Button>
      }
    >
      <div className="space-y-2.5">
        {/* Add form — 4 equal-width fields in one row, no section box */}
        <div className="grid grid-cols-4 gap-2">
          <div className="space-y-1">
            <AutoLabel className="text-xs font-medium text-[var(--shell-text)] normal-case tracking-normal">Client</AutoLabel>
            <Select value={form.client_id} onValueChange={(v) => setF('client_id', v)}>
              <SelectTrigger className={inp}>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {(clients as any[] || []).map((c: any) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <AutoLabel className="text-xs font-medium text-[var(--shell-text)] normal-case tracking-normal">Category</AutoLabel>
            <Select value={form.category} onValueChange={(v) => setF('category', v)}>
              <SelectTrigger className={inp}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Project">Project</SelectItem>
                <SelectItem value="Product">Product</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <AutoLabel className="text-xs font-medium text-[var(--shell-text)] normal-case tracking-normal">Type</AutoLabel>
            <Select value={form.type_id} onValueChange={(v) => setF('type_id', v)} disabled={typeOptions.length === 0}>
              <SelectTrigger className={inp}>
                <SelectValue placeholder={!form.client_id ? 'Select client first' : typeOptions.length === 0 ? 'No types available' : 'Select type'} />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <AutoLabel className="text-xs font-medium text-[var(--shell-text)] normal-case tracking-normal">{form.category} Code</AutoLabel>
            <Select value={form.code} onValueChange={(v) => setF('code', v)} disabled={codeOptions.length === 0}>
              <SelectTrigger className={inp}>
                <SelectValue placeholder={codeOptions.length === 0 ? 'Select type first' : 'Select code'} />
              </SelectTrigger>
              <SelectContent>
                {codeOptions.map((o: any) => <SelectItem key={o.id} value={o.label}>{o.label} — {o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Action row */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button className="btn-action-primary border border-[var(--shell-border)] text-[var(--shell-text)] font-semibold text-[12px] h-8 px-4 rounded-lg flex items-center gap-1.5" onClick={handleAddAllocation} disabled={saving}>
              <Plus className="w-3.5 h-3.5" /> Add Allocation
            </Button>
            <Button variant="outline" className="border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] font-semibold text-[12px] h-8 px-4 rounded-lg flex items-center gap-1.5" onClick={handleRemove} disabled={saving || selected.size === 0}>
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </Button>
          </div>
          <span className="text-[12px] font-semibold text-[var(--shell-text-muted)]">{allocations.length} Allocation{allocations.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <div className="border border-[var(--shell-border)] rounded-lg overflow-hidden" style={{ background: 'var(--shell-surface)' }}>
          <table className="w-full text-left">
            <thead className="dialog-header">
              <tr className="text-[12px] font-semibold">
                <th className="w-10 px-4 py-3 text-center">
                  <input type="checkbox" className="size-3.5 rounded-md border-[var(--shell-border)]" onChange={(e) => setSelected(e.target.checked ? new Set(allocations.map((a) => a.id)) : new Set())} checked={selected.size === allocations.length && allocations.length > 0} />
                </th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Code</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--shell-border)] text-[12px]">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--shell-text-muted)] italic">Loading...</td></tr>
              ) : allocations.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--shell-text-muted)] italic font-medium">No allocations yet.</td></tr>
              ) : allocations.map((a) => (
                <tr key={a.id} className={cn('transition-colors', selected.has(a.id) ? 'bg-[var(--shell-accent)]/10' : 'hover:rounded-lg border')}>
                  <td className="px-4 py-3 text-center">
                    <input type="checkbox" className="size-3.5 rounded-md border-[var(--shell-border)]" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-[var(--shell-text)]">{a.client_name}</td>
                  <td className="px-4 py-3 text-[var(--shell-text)]">{a.category}</td>
                  <td className="px-4 py-3 text-[var(--shell-text)]">{a.type}</td>
                  <td className="px-4 py-3 text-[var(--shell-text)] font-semibold">{a.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ModuleModal>
  );
}

