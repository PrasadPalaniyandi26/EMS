'use client';

import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { Menu, Bell, Mail, Settings, User, LogOut, UserCircle, RefreshCw, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';

export function TopBar() {
  const { title } = useHeaderStore();
  const { user, logout, switchRole } = useAuthStore();

  const handleSwitchRole = async (roleId: number) => {
    try {
      await switchRole(roleId);
      toast.success('Role switched successfully.');
    } catch {
      toast.error('Failed to switch role.');
    }
  };

  return (
    <header className="fixed-top shadow-md">
      <div className="flex items-center">
        <button className="text-white hover:bg-white/10 p-2 rounded-lg transition-colors mr-3">
          <Menu className="h-[22px] w-[22px]" />
        </button>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-pure-white">
          {title || 'Management System'}
        </h2>
      </div>
      <div className="flex items-center gap-5">
        <button className="text-pure-white hover:opacity-80 transition-opacity">
          <Bell className="h-[20px] w-[20px]" />
        </button>
        <button className="text-pure-white hover:opacity-80 transition-opacity">
          <Mail className="h-[20px] w-[20px]" />
        </button>
        <button className="text-pure-white hover:opacity-80 transition-opacity">
          <Settings className="h-[20px] w-[20px]" />
        </button>
        <div className="h-5 w-[1px] bg-white/20 mx-1"></div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 cursor-pointer group hover:opacity-90 transition-opacity bg-transparent border-none outline-none focus:outline-none focus-visible:ring-0">
              <div className="text-right hidden sm:block">
                <p className="text-[11px] font-bold text-pure-white leading-none">
                  {user?.username || 'Admin'}
                </p>
                <p className="text-[9px] text-pure-white/70 uppercase font-medium mt-0.5">
                  {user?.id ? `NT${10000 + user.id}` : ''}{user?.id && (user?.role_name || user?.role) ? ' · ' : ''}{user?.role_name || user?.role || 'System Admin'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/40 overflow-hidden group-hover:bg-white/30 transition-colors">
                <User className="h-[18px] w-[18px] text-pure-white" />
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mt-2 glass-panel border-casper/50">
            <DropdownMenuLabel className="text-juniper font-bold text-[11px] uppercase tracking-wider">Account</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-casper/20" />
            <DropdownMenuItem className="text-charcoal hover:bg-mystic/50 cursor-pointer gap-2 py-2">
              <UserCircle className="w-4 h-4 text-juniper" />
              <span className="text-[12px] font-medium">Profile Details</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="text-charcoal hover:bg-mystic/50 cursor-pointer gap-2 py-2">
              <Settings className="w-4 h-4 text-juniper" />
              <span className="text-[12px] font-medium">My Preferences</span>
            </DropdownMenuItem>
            {user?.roles && user.roles.length > 0 && (
              <>
                <DropdownMenuSeparator className="bg-casper/20" />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-charcoal hover:bg-mystic/50 cursor-pointer gap-2 py-2">
                    <RefreshCw className="w-4 h-4 text-juniper" />
                    <span className="text-[12px] font-medium">Change Role</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="glass-panel border-casper/50 min-w-[180px]">
                    {user.roles.map((r) => (
                      <DropdownMenuItem
                        key={r.role_id}
                        className="cursor-pointer gap-2 py-2"
                        onClick={() => handleSwitchRole(r.role_id)}
                      >
                        <Check className={`w-3.5 h-3.5 ${r.role_id === user.role_id ? 'text-juniper' : 'opacity-0'}`} />
                        <span className={`text-[12px] font-medium ${r.role_id === user.role_id ? 'text-juniper font-bold' : 'text-charcoal'}`}>
                          {r.role_name}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            )}
            <DropdownMenuSeparator className="bg-casper/20" />
            <DropdownMenuItem
              className="text-red-500 hover:bg-red-50 cursor-pointer gap-2 py-2 font-bold"
              onClick={() => logout()}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-[12px] uppercase tracking-wider">Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
