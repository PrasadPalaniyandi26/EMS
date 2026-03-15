'use client';
import { useEffect } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Network } from 'lucide-react';

export default function HubPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  useEffect(() => { setHeader('Hub', 'Integration hub'); }, [setHeader]);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden flex-col gap-6 bg-theme-bg p-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Network className="h-5 w-5" /> Hub</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Integrations and API connections coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
