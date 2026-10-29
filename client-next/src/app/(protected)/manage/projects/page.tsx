'use client';

import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useClients, useProjects, useProjectTypes, useUsers, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Plus, Pencil, Trash2,
  Target, ArrowUpRight
} from 'lucide-react';
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

export default function ProjectsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { data: clients } = useClients();
  const invalidate = useInvalidate();

  const { data: projects } = useProjects();
  const { data: usersData } = useUsers();
  const allUsers = Array.isArray(usersData) ? usersData : [];
  const { data: types } = useProjectTypes();

  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");
  
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  return (
    <ModuleShell
      showPanel={!!selectedProject}
      searchRow={
        <DataTableToolbar
          table={table}
          actions={
            <>
              <button className="btn-action" onClick={() => { setEditingProject(null); setIsModalOpen(true); }}>
                <Plus className="h-4 w-4 text-[var(--success)]" /> Add
              </button>
              <button
                className="btn-action"
                disabled={selectedRows.length !== 1}
                onClick={() => { const p = selectedRows[0].original; setEditingProject(p); setIsModalOpen(true); }}
              >
                <Pencil className="h-4 w-4 text-[var(--info)]" /> Edit
              </button>
              <button className="btn-action" disabled={selectedRows.length === 0} onClick={() => setDeleteId(selectedRows[0].original.id)}>
                <Trash2 className="h-4 w-4 text-[var(--danger)]" /> Delete
              </button>
            </>
          }
        />
      }
      intelligencePanel={
          <ModuleIntelligencePanel
            title="Project Intelligence"
            onClose={() => setRowSelection({})}
            hasSelection={!!selectedProject}
          >
            {selectedProject && (<>
            <div className="bg-[var(--shell-hover)] border border-[var(--shell-border)] rounded-xl p-4 space-y-2.5">
               <div className="flex items-center justify-between">
                 <div>
                   <h4 className="font-extrabold text-[15px] text-black dark:text-white leading-tight">{selectedProject.name}</h4>
                   <p className="text-[11px] font-bold text-[var(--shell-text-muted)] mt-0.5">{selectedProject.code || 'Code Pending'}</p>
                 </div>
                 <span className="p-2 bg-[var(--shell-accent)]/20 rounded text-[var(--success)]">
                   <Target className="h-5 w-5" />
                 </span>
               </div>
            </div>

            <div className="bg-[var(--shell-hover)] border border-[var(--shell-border)] rounded-xl p-4 space-y-3">
               <h4 className="text-[11px] font-bold text-black dark:text-white">Project Team</h4>
               <div className="space-y-2">
                 {((selectedProject as any).lead ? [{ name: (selectedProject as any).lead as string, role: 'Project Lead' }] : []).map((member, i) => {
                   const p = member.name.trim().split(/\s+/);
                   const ini = p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0].slice(0, 2).toUpperCase();
                   return (
                   <div key={i} className="flex items-center justify-between group cursor-pointer hover:bg-[var(--shell-hover)] p-1.5 -mx-1.5 rounded transition-colors">
                     <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-[var(--shell-hover)] flex items-center justify-center font-black text-xs text-[var(--shell-accent)] border border-[var(--shell-border)]">
                         {ini}
                       </div>
                       <div>
                         <p className="text-[11px] font-extrabold text-black dark:text-white">{member.name}</p>
                         <p className="text-[11px] font-bold text-[var(--shell-text-muted)]">{member.role}</p>
                       </div>
                     </div>
                     <ArrowUpRight className="h-3.5 w-3.5 text-[var(--shell-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                 ); })}
                 {!(selectedProject as any).lead && (
                   <p className="text-[11px] text-[var(--shell-text-muted)] font-medium">No lead assigned.</p>
                 )}
               </div>
               <Button variant="outline" className="w-full h-8 border-dashed border-[var(--shell-border)] text-[11px] font-bold text-[var(--shell-text-muted)] hover:text-[var(--shell-text-muted)] hover:border-[var(--shell-border)] transition-colors mt-1">
                 + Manage Resources
               </Button>
            </div>
            </>)}
          </ModuleIntelligencePanel>
      }
    >
      <DataTable
        columns={columns}
        data={projects || []}
        tableInstance={table}
        emptyMessage="No projects found. Click Add to create one."
      />

      <ProjectModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveProject}
        onSaveType={handleSaveType}
        editing={editingProject}
        clients={clients || []}
        projectTypes={types || []}
        users={allUsers}
      />

      {/* Simplified Delete Confirm */}
      {deleteId && (
        <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <DialogContent 
            className="sm:max-w-[450px] p-0 overflow-hidden border-[var(--shell-border)] flex flex-col"
            showCloseButton={false}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--shell-border)] bg-[var(--shell-surface)]">
              <h3 className="text-sm font-black text-[var(--danger)]">Delete Project</h3>
            </div>
            <p className="text-xs text-[var(--shell-text-muted)] p-4">
              Are you sure you want to delete this project? This action cannot be undone.
            </p>
            <div className="flex items-center gap-3 mt-6 p-4 pt-0">
              <Button variant="outline" className="flex-1 text-[11px] font-bold border-[var(--shell-border)] text-[var(--shell-text-muted)]" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1 text-[11px] font-bold" onClick={handleDelete}>Delete</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ModuleShell>
  );
}
