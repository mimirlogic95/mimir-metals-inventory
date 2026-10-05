import { useMutation, useQuery } from '@tanstack/react-query';

import {
  getPalletForStore,
  getRackLocation,
  storePallet,
} from '@/features/store-pallet/storePallet.api';

export function usePalletForStore(code: string | null) {
  return useQuery({
    queryKey: ['store-pallet', code],
    queryFn: () => getPalletForStore(code as string),
    enabled: code !== null,
    retry: false,
  });
}

export function useRackLocation(code: string | null) {
  return useQuery({
    queryKey: ['store-location', code],
    queryFn: () => getRackLocation(code as string),
    enabled: code !== null,
    retry: false,
  });
}

export function useStorePalletMutation() {
  return useMutation({ mutationFn: storePallet });
}
