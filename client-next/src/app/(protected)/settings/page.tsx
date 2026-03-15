'use client';

import { useEffect } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAuditLogs, useRoles } from '@/hooks/use-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function SettingsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    setHeader('Settings', 'Manage your account');
  }, [setHeader]);

  const { data: auditLogs } = useAuditLogs();

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden flex-col gap-6 bg-theme-bg p-6">
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          {user?.role === 'admin' && <TabsTrigger value="audit">Audit Log</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Profile Information</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={user?.username || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={user?.role_name || user?.role || ''} disabled />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <Card>
            <CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input value={user?.currency || 'INR'} disabled />
              </div>
              <p className="text-sm text-muted-foreground">Contact your administrator to change preferences.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {user?.role === 'admin' && (
          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Audit Log</CardTitle></CardHeader>
              <CardContent>
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
                    {(auditLogs || []).slice(0, 50).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.action}</TableCell>
                        <TableCell>{log.table_name}</TableCell>
                        <TableCell>{log.record_id}</TableCell>
                        <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {(!auditLogs || auditLogs.length === 0) && (
                  <p className="py-6 text-center text-muted-foreground">No audit entries yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
