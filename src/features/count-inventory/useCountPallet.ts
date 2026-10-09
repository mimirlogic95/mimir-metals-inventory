import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  countPallet,
  getPalletForCount,
} from '@/features/count-inventory/countPallet.api';

export function usePalletForCount(code: string | null) {
  return useQuery({
    queryKey: ['count-pallet', code],
    queryFn: () => getPalletForCount(code as string),
    enabled: code !== null,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

export function useCountPalletMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: countPallet,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['count-pallet'] });
      void client.invalidateQueries({ queryKey: ['find-inventory'] });
      void client.invalidateQueries({ queryKey: ['pull-boxes'] });
      void client.invalidateQueries({ queryKey: ['move-pallet'] });
      void client.invalidateQueries({ queryKey: ['adjustment-requests'] });
    },
  });
}
