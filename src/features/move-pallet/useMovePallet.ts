import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getMoveRack,
  getPalletForMove,
  movePallet,
} from '@/features/move-pallet/movePallet.api';

export function usePalletForMove(code: string | null) {
  return useQuery({
    queryKey: ['move-pallet', 'pallet', code],
    queryFn: () => getPalletForMove(code as string),
    enabled: code !== null,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

export function useMoveRack(code: string | null) {
  return useQuery({
    queryKey: ['move-pallet', 'rack', code],
    queryFn: () => getMoveRack(code as string),
    enabled: code !== null,
    retry: false,
    staleTime: 0,
  });
}

export function useMovePalletMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: movePallet,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['move-pallet'] });
      void queryClient.invalidateQueries({ queryKey: ['find-inventory'] });
      void queryClient.invalidateQueries({ queryKey: ['pull-boxes'] });
      void queryClient.invalidateQueries({ queryKey: ['store-location'] });
    },
  });
}
