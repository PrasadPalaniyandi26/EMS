'use client';

import { useEffect, useState } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAuditLogs } from '@/hooks/use-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { User, Lock, SlidersHorizontal, ClipboardList } from 'lucide-react';
import api from '@/lib/api-client';
import { toast } from 'sonner';

const INP = 'h-8 text-[12.5px]';
const LBL = 'text-[11.5px] font-medium';

export default function SettingsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const { user, updateUser } = useAuthStore();

  useEffect(() => {
    setHeader('Settings', 'Manage your account');
  }, [setHeader]);

  // Split username into first/last
  const nameParts = (user?.username || '').trim().split(/\s+/);
  const [firstName, setFirstName] = useState(nameParts[0] || '');
  const [lastName, setLastName] = useState(nameParts.slice(1).join(' ') || '');
  const [loginName, setLoginName] = useState((user as any)?.login_name || '');
  const [loginNameError, setLoginNameError] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.contact_no || '');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const [activeTab, setActiveTab] = useState('profile');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [auditPage, setAuditPage] = useState(0);
  const AUDIT_PAGE_SIZE = 50;
  const { data: auditLogsData, isLoading: auditLoading } = useAuditLogs({ page: String(auditPage + 1), limit: String(AUDIT_PAGE_SIZE) });
  const auditLogs = auditLogsData?.rows ?? [];
  const auditTotal = auditLogsData?.total ?? 0;

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const validatePhone = (v: string) => !v || /^\+?[0-9\s\-().]{7,20}$/.test(v);

  const handleSaveProfile = async () => {
    if (!firstName.trim()) { toast.error('First Name is required.'); return; }
    if (!validateEmail(email)) { setEmailError('Invalid email address.'); return; }
    if (!validatePhone(phone)) { setPhoneError('Invalid phone number.'); return; }
    if (loginName && !/^[a-z0-9]+$/.test(loginName)) { setLoginNameError('Only lowercase letters and numbers allowed.'); return; }

    setProfileSaving(true);
    try {
      // Update name, phone and login_name via self-profile endpoint
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      const profilePayload: any = { contact_no: phone || null };
      if (fullName) profilePayload.username = fullName;
      if (loginName) profilePayload.login_name = loginName.toLowerCase();
      const pRes = await api.put('/users/me/profile', profilePayload);
      const updated = (pRes as any).data;
      updateUser({
        contact_no: updated?.contact_no ?? (phone || null),
        login_name: updated?.login_name ?? (loginName || null),
        username: updated?.username ?? user?.username,
      } as any);

      // Update email separately if changed
      if (email !== user?.email) {
        const eRes = await api.put(`/users/${user!.id}/email`, { email });
        updateUser({ email: (eRes as any).data?.email ?? email });
      }

      toast.success('Profile updated.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) { toast.error('Current password is required.'); return; }
    if (!newPassword) { toast.error('New password is required.'); return; }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match.'); return; }

    setPasswordSaving(true);
    try {
      await api.put('/users/me/profile', { password: newPassword, currentPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to change password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const isAdmin = user?.roles?.some((r) => r.role_name === 'ADMIN');

  const TABS = [
    { id: 'profile',     label: 'Profile',      icon: User },
    { id: 'security',    label: 'Security',     icon: Lock },
    { id: 'preferences', label: 'Preferences',  icon: SlidersHorizontal },
    ...(isAdmin ? [{ id: 'audit', label: 'Audit Log', icon: ClipboardList }] : []),
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden flex-col" style={{ background: 'var(--shell-bg)' }}>

      {/* ── Tab bar ── */}
      <div className="px-4 flex items-end gap-0 shrink-0" style={{ borderBottom: '1px solid var(--shell-border)' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-all ${
                active
                  ? 'text-black dark:text-white'
                  : 'text-[var(--shell-text-muted)] hover:text-[var(--shell-text)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full" style={{ background: 'var(--shell-accent)' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* Profile */}
        {activeTab === 'profile' && (
          <Card>
            <CardHeader><CardTitle className="text-[14px]">Profile Information</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={LBL}>First Name</Label>
                  <Input className={INP} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className={LBL}>Last Name</Label>
                  <Input className={INP} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className={LBL}>Username <span className="text-[11px] text-muted-foreground font-normal">(used to login)</span></Label>
                <Input
                  className={INP}
                  placeholder="e.g. johnp"
                  value={loginName}
                  onChange={(e) => { setLoginName(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '')); setLoginNameError(''); }}
                />
                {loginNameError && <p className="text-[11px] text-[var(--danger)]">{loginNameError}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className={LBL}>Email</Label>
                <Input
                  className={INP}
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                  onBlur={(e) => { if (e.target.value && !validateEmail(e.target.value)) setEmailError('Invalid email address.'); }}
                />
                {emailError && <p className="text-[11px] text-[var(--danger)]">{emailError}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className={LBL}>Phone</Label>
                <Input
                  className={INP}
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
                  onBlur={(e) => { if (e.target.value && !validatePhone(e.target.value)) setPhoneError('Invalid phone number.'); }}
                />
                {phoneError && <p className="text-[11px] text-[var(--danger)]">{phoneError}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className={LBL}>Role</Label>
                <Input className={INP} value={user?.role_name || user?.role || ''} disabled />
              </div>

              <Button size="sm" className="text-[12px] h-8" onClick={handleSaveProfile} disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Security */}
        {activeTab === 'security' && (
          <Card>
            <CardHeader><CardTitle className="text-[14px]">Change Password</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-1.5">
                <Label className={LBL}>Current Password</Label>
                <Input className={INP} type="password" placeholder="Enter current password"
                  value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className={LBL}>New Password</Label>
                <Input className={INP} type="password" placeholder="Min. 6 characters"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className={LBL}>Confirm Password</Label>
                <Input className={INP} type="password" placeholder="Repeat new password"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <Button size="sm" className="text-[12px] h-8" onClick={handleChangePassword} disabled={passwordSaving}>
                {passwordSaving ? 'Saving…' : 'Update Password'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Preferences */}
        {activeTab === 'preferences' && (
          <Card>
            <CardHeader><CardTitle className="text-[14px]">Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-1.5">
                <Label className={LBL}>Currency</Label>
                <Input className={INP} value={user?.currency || 'INR'} disabled />
              </div>
              <p className="text-[11.5px] text-muted-foreground">Contact your administrator to change preferences.</p>
            </CardContent>
          </Card>
        )}

        {/* Audit Log — Admin only */}
        {activeTab === 'audit' && isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-[14px]">Audit Log</CardTitle>
              <span className="text-[11px] text-muted-foreground">{auditTotal} entries</span>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-9 rounded animate-pulse bg-[var(--shell-hover)]" />
                  ))}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead>Record ID</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log: any) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">{log.action}</TableCell>
                          <TableCell>{log.table_name}</TableCell>
                          <TableCell>{log.record_id}</TableCell>
                          <TableCell>{new Date(log.changed_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {auditLogs.length === 0 && (
                    <p className="py-6 text-center text-muted-foreground">No audit entries yet.</p>
                  )}
                  {auditTotal > AUDIT_PAGE_SIZE && (
                    <div className="flex items-center justify-between pt-3 border-t border-[var(--shell-border)] mt-2">
                      <span className="text-[11px] text-muted-foreground">
                        Showing {auditPage * AUDIT_PAGE_SIZE + 1}–{Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, auditTotal)} of {auditTotal}
                      </span>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={auditPage === 0} onClick={() => setAuditPage(p => p - 1)}>Previous</Button>
                        <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= auditTotal} onClick={() => setAuditPage(p => p + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
