'use client';

import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useClients, useProjects, useProjectTypes, useProjectCategories, useUsers, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/modal-primitives';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Tags,
  Target, ArrowUpRight, FolderOpen
} from 'lucide-react';
import { ManageTypesDialog } from '@/components/manage/manage-types-dialog';
import { ProjectModal } from '@/components/manage/project-modals';
import type { Project } from '@/lib/types';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { columns, projectState } from './columns';
import { 
  getCoreRowModel, 
  getFilteredRowModel, 
  getPaginationRowModel, 
  getSortedRowModel, 
  getFacetedRowModel,
  getFacetedUniqueValues,
  type SortingState,
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { useRouter } from 'next/navigation';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAllocation, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { formatDate } from '@/lib/currency';

export default function ProjectsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: clients } = useClients();
  // Managing types and categories is admin-only; the API checks the active role the same way
  const isAdmin = (useAuthStore((s) => s.user)?.role_name || '').toUpperCase() === 'ADMIN';
  const invalidate = useInvalidate();

  const { data: projects, isLoading } = useProjects();
  const { data: usersData } = useUsers();
  const allUsers = Array.isArray(usersData) ? usersData : [];
  const { data: types } = useProjectTypes();
  const { data: categories } = useProjectCategories();

  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const list = (projects || []) as any[];
  const real = list.filter((p) => !p.is_system);
  useEffect(() => {
    setHeader('Projects', projects ? `${real.length} projects, ${real.filter((p) => (p.status || 'Active') === 'Active').length} active` : 'Client projects and who leads them');
  }, [setHeader, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  // Overdue and on-hold first
  const [sorting, setSorting] = useState<SortingState>([{ id: 'status', desc: false }]);
  const table = useDataTable<Project>({
    data: projects || [],
    columns,
    state: {
      rowSelection,
      globalFilter,
      sorting,
    },
    onSortingChange: setSorting,
    enableRowSelection: true,
    enableMultiRowSelection: false,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedProject = selectedRows.length > 0 ? selectedRows[0].original : null;

  const handleSaveProject = async (form: any) => {
    try {
      if (editingProject) {
        await api.put(`/projects/${editingProject.id}`, form);
        toast.success('Project updated');
      } else {
        await api.post('/projects', form);
        toast.success('Project added');
      }
      invalidate('projects');
      setIsModalOpen(false);
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save project');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/projects/${deleteId}`);
      toast.success('Project deleted');
      invalidate('projects');
      setDeleteId(null);
      setRowSelection({});
    } catch (e: any) {
      setDeleteId(null);
      toast.error(e?.message || 'Could not delete the project.');
    }
  };

  const router = useRouter();
  const itemActions: DetailActionDef[] = selectedProject ? [
    { label: 'Edit', onClick: () => { setEditingProject(selectedProject as any); setIsModalOpen(true); } },
    { label: 'Open costing', variant: 'primary', icon: <FolderOpen className="h-4 w-4 text-[var(--nav-slate)]" />, onClick: () => router.push(`/budget/projects/${(selectedProject as any).id}`) },
    { label: 'Delete', variant: 'danger', onClick: () => setDeleteId((selectedProject as any).id) },
  ] : [];

  // What the list holds, instead of instructions. Estimates, spend and margin are on Project Costing.
  const count = (s: string) => real.filter((p) => projectState(p) === s).length;
  const projectSummary = (
    <div className="space-y-4">
      <DetailSummary title="All projects" subtitle="Client projects" figure={real.length} figureLabel="Projects" />
      <DetailSection title="Where they stand">
        <DetailGrid>
          <DetailField label="Past end date" value={count('Overdue')} tone={count('Overdue') ? 'danger' : 'muted'} />
          <DetailField label="On hold" value={count('On-Hold')} tone={count('On-Hold') ? 'warning' : 'muted'} />
          <DetailField label="Active" value={count('Active')} />
          <DetailField label="Proposed" value={count('Proposed')} />
          <DetailField label="Completed or canceled" value={count('Completed') + count('Canceled')} wide />
        </DetailGrid>
      </DetailSection>
      <p className="text-[12px] text-[var(--shell-text-muted)]">Estimates, spend and margin are on Project Costing.</p>
    </div>
  );

  return (
    <ModuleShell
      showPanel={!!selectedProject}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={<>
            <button className="btn-action" onClick={() => { setEditingProject(null); setIsModalOpen(true); }}>
              <Plus className="h-4 w-4 text-[var(--success)]" /> Add
            </button>
            {isAdmin && (
              <button className="btn-action" onClick={() => setManageOpen(true)}>
                <Tags aria-hidden className="h-4 w-4 text-[var(--nav-violet)]" /> Types
              </button>
            )}
          <ToolbarActions actions={itemActions} /></>}
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title={selectedProject ? 'Project' : 'Summary'}
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedProject}
            idle={projectSummary}
            footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}
          >
            {selectedProject && (() => {
              const pr: any = selectedProject;
              const tone: Record<string, string> = {
                'Active': 'text-[var(--success)]', 'On-Hold': 'text-[var(--warning)]', 'Completed': 'text-[var(--info)]', 'Canceled': 'text-[var(--danger)]', 'Overdue': 'text-[var(--danger)]',
              };
              const status = projectState(pr);
              return (
                <>
                  <DetailSummary
                    title={pr.name}
                    subtitle={pr.code || 'Code pending'}
                    status={status}
                    statusClass={tone[status] || 'text-[var(--shell-text-muted)]'}
                  />
                  <DetailSection title="Details">
                    <DetailGrid>
                      <DetailField label="Type" value={pr.type_name} />
                      <DetailField label="Category" value={pr.category_name} />
                      <DetailField label="Project lead" value={pr.lead} />
                      <DetailField label="Client" value={pr.client_name} wide />
                      <DetailField label="Start date" value={formatDate(pr.start_date)} />
                      <DetailField label="End date" value={formatDate(pr.end_date)} />
                    </DetailGrid>
                  </DetailSection>
                  {pr.description && (
                    <DetailSection title="Description">
                      <p className="text-[13px] leading-relaxed text-[var(--shell-text)]">{pr.description}</p>
                    </DetailSection>
                  )}
                </>
              );
            })()}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
        isLoading={isLoading}
        columns={columns}
        data={projects || []}
        tableInstance={table}
        emptyMessage={globalFilter ? 'No projects match this search.' : 'No projects yet. Use Add to create the first one.'}
      />

      <ProjectModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProject}
        categories={categories || []}
        editing={editingProject}
        clients={clients || []}
        projectTypes={types || []}
        users={allUsers}
      />

      <ManageTypesDialog
        kind="project"
        isOpen={manageOpen}
        onClose={() => setManageOpen(false)}
        types={types || []}
        categories={categories || []}
      />

      {/* Simplified Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete project"
        message={`Delete ${(list.find((p) => p.id === deleteId)?.name) ?? 'this project'}? It is removed from every list. Expenses already charged to it are kept.`}
        confirmLabel="Delete project"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </ModuleShell>
  );
}
