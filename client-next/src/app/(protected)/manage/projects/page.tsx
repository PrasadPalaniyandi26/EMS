'use client';

import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useClients, useProjects, useProjectTypes, useUsers, useInvalidate } from '@/hooks/use-queries';
import api from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  PlusCircle, Pencil, Trash2,
  Target, CircleDollarSign, ArrowUpRight
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
  useReactTable,
  getFacetedRowModel,
  getFacetedUniqueValues,
} from "@tanstack/react-table";
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

  const table = useReactTable<Project>({
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
      toast.error(err?.response?.data?.message || 'Failed to save project');
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

  const facetedFilters = [
    {
      columnId: "client_name",
      title: "Client",
      options: Array.from(new Set((projects || []).map(p => p.client_name).filter(Boolean))).map(name => ({
        label: name!,
        value: name!,
      })),
    },
    {
      columnId: "type_name",
      title: "Type",
      options: Array.from(new Set((projects || []).map(p => p.type_name).filter(Boolean))).map(name => ({
        label: name!,
        value: name!,
      })),
    },
    {
      columnId: "status",
      title: "Status",
      options: [
        { label: "Active", value: "Active" },
        { label: "Proposed", value: "Proposed" },
        { label: "On-Hold", value: "On-Hold" },
        { label: "Completed", value: "Completed" },
        { label: "Canceled", value: "Canceled" },
      ],
    },
  ];

  return (
    <ModuleShell
      showPanel={!!selectedProject}
      actionsRow={
        <>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => { setEditingProject(null); setIsModalOpen(true); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-casper rounded-md text-[11px] font-bold text-[#121212] uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm"
            >
              <PlusCircle className="h-4 w-4 text-emerald-600" /> Add Project
            </button>
            <button
              disabled={selectedRows.length !== 1}
              onClick={() => {
                const p = selectedRows[0].original;
                setEditingProject(p);
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-casper rounded-md text-[11px] font-bold text-[#121212] uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
            >
              <Pencil className="h-4 w-4 text-blue-500" /> Edit Project
            </button>
            <button
              disabled={selectedRows.length === 0}
              onClick={() => setDeleteId(selectedRows[0].original.id)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-casper rounded-md text-[11px] font-bold text-[#121212] uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4 text-rose-500" /> Delete Project
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {projects?.length || 0} Total Projects
            </span>
          </div>
        </>
      }
      searchRow={
        <DataTableToolbar 
          table={table} 
          facetedFilters={facetedFilters}
        />
      }
      intelligencePanel={
        selectedProject && (
          <ModuleIntelligencePanel
            title="Project Intelligence"
            onClose={() => setRowSelection({})}
          >
            <div className="border border-casper/30 rounded-md p-4 space-y-4">
               <div className="flex items-center justify-between">
                 <div>
                   <h4 className="font-extrabold text-[15px] text-[#121212] leading-tight">{selectedProject.name}</h4>
                   <p className="text-[10px] font-bold text-juniper uppercase tracking-widest mt-0.5">{selectedProject.code || 'Code Pending'}</p>
                 </div>
                 <span className="p-2 bg-emerald-500/10 rounded text-emerald-600">
                   <Target className="h-5 w-5" />
                 </span>
               </div>
               <div className="grid grid-cols-2 gap-2 pt-1">
                 <div className="p-3 bg-slate-50 rounded border border-casper/20">
                   <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Health Score</p>
                   <p className="text-sm font-black text-emerald-600">Optimal</p>
                 </div>
                 <div className="p-3 bg-slate-50 rounded border border-casper/20">
                   <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Retention</p>
                   <p className="text-sm font-black text-juniper">94%</p>
                 </div>
               </div>
            </div>

            <div className="border border-casper/30 rounded-md p-4 space-y-4">
              <h4 className="text-[11px] font-bold text-[#121212] uppercase tracking-wider flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-juniper" /> Performance Metrics
              </h4>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1.5 uppercase tracking-wider">
                    <span className="text-slate-500">Budget Utilization</span>
                    <span className="text-juniper">28.4%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="w-[28%] h-full bg-juniper rounded-full"></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold mb-1.5 uppercase tracking-wider">
                    <span className="text-slate-500">Timeline Progress</span>
                    <span className="text-juniper">45.0%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="w-[45%] h-full bg-juniper/60 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-casper/30 rounded-md p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[11px] font-bold text-[#121212] uppercase tracking-wider">Burn Rate Trends</h4>
                <p className="text-[9px] font-bold text-emerald-600 uppercase">+12% Monthly</p>
              </div>
              <div className="h-24 w-full flex items-end justify-between px-1 gap-1">
                {[25, 40, 35, 60, 45, 80, 70].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${h}%` }}
                    className={`w-full rounded-t-sm ${i === 5 ? 'bg-juniper' : 'bg-casper/40'}`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-2 text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span>
              </div>
            </div>

            <div className="border border-casper/30 rounded-md p-4 space-y-3">
               <h4 className="text-[11px] font-bold text-[#121212] uppercase tracking-wider">Project Team</h4>
               <div className="space-y-2">
                 {[
                   { name: (selectedProject as any).lead || 'Sarah Jenkins', role: 'Project Director', initial: 'SJ' },
                   { name: 'Marcus Kane', role: 'Principal Architect', initial: 'MK' },
                   { name: 'Elena Ruiz', role: 'Senior Analyst', initial: 'ER' }
                 ].map((member, i) => (
                   <div key={i} className="flex items-center justify-between group cursor-pointer hover:bg-slate-50 p-1.5 -mx-1.5 rounded transition-colors">
                     <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs text-juniper border border-casper/20">
                         {member.initial}
                       </div>
                       <div>
                         <p className="text-[11px] font-extrabold text-[#121212]">{member.name}</p>
                         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{member.role}</p>
                       </div>
                     </div>
                     <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                 ))}
               </div>
               <Button variant="outline" className="w-full h-8 border-dashed border-casper text-[9px] font-bold text-slate-400 hover:text-juniper hover:border-juniper transition-colors uppercase tracking-widest mt-1">
                 + Manage Resources
               </Button>
            </div>
          </ModuleIntelligencePanel>
        )
      }
    >
      <DataTable 
        columns={columns} 
        data={projects || []} 
        tableInstance={table} 
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
            className="sm:max-w-[450px] p-0 overflow-hidden border-casper shadow-2xl flex flex-col"
            showCloseButton={false}
          >
            <div className="flex items-center justify-between p-4 border-b border-casper bg-[#F0F4F5]">
              <h3 className="text-sm font-black text-rose-600 uppercase tracking-widest">Delete Project</h3>
            </div>
            <p className="text-xs text-slate-500 p-4">
              Are you sure you want to delete this project? This action cannot be undone.
            </p>
            <div className="flex items-center gap-3 mt-6 p-4 pt-0">
              <Button variant="outline" className="flex-1 text-[11px] font-bold border-casper" onClick={() => setDeleteId(null)}>Cancel</Button>
              <Button className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold" onClick={handleDelete}>Delete</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ModuleShell>
  );
}
