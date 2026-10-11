import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  getHistoryPage,
  getHistoryPallet,
  type HistoryCursor,
} from '@/features/pallet-history/palletHistory.api';

export function useHistoryPallet(code: string | null) {
  return useQuery({
    queryKey: ['pallet-history', 'pallet', code],
    queryFn: () => getHistoryPallet(code as string),
    enabled: code !== null,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

export function usePalletTimeline(palletId: string | null) {
  return useInfiniteQuery({
    queryKey: ['pallet-history', 'timeline', palletId],
    queryFn: ({ pageParam }) => getHistoryPage(palletId as string, pageParam),
    initialPageParam: null as HistoryCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: palletId !== null,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}
