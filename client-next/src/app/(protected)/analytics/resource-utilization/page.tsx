'use client';

import { useEffect, useState, useMemo } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { ModuleShell } from '@/components/shared/module/module-shell';
import { ModuleIntelligencePanel } from '@/components/shared/module/module-intelligence-panel';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  BarChart3, 
  Users, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Search,
  Filter,
  Download,
  MoreVertical,
  Briefcase,
  PieChart,
  Calendar,
  History,
  Check,
  ChevronRight
} from 'lucide-react';

interface Resource {
  id: string;
  name: string;
  role: string;
  department: string;
  primaryProject: string;
  allocated: number;
  status: 'Overloaded' | 'Optimal' | 'Under-utilized';
  avatar?: string;
}

const RESOURCES: Resource[] = [
  { id: '1', name: 'Jane Cooper', role: 'UI/UX Designer', department: 'Design', primaryProject: 'Project Alpha', allocated: 95, status: 'Optimal' },
  { id: '2', name: 'Cameron Williamson', role: 'Full Stack Developer', department: 'Engineering', primaryProject: 'Internal Tools', allocated: 110, status: 'Overloaded' },
  { id: '3', name: 'Brooklyn Simmons', role: 'Product Manager', department: 'Product', primaryProject: 'Client Beta', allocated: 60, status: 'Under-utilized' },
  { id: '4', name: 'Leslie Alexander', role: 'QA Engineer', department: 'Engineering', primaryProject: 'Project Alpha', allocated: 100, status: 'Optimal' },
  { id: '5', name: 'Guy Hawkins', role: 'Frontend Dev', department: 'Engineering', primaryProject: 'Internal Tools', allocated: 105, status: 'Overloaded' },
  { id: '6', name: 'Robert Fox', role: 'Backend Dev', department: 'Engineering', primaryProject: 'Database Mig', allocated: 85, status: 'Optimal' },
];

export default function ResourceUtilizationPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    setHeader('Resource Utilization', 'Overall Efficiency: 84.2%');
  }, [setHeader]);

  const selectedResource = useMemo(() => 
    RESOURCES.find(r => r.id === selectedId),
    [selectedId]
  );

  const filteredResources = useMemo(() => 
    RESOURCES.filter(r => 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      r.department.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [searchTerm]
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Overloaded': return 'text-red-600 bg-red-50 border-red-100';
      case 'Optimal': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      case 'Under-utilized': return 'text-amber-600 bg-amber-50 border-amber-100';
      default: return 'text-gray-600 bg-gray-50 border-gray-100';
    }
  };

  return (
    <ModuleShell
      showPanel={!!selectedResource}
      actionsRow={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
             <div className="bg-white rounded-xl border border-gray-100 p-2 py-1.5 flex items-center gap-3 shadow-sm min-w-max">
                <div className="bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
                   <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Avg Utilization</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-charcoal">84.2%</span>
                    <span className="text-[9px] font-bold text-emerald-500">+2.4%</span>
                  </div>
                </div>
             </div>
             <div className="bg-white rounded-xl border border-gray-100 p-2 py-1.5 flex items-center gap-3 shadow-sm min-w-max">
                <div className="bg-blue-50 p-1.5 rounded-lg border border-blue-100">
                   <Clock className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Billable Hours</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-charcoal">14,250h</span>
                    <span className="text-[9px] font-bold text-emerald-500">+5%</span>
                  </div>
                </div>
             </div>
             <div className="bg-white rounded-xl border border-gray-100 p-2 py-1.5 flex items-center gap-3 shadow-sm min-w-max">
                <div className="bg-red-50 p-1.5 rounded-lg border border-red-100">
                   <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Overloaded</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-charcoal">5 Members</span>
                    <span className="text-[9px] font-bold text-red-500">-2</span>
                  </div>
                </div>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 bg-white hover:bg-gray-50 text-charcoal px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-200 shadow-sm transition-all whitespace-nowrap">
              <Download className="h-4 w-4 text-gray-400" /> Export PDF
            </button>
            <button className="flex items-center gap-2 bg-[#446b73] hover:bg-[#385a61] text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md transition-all whitespace-nowrap">
              <Calendar className="h-4 w-4" /> Capacity Planning
            </button>
          </div>
        </div>
      }
      searchRow={
        <div className="flex items-center gap-4 w-full bg-white/40 backdrop-blur-md p-3 rounded-xl border border-white/40 shadow-sm">
          <div className="flex-1 relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4 group-focus-within:text-juniper transition-colors" />
            <input 
              className="w-full bg-white/50 border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-[12px] text-charcoal focus:ring-1 focus:ring-mystic focus:border-mystic outline-none placeholder:text-gray-400 transition-all font-medium" 
              placeholder="Search resource or department..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
             <button className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-charcoal hover:bg-gray-50 transition-colors">
               <Filter className="h-4 w-4 text-gray-400" /> Filters
             </button>
             <select className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-charcoal outline-none">
               <option>Period: Q1 2024</option>
               <option>Period: Q2 2024</option>
             </select>
          </div>
        </div>
      }
      intelligencePanel={
        selectedResource && (
          <ModuleIntelligencePanel
            title="Capacity Analytics"
            icon={<Users className="h-3 w-3" />}
            onClose={() => setSelectedId(null)}
          >
            <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="text-center">
                <div className="relative inline-block mb-3">
                  <div className="h-20 w-20 rounded-2xl border-2 border-juniper/20 p-1 bg-white flex items-center justify-center shadow-lg">
                    <div className="h-full w-full bg-slate-50 flex items-center justify-center font-bold text-gray-400 text-xl uppercase rounded-xl">
                      {selectedResource.name.substring(0, 2)}
                    </div>
                  </div>
                  <div className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-lg border-2 border-white flex items-center justify-center shadow-md ${selectedResource.status === 'Overloaded' ? 'bg-red-500' : 'bg-emerald-500'}`}>
                    <Users className="h-3.5 w-3.5 text-white" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-charcoal leading-none">{selectedResource.name}</h3>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1.5">{selectedResource.role}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
                  <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1">Utilization</p>
                  <p className={`text-xl font-black ${selectedResource.allocated > 100 ? 'text-red-600' : 'text-juniper'}`}>{selectedResource.allocated}%</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
                  <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest mb-1">Status</p>
                  <p className={`text-[10px] font-black uppercase ${selectedResource.status === 'Overloaded' ? 'text-red-600' : 'text-emerald-600'}`}>{selectedResource.status}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-casper/10 pb-2">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Project Allocation</h4>
                </div>
                <div className="space-y-3">
                   <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                         <span className="text-[11px] font-bold text-charcoal">{selectedResource.primaryProject}</span>
                         <span className="text-[10px] font-black text-juniper">85%</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                         <div className="h-full bg-juniper rounded-full w-[85%]"></div>
                      </div>
                   </div>
                   <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                         <span className="text-[11px] font-bold text-charcoal">Operational Support</span>
                         <span className="text-[10px] font-black text-casper">15%</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                         <div className="h-full bg-casper rounded-full w-[15%]"></div>
                      </div>
                   </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-casper/10 pb-2">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Workload Trend</h4>
                </div>
                <div className="flex items-end justify-between h-20 gap-1 px-2 pt-2">
                   {[40, 65, 85, 110, 95, 80].map((h, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                         <div 
                           className={`w-full rounded-t-md transition-all duration-500 ${h > 100 ? 'bg-red-400' : 'bg-juniper/40'}`} 
                           style={{ height: `${h}%` }}
                         ></div>
                         <span className="text-[8px] font-bold text-gray-400 uppercase">{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'][i]}</span>
                      </div>
                   ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <button className="w-full bg-charcoal hover:bg-black text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-charcoal/20 flex items-center justify-center gap-2">
                   <Calendar className="h-4 w-4" /> Re-allocate Resource
                </button>
              </div>
            </div>
          </ModuleIntelligencePanel>
        )
      }
    >
      <div className="flex-1 overflow-auto custom-scrollbar">
        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 pb-0">
           <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h4 className="text-sm font-black text-charcoal">Utilization by Department</h4>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Resource Allocation Overview</p>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                       <div className="h-2 w-2 rounded-full bg-juniper"></div>
                       <span className="text-[10px] font-bold text-gray-500">Billable</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="h-2 w-2 rounded-full bg-casper"></div>
                       <span className="text-[10px] font-bold text-gray-500">Bench</span>
                    </div>
                 </div>
              </div>
              
              <div className="space-y-6">
                 {[
                   { dept: 'Engineering', total: 92, billable: 88 },
                   { dept: 'Design', total: 85, billable: 75 },
                   { dept: 'Marketing', total: 72, billable: 65 },
                   { dept: 'Sales', total: 95, billable: 92 },
                 ].map((d, i) => (
                   <div key={i} className="space-y-2">
                      <div className="flex justify-between items-center">
                         <span className="text-xs font-bold text-charcoal">{d.dept}</span>
                         <span className="text-[10px] font-black text-charcoal">{d.total}%</span>
                      </div>
                      <div className="h-2.5 w-full bg-gray-50 rounded-full overflow-hidden flex shadow-inner border border-gray-100">
                         <div className="h-full bg-juniper" style={{ width: `${d.billable}%` }}></div>
                         <div className="h-full bg-casper/30" style={{ width: `${d.total - d.billable}%` }}></div>
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col items-center justify-center text-center">
               <h4 className="text-sm font-black text-charcoal mb-1">Billable Ratio</h4>
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-8">Workload Distribution</p>
               
               <div className="relative h-40 w-40 flex items-center justify-center mb-6">
                  {/* CSS Conic Gradient Donut Chart */}
                  <div className="h-full w-full rounded-full border-[12px] border-emerald-50 shadow-inner" 
                       style={{ background: 'conic-gradient(#5ea3b3 0% 75%, #ced4da 75% 100%)' }}>
                  </div>
                  <div className="absolute inset-[12px] bg-white rounded-full flex flex-col items-center justify-center shadow-lg">
                     <span className="text-2xl font-black text-charcoal">75%</span>
                     <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Billable</span>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 w-full pt-4 border-t border-gray-50">
                  <div>
                    <p className="text-[18px] font-black text-juniper">10.5k</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Hours</p>
                  </div>
                  <div>
                    <p className="text-[18px] font-black text-charcoal">3.2k</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase">Non-Billable</p>
                  </div>
               </div>
           </div>
        </div>

        {/* Resource Table Section */}
        <div className="p-6">
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
               <h4 className="text-sm font-black text-charcoal">Resource Summary List</h4>
               <button className="text-[10px] font-bold text-juniper hover:underline uppercase tracking-widest">View Detailed Log</button>
            </div>
            <table className="w-full text-left border-collapse text-[12px]">
              <thead className="bg-[#fcfdff] text-casper font-bold uppercase tracking-wider border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 w-10"><Checkbox className="size-3" /></th>
                  <th className="px-4 py-4">Resource</th>
                  <th className="px-4 py-4">Department</th>
                  <th className="px-4 py-4">Primary Project</th>
                  <th className="px-4 py-4">Allocated</th>
                  <th className="px-6 py-4 text-right">Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredResources.map((r) => {
                  const isSelected = selectedId === r.id;
                  return (
                    <tr 
                      key={r.id} 
                      onClick={() => setSelectedId(r.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-mystic/5' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-6 py-4"><Checkbox checked={isSelected} className="size-3 data-[state=checked]:bg-juniper" /></td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-xl flex items-center justify-center text-[11px] font-bold uppercase shrink-0 ${isSelected ? 'bg-juniper text-white' : 'bg-gray-100 text-casper'}`}>
                            {r.name.substring(0, 2)}
                          </div>
                          <div>
                             <p className="font-bold text-charcoal">{r.name}</p>
                             <p className="text-[10px] text-gray-400">{r.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-bold text-charcoal/80">{r.department}</td>
                      <td className="px-4 py-4 font-medium text-gray-500">{r.primaryProject}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                           <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase ${getStatusColor(r.status)}`}>
                             {r.allocated}%
                           </div>
                           <span className="text-[10px] font-bold text-gray-400 capitalize">{r.status}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <div className="flex items-center justify-end gap-1">
                            <span className="text-xs font-black text-charcoal">98.2</span>
                            <ChevronRight className="h-4 w-4 text-gray-300" />
                         </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ModuleShell>
  );
}
