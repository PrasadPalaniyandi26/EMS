'use client';
import { useEffect } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell } from 'lucide-react';

export default function NotificationsPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  useEffect(() => { setHeader('Notifications', 'Stay updated'); }, [setHeader]);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden flex-col gap-6 bg-theme-bg p-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Notifications</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No notifications at this time.</p>
        </CardContent>
      </Card>
    </div>
  );
}
