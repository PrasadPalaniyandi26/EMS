'use client';
import { useEffect } from 'react';
import { useHeaderStore } from '@/stores/header-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function ReportingPage() {
  const setHeader = useHeaderStore((s) => s.setHeader);
  useEffect(() => { setHeader('Reporting', 'Financial reports & analytics'); }, [setHeader]);

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden flex-col gap-6 bg-theme-bg p-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Reports</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Advanced reporting with export to PDF/Excel coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
