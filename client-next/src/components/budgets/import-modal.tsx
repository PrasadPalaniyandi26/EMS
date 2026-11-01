'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import api from '@/lib/api-client';
import { downloadCsv, parseCsv, toCsv } from '@/lib/csv';
import { ModuleModal } from '@/components/shared/module/module-modal';
import { Field, inp } from '@/components/shared/modal-primitives';
import { Input } from '@/components/ui/input';
import { useInvalidate } from '@/hooks/use-queries';
import type { ImportResult } from '@/hooks/use-planning-queries';

const ctl = `${inp} border-input bg-transparent text-[var(--shell-text)]`;

// Pick a CSV, see what it would change, then import. Nothing is saved unless every row passes.
export function ImportModal({ isOpen, onClose, title, endpoint, templateName, headers, sample, notes }: {
  isOpen: boolean; onClose: () => void; title: string; endpoint: string; templateName: string; headers: string[]; sample: string[][]; notes: string;
}) {
  const invalidate = useInvalidate();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (isOpen) { setRows([]); setFileName(''); setResult(null); setProblem(''); setBusy(false); } }, [isOpen]);

  const check = async (file: File | undefined) => {
    setResult(null); setProblem(''); setRows([]); setFileName(file?.name ?? '');
    if (!file) return;
    setBusy(true);
    try {
      const parsed = parseCsv(await file.text());
      if (!parsed.rows.length) { setProblem('The file has no rows. The first line must be the column titles.'); return; }
      const missing = headers.slice(0, 1).filter((h) => !parsed.headers.includes(h));
      if (missing.length) { setProblem(`The file needs a "${missing[0]}" column. Download the template to see the layout.`); return; }
      setRows(parsed.rows);
      const res = await api.post<ImportResult>(endpoint, { rows: parsed.rows, dry_run: true });
      setResult(res.data);
    } catch (e: any) {
      setProblem(e?.message || 'Could not read that file.');
    } finally { setBusy(false); }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const res = await api.post<ImportResult>(endpoint, { rows, dry_run: false });
      if (res.data.applied) { toast.success(`Imported: ${res.data.created} added, ${res.data.updated} updated.`); invalidate('budgets'); onClose(); }
      else setResult(res.data);
    } catch (e: any) { toast.error(e?.message || 'Could not import.'); } finally { setBusy(false); }
  };

  const changes = (result?.created ?? 0) + (result?.updated ?? 0);
  const ready = !!result && result.errors.length === 0 && changes > 0;
  return (
    <ModuleModal isOpen={isOpen} onClose={onClose} size="md" title={title} icon={<Upload className="h-4 w-4" />}
      canSave={!busy && ready} saveLabel={ready ? `Import ${changes} row${changes === 1 ? '' : 's'}` : 'Import'} onSave={apply}>
      <div className="space-y-3">
        <p className="text-[12px] text-[var(--shell-text-muted)]">{notes}</p>
        <button type="button" className="text-[12px] text-[var(--shell-accent)] underline-offset-2 hover:underline" onClick={() => downloadCsv(templateName, toCsv(headers, sample))}>Download the template</button>
        <Field label="CSV file" required hint={fileName || 'Choose a .csv file. Columns are matched by their titles.'}>
          <Input type="file" accept=".csv,text/csv" className={ctl} onChange={(e) => void check(e.target.files?.[0])} />
        </Field>
        {busy && <p className="text-[13px] text-[var(--shell-text-muted)]">Checking…</p>}
        {problem && <p role="alert" className="text-[13px] text-[var(--danger)]">{problem}</p>}
        {result && (
          <div className="rounded-md border border-[var(--shell-border)] p-3 text-[13px]">
            <p className="text-[var(--shell-text)]">{result.created} to add, {result.updated} to update{result.unchanged ? `, ${result.unchanged} unchanged` : ''}.</p>
            {result.errors.length > 0 && (
              <div className="mt-2 space-y-1" role="alert">
                <p className="text-[var(--danger)]">{result.errors.length} row{result.errors.length === 1 ? '' : 's'} need fixing. Nothing is imported until they are.</p>
                <ul className="max-h-40 space-y-0.5 overflow-auto text-[12px] text-[var(--danger)]">
                  {result.errors.slice(0, 20).map((er) => <li key={`${er.row}-${er.message}`}>Row {er.row}: {er.message}</li>)}
                  {result.errors.length > 20 && <li>…and {result.errors.length - 20} more.</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </ModuleModal>
  );
}
