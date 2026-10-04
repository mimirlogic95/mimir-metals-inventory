import { useMutation, useQuery } from '@tanstack/react-query';

import {
  createPallet,
  getActiveParts,
  getPackingSpec,
} from '@/features/create-pallet/createPallet.api';

export function useActiveParts() {
  return useQuery({
    queryKey: ['parts', 'active'],
    queryFn: getActiveParts,
  });
}

export function usePackingSpec(partId: string | null) {
  return useQuery({
    queryKey: ['packing-spec', partId],
    queryFn: () => getPackingSpec(partId as string),
    enabled: partId !== null,
  });
}

export function useCreatePalletMutation() {
  return useMutation({ mutationFn: createPallet });
}
