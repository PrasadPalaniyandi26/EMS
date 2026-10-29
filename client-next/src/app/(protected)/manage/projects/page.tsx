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
  Target, ArrowUpRight
} from 'lucide-react';
import { ManageTypesDialog } from '@/components/manage/manage-types-dialog';
import { ProjectModal } from '@/components/manage/project-modals';
import type { Project } from '@/lib/types';
import { DataTable } from '@/components/data-table/data-table';
import { DataTableToolbar } from '@/components/data-table/data-table-toolbar';
import { columns } from './columns';
import { 
  getCoreRowModel, 
  getFilteredRowModel, 
  getPaginationRowModel, 
  getSortedRowModel, 
  getFacetedRowModel,
  getFacetedUniqueValues,
} from "@tanstack/react-table";
import { useDataTable } from '@/hooks/use-data-table';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { DetailSummary, DetailSection, DetailGrid, DetailField, DetailAllocation, DetailActions, ToolbarActions, type DetailActionDef } from '@/components/shared/detail/detail-kit';
import { formatCurrency } from '@/lib/currency';

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

  useEffect(() => { 
    setHeader('Projects', 'Operations Hub • Managed Portfolios'); 
  }, [setHeader]);

  const table = useDataTable<Project>({
    data: projects || [],
    columns,
    state: {
      rowSelection,
      globalFilter,
    },
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
        toast.success('Project parameters updated');
      } else {
        await api.post('/projects', form);
        toast.success('New project initialized');
      }
      invalidate('projects');
      setIsModalOpen(false);
      setRowSelection({});
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save project');
    }
  };

  const handleSaveType = async (form: any) => {
    try {
      const res = await api.post('/project-types', form);
      toast.success('Project type created');
      invalidate('projectTypes');
      return (res.data as any);
    } catch {
      toast.error('Failed to create project type');
      throw new Error('Failed');
    }
  };

  const handleSaveCategory = async (form: any) => {
    try {
      const res = await api.post('/project-categories', form);
      invalidate('projectCategories');
      return (res.data as any);
    } catch {
      toast.error('Failed to create category');
      throw new Error('Failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/projects/${deleteId}`);
      toast.success('Project entity purged');
      invalidate('projects');
      setDeleteId(null);
      setRowSelection({});
    } catch {
      toast.error('Purge failed');
    }
  };

  const itemActions: DetailActionDef[] = selectedProject ? [
    { label: 'Edit', variant: 'primary', onClick: () => { setEditingProject(selectedProject as any); setIsModalOpen(true); } },
    { label: 'Delete', variant: 'danger', onClick: () => setDeleteId((selectedProject as any).id) },
  ] : [];

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
            title="Project Intelligence"
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedProject}
            footer={itemActions.length > 0 ? <DetailActions actions={itemActions} /> : undefined}
          >
            {selectedProject && (() => {
              const pr: any = selectedProject;
              const tone: Record<string, string> = {
                'Active': 'text-[var(--success)]', 'On-Hold': 'text-[var(--warning)]', 'Completed': 'text-[var(--info)]', 'Canceled': 'text-[var(--danger)]',
              };
              const status = pr.status || 'Active';
              return (
                <>
                  <DetailSummary
                    title={pr.name}
                    subtitle={pr.code || 'Code pending'}
                    status={status}
                    statusClass={tone[status] || 'text-[var(--shell-text-muted)]'}
                    figure={formatCurrency(Number(pr.budget || 0), 'INR')}
                    figureLabel="Est. budget"
                  />
                  <DetailSection title="Details">
                    <DetailGrid>
                      <DetailField label="Type" value={pr.type_name} />
                      <DetailField label="Project lead" value={pr.lead} />
                      <DetailField label="Client" value={pr.client_name} wide />
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
        emptyMessage="No projects found. Click Add to create one."
      />

      <ProjectModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProject}
        onSaveType={isAdmin ? handleSaveType : undefined}
        categories={categories || []}
        onSaveCategory={isAdmin ? handleSaveCategory : undefined}
        editing={editingProject}
        clients={clients || []}
        projectTypes={types || []}
        users={allUsers}
      />

      <ManageTypesDialog
        kind="project"
        isOpen={manageOpen}
        onClose={() => setManageOpen(false)}
        clients={clients || []}
        types={types || []}
        categories={categories || []}
      />

      {/* Simplified Delete Confirm */}
      <ConfirmDialog
        open={!!deleteId}
        title="Delete Project"
        message="Are you sure you want to delete this project? This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </ModuleShell>
  );
}
