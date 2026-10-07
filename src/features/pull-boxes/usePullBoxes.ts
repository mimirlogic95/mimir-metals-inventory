import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getPullContext, pullBoxes } from '@/features/pull-boxes/pullBoxes.api';

export function usePullContext(code: string | null) {
  return useQuery({
    queryKey: ['pull-boxes', 'pallet', code],
    queryFn: () => getPullContext(code as string),
    enabled: code !== null,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
}

export function usePullBoxesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: pullBoxes,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pull-boxes'] });
      void queryClient.invalidateQueries({ queryKey: ['find-inventory'] });
    },
  });
}
