import { z } from 'zod';

import { getFindInventory } from '@/features/find-inventory/findInventory.api';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

const palletSchema = z.object({
  id: z.string().uuid(),
  pallet_code: z.string(),
  part_id: z.string().uuid(),
  current_boxes: z.number().int().nonnegative(),
  current_pieces: z.number().int().nonnegative(),
  pieces_per_box_snapshot: z.number().int().positive(),
  boxes_per_full_pallet_snapshot: z.number().int().positive(),
  lifecycle_status: z.enum([
    'created',
    'stored',
    'shipping_staging',
    'on_hold',
    'shipped',
  ]),
  part: z.object({ part_number: z.string(), description: z.string() }),
  location: z
    .object({ location_code: z.string(), location_type: z.string() })
    .nullable(),
});

const pullResultSchema = z.object({
  pallet_id: z.string().uuid(),
  pallet_code: z.string(),
  part_number: z.string(),
  description: z.string(),
  location_code: z.string(),
  previous_boxes: z.number().int().positive(),
  boxes_removed: z.number().int().positive(),
  current_boxes: z.number().int().positive(),
  previous_pieces: z.number().int().positive(),
  pieces_removed: z.number().int().positive(),
  current_pieces: z.number().int().positive(),
  transaction_id: z.string().uuid(),
  pulled_at: z.string(),
});

export type PullPallet = z.infer<typeof palletSchema>;
export type PullResult = z.infer<typeof pullResultSchema>;
export type PullContext = {
  pallet: PullPallet;
  fifo: {
    isFirst: boolean;
    oldestPalletCode: string;
    oldestLocationCode: string;
  } | null;
};
export type PullRequest = {
  palletCode: string;
  boxesToPull: number;
  expectedCurrentBoxes: number;
  expectedCurrentPieces: number;
  poReference: string | null;
  bolReference: string | null;
  idempotencyKey: string;
};

const rpcErrors: Record<string, string> = {
  'PALLET NOT FOUND': 'PALLET_NOT_FOUND',
  'PALLET ON HOLD': 'PALLET_ON_HOLD',
  'PALLET SHIPPED': 'PALLET_SHIPPED',
  'PALLET NOT READY TO PULL': 'PALLET_NOT_READY_TO_PULL',
  'NO INVENTORY': 'NO_INVENTORY',
  'INVALID PULL QUANTITY': 'INVALID_PULL_QUANTITY',
  'TOO MANY BOXES': 'TOO_MANY_BOXES',
  'WHOLE PALLET USE SHIPPING': 'WHOLE_PALLET_USE_SHIPPING',
  'INVENTORY CHANGED': 'INVENTORY_CHANGED',
  'IDEMPOTENCY KEY CONFLICT': 'IDEMPOTENCY_KEY_CONFLICT',
  'REFERENCE TOO LONG': 'REFERENCE_TOO_LONG',
};

export async function getPullContext(code: string): Promise<PullContext> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('pallets')
    .select(
      'id, pallet_code, part_id, current_boxes, current_pieces, pieces_per_box_snapshot, boxes_per_full_pallet_snapshot, lifecycle_status, part:parts!pallets_part_id_fkey(part_number, description), location:locations!pallets_current_location_id_fkey(location_code, location_type)',
    )
    .eq('pallet_code', code)
    .maybeSingle();

  if (error) throw new Error('PALLET_LOOKUP_FAILED', { cause: error });
  if (!data) throw new Error('PALLET_NOT_FOUND');
  const pallet = palletSchema.parse(data);
  const { pallets } = await getFindInventory(pallet.part_id);
  const oldest = pallets[0];
  return {
    pallet,
    fifo: oldest
      ? {
          isFirst: oldest.id === pallet.id,
          oldestPalletCode: oldest.pallet_code,
          oldestLocationCode: oldest.location.location_code,
        }
      : null,
  };
}

export async function pullBoxes(request: PullRequest): Promise<PullResult> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .rpc('pull_boxes', {
      p_pallet_code: request.palletCode,
      p_boxes_to_pull: request.boxesToPull,
      p_expected_current_boxes: request.expectedCurrentBoxes,
      p_expected_current_pieces: request.expectedCurrentPieces,
      p_idempotency_key: request.idempotencyKey,
      ...(request.poReference !== null && {
        p_po_reference: request.poReference,
      }),
      ...(request.bolReference !== null && {
        p_bol_reference: request.bolReference,
      }),
    })
    .single();

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Pull Boxes RPC failed.', { code: error.code });
    }
    throw new Error(rpcErrors[error.message] ?? 'PULL_FAILED', {
      cause: error,
    });
  }

  return pullResultSchema.parse(data);
}
