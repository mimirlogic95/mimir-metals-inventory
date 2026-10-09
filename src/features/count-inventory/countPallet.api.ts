import { z } from 'zod';

import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

const lifecycle = z.enum([
  'created',
  'stored',
  'shipping_staging',
  'on_hold',
  'shipped',
]);
const palletSchema = z.object({
  id: z.string().uuid(),
  pallet_code: z.string(),
  current_location_id: z.string().uuid().nullable(),
  current_boxes: z.number().int().nonnegative(),
  current_pieces: z.number().int().nonnegative(),
  pieces_per_box_snapshot: z.number().int().positive(),
  boxes_per_full_pallet_snapshot: z.number().int().positive(),
  lifecycle_status: lifecycle,
  lifecycle_status_before_hold: lifecycle.nullable(),
  part: z.object({ part_number: z.string(), description: z.string() }),
  location: z
    .object({ location_code: z.string(), location_type: z.string() })
    .nullable(),
});

const resultSchema = z.object({
  pallet_id: z.string().uuid(),
  pallet_code: z.string(),
  part_number: z.string(),
  description: z.string(),
  location_id: z.string().uuid(),
  location_code: z.string(),
  lifecycle_status: lifecycle,
  system_boxes: z.number().int().nonnegative(),
  system_pieces: z.number().int().nonnegative(),
  counted_boxes: z.number().int().nonnegative(),
  counted_pieces: z.number().int().nonnegative(),
  box_difference: z.number().int(),
  piece_difference: z.number().int(),
  outcome: z.enum(['matched', 'discrepancy']),
  adjustment_request_id: z.string().uuid().nullable(),
  transaction_id: z.string().uuid(),
  recorded_at: z.string(),
});

export type CountPallet = z.infer<typeof palletSchema>;
export type CountResult = z.infer<typeof resultSchema>;
export type CountRequest = {
  palletCode: string;
  countedBoxes: number;
  expectedCurrentBoxes: number;
  expectedCurrentPieces: number;
  expectedCurrentLocationId: string;
  reasonCode: string | null;
  reasonNotes: string | null;
  idempotencyKey: string;
};

const rpcErrors = new Set([
  'PALLET NOT FOUND',
  'PALLET SHIPPED',
  'PALLET NOT COUNTABLE',
  'INVENTORY CHANGED',
  'ADJUSTMENT ALREADY PENDING',
  'INVALID COUNT',
  'REASON REQUIRED',
  'NOTE TOO LONG',
  'IDEMPOTENCY KEY CONFLICT',
]);

export async function getPalletForCount(code: string): Promise<CountPallet> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('pallets')
    .select(
      'id, pallet_code, current_location_id, current_boxes, current_pieces, pieces_per_box_snapshot, boxes_per_full_pallet_snapshot, lifecycle_status, lifecycle_status_before_hold, part:parts!pallets_part_id_fkey(part_number, description), location:locations!pallets_current_location_id_fkey(location_code, location_type)',
    )
    .eq('pallet_code', code)
    .maybeSingle();
  if (error) throw new Error('PALLET_LOOKUP_FAILED', { cause: error });
  if (!data) throw new Error('PALLET_NOT_FOUND');
  return palletSchema.parse(data);
}

export async function countPallet(request: CountRequest): Promise<CountResult> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .rpc('count_pallet', {
      p_pallet_code: request.palletCode,
      p_counted_boxes: request.countedBoxes,
      p_expected_current_boxes: request.expectedCurrentBoxes,
      p_expected_current_pieces: request.expectedCurrentPieces,
      p_expected_current_location_id: request.expectedCurrentLocationId,
      p_reason_code: request.reasonCode ?? '',
      p_reason_notes: request.reasonNotes ?? '',
      p_idempotency_key: request.idempotencyKey,
    })
    .single();
  if (error) {
    if (import.meta.env.DEV)
      console.error('Count RPC failed.', { code: error.code });
    throw new Error(
      rpcErrors.has(error.message)
        ? error.message.replaceAll(' ', '_')
        : 'COUNT_FAILED',
      { cause: error },
    );
  }
  return resultSchema.parse(data);
}
