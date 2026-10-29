'use client';

import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // A failed first load would otherwise leave an empty screen with no explanation. Only the initial load
        // reports (a failed background refresh keeps showing the last good data), one toast per query, and
        // queries that show their own error state can opt out with meta: { silent: true }.
        queryCache: new QueryCache({
          onError: (error, query) => {
            if (query.state.data !== undefined || query.meta?.silent) return;
            if ((error as { status?: number })?.status === 401) return;
            toast.error(error instanceof Error && error.message ? error.message : 'Could not load data', { id: JSON.stringify(query.queryKey) });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,     // 5 min default — overridden per-query where needed
            gcTime: 30 * 60 * 1000,        // 30 min garbage collection
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
