import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  decideAdjustment,
  getAdjustmentRequest,
  getPendingAdjustments,
  requireSupervisor,
} from '@/features/adjustments/adjustments.api';

const freshReads = {
  retry: false,
  staleTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: 'always' as const,
};

export function useSupervisor() {
  return useQuery({
    queryKey: ['adjustments-supervisor'],
    queryFn: requireSupervisor,
    ...freshReads,
  });
}

export function usePendingAdjustments(enabled: boolean) {
  return useQuery({
    queryKey: ['adjustment-requests', 'pending'],
    queryFn: getPendingAdjustments,
    enabled,
    ...freshReads,
  });
}

export function useAdjustmentRequest(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['adjustment-requests', 'detail', id],
    queryFn: () => getAdjustmentRequest(id as string),
    enabled: enabled && Boolean(id),
    ...freshReads,
  });
}

export function useAdjustmentDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: decideAdjustment,
    onSuccess: () => {
      for (const key of [
        'adjustment-requests',
        'find-inventory',
        'count-pallet',
        'pull-boxes',
        'move-pallet',
        'store-pallet',
      ]) {
        void client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
