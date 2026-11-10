'use client';

import { useEffect, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import api from '@/lib/api-client';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, NativeSelect, SegmentedControl } from '@/components/shared/modal-primitives';
import type { JobBom } from '@/hooks/use-planning-queries';
import { useSaver } from '@/components/budgets/planning-modals';

type Mode = 'replace' | 'add';

// Start a job BOM from a standard product, or start it again from the same or another one. The copy stays editable.
export function JobBomImportModal({ isOpen, onClose, job }: { isOpen: boolean; onClose: () => void; job: JobBom | undefined }) {
  const { saving, run } = useSaver(onClose);
  const [productId, setProductId] = useState(''); const [mode, setMode] = useState<Mode>('replace');
  const sources = job?.import_sources ?? [];
  useEffect(() => {
    if (!isOpen) return;
    const same = job?.source && sources.some((s) => s.id === job.source!.product_id) ? String(job.source.product_id) : '';
    // Adding keeps what is there, so it is the default when the job BOM already has parts or operations
    setProductId(same); setMode(job && (job.lines.length > 0 || job.operations.length > 0) ? 'add' : 'replace');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!job) return null;
  const parts = job.lines.length; const ops = job.operations.length;
  const hasContent = parts > 0 || ops > 0;
  const chosen = sources.find((s) => String(s.id) === productId) ?? null;
  const replacing = hasContent && mode === 'replace';
  const label = (s: (typeof sources)[number]) => `${[s.code, s.name].filter(Boolean).join(' ')} · BOM version ${s.version}`;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title={hasContent ? 'Reimport BOM' : 'Import BOM'} icon={<PackageOpen className="h-4 w-4" />} isDestructive={replacing}
      canSave={!saving && !!chosen} saveLabel={!hasContent ? 'Import BOM' : replacing ? 'Replace BOM' : 'Add to BOM'}
      onSave={() => run(() => api.post(`/budgets/projects/${job.project.id}/job-bom/import`, { product_id: Number(productId), mode: hasContent ? mode : 'replace' }),
        replacing ? 'Job BOM replaced with the product BOM.' : 'Product BOM imported into the job BOM.')}>
      <div className="space-y-4">
        <p className="text-[13px] text-[var(--shell-text-muted)]">Use a standard product as the starting point for this job. Its parts and build operations are copied in. After that the job BOM is yours to change, and it is no longer linked to the product.</p>
        <Field label="Product" required hint={job.source ? `Last imported from ${[job.source.code, job.source.name].filter(Boolean).join(' ')}${job.source.version != null ? `, BOM version ${job.source.version}` : ''}. Choose another product to start from a different one.` : 'Only products that have a BOM are listed.'}>
          <NativeSelect aria-label="Product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Choose a product</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{label(s)}{job.source?.product_id === s.id ? ' (last imported)' : ''}</option>)}
          </NativeSelect>
        </Field>
        {chosen && <p className="text-[13px] text-[var(--shell-text)]">{chosen.lines} part{chosen.lines === 1 ? '' : 's'} and {chosen.operations} build operation{chosen.operations === 1 ? '' : 's'} will be copied.</p>}
        {hasContent && (
          <div className="space-y-1.5">
            <p id="job-import-mode" className="text-[13px] font-medium text-[var(--shell-text)]">What to do with the current job BOM</p>
            <SegmentedControl labelledBy="job-import-mode" value={mode} onChange={setMode} options={[{ value: 'replace' as const, label: 'Replace it' }, { value: 'add' as const, label: 'Add to it' }]} />
            <p className={`text-[12px] ${replacing ? 'text-[var(--warning)]' : 'text-[var(--shell-text-muted)]'}`}>
              {replacing
                ? `This removes the ${parts} part${parts === 1 ? '' : 's'} and ${ops} build operation${ops === 1 ? '' : 's'} now on the job BOM, including any you added by hand, and puts the product's in their place.`
                : `The product's parts and operations are added after the ${parts} part${parts === 1 ? '' : 's'} and ${ops} build operation${ops === 1 ? '' : 's'} already there. A part that is on both appears twice.`}
            </p>
          </div>
        )}
        <p className="text-[12px] text-[var(--shell-text-muted)]">The parts keep their group and sequence from the product. The project estimate updates to match.</p>
      </div>
    </ModuleModal>
  );
}
