import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getShippingLocations,
  getShippingPallet,
  shipPallet,
  stagePallet,
} from '@/features/shipping/shipping.api';

export function useShippingPallet(code: string | null) {
  return useQuery({
    queryKey: ['shipping', 'pallet', code],
    queryFn: () => getShippingPallet(code as string),
    enabled: code !== null,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

export function useShippingLocations() {
  return useQuery({
    queryKey: ['shipping', 'locations'],
    queryFn: getShippingLocations,
    retry: false,
    staleTime: 0,
  });
}

function invalidateShippingQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  for (const queryKey of [
    ['shipping'],
    ['find-inventory'],
    ['pull-boxes'],
    ['move-pallet'],
    ['count-pallet'],
    ['store-location'],
  ])
    void queryClient.invalidateQueries({ queryKey });
}

export function useStagePalletMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: stagePallet,
    onSuccess: () => invalidateShippingQueries(queryClient),
  });
}

export function useShipPalletMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: shipPallet,
    onSuccess: () => invalidateShippingQueries(queryClient),
  });
}
