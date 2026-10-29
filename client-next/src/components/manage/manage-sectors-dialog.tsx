'use client';

import { Button } from '@/components/ui/button';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { useInvalidate, useSectorUsage, type ClientSector } from '@/hooks/use-queries';
import { ManageList } from './manage-list';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sectors: ClientSector[];
}

// Industry sectors for clients: one list for now. It uses the same ManageList as the types dialog,
// so a second level can be added beside it later without new UI.
export function ManageSectorsDialog({ isOpen, onClose, sectors }: Props) {
  const invalidate = useInvalidate();
  const { data: usage } = useSectorUsage(isOpen);
  const done = async <T,>(job: Promise<T>) => { const r = await job; invalidate('clientSectors', 'sectorUsage', 'clients'); return r; };

  return (
    <ModuleModal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage client sectors"
      size="md"
      footer={<Button onClick={onClose} className="h-8 px-5 text-[12px] font-semibold">Done</Button>}
    >
      <ManageList
        heading="Sectors"
        sectionLabel="Sectors"
        noun="sector"
        items={sectors.map((s) => ({ id: s.id, name: s.name, used: usage?.sectors[s.id] ?? 0 }))}
        emptyText="No sectors yet."
        taken={(name, exceptId) =>
          sectors.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === name.trim().toLowerCase())
            ? `A sector named "${name}" already exists` : null}
        onAdd={(name) => done(api.post('/client-sectors', { name }))}
        onRename={(id, name) => done(api.put(`/client-sectors/${id}`, { name }))}
        onRemove={async (id) => (await done(api.delete(`/client-sectors/${id}`))).data as any}
        usedBy="clients"
      />
    </ModuleModal>
  );
}
