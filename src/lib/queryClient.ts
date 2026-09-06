import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Online-first (ROADMAP.md's Decisions locked), not offline-first: a
      // longer staleTime plus refetchOnWindowFocus leans on this cache for
      // snappy nav between screens, while still treating the network as the
      // source of truth rather than something to avoid.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
