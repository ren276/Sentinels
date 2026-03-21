'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

const queryClientOptions = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      retryDelay: 1_000,
    },
  },
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient(queryClientOptions))
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
