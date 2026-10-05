import { useQuery } from '@tanstack/react-query';

import {
  getFindInventory,
  getFindParts,
} from '@/features/find-inventory/findInventory.api';

export function useFindParts() {
  return useQuery({
    queryKey: ['find-inventory', 'parts'],
    queryFn: getFindParts,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

export function useFindInventory(partId: string | null) {
  return useQuery({
    queryKey: ['find-inventory', 'part', partId],
    queryFn: () => getFindInventory(partId as string),
    enabled: partId !== null,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}
