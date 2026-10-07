import { z } from 'zod';

import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

const palletSchema = z.object({
  id: z.string().uuid(),
  pallet_code: z.string(),
  current_location_id: z.string().uuid().nullable(),
  current_boxes: z.number().int().nonnegative(),
  current_pieces: z.number().int().nonnegative(),
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

const locationSchema = z.object({
  id: z.string().uuid(),
  location_code: z.string(),
  location_type: z.enum(['rack', 'packing', 'shipping_staging']),
  active: z.boolean(),
});

const resultSchema = z.object({
  pallet_id: z.string().uuid(),
  pallet_code: z.string(),
  part_number: z.string(),
  description: z.string(),
  previous_location_id: z.string().uuid(),
  previous_location_code: z.string(),
  destination_location_id: z.string().uuid(),
  destination_location_code: z.string(),
  current_boxes: z.number().int().nonnegative(),
  current_pieces: z.number().int().nonnegative(),
  boxes_per_full_pallet_snapshot: z.number().int().positive(),
  lifecycle_status: z.literal('stored'),
  transaction_id: z.string().uuid(),
  moved_at: z.string(),
});

export type MovePallet = z.infer<typeof palletSchema>;
export type MoveRack = z.infer<typeof locationSchema> & { occupied: boolean };
export type MoveResult = z.infer<typeof resultSchema>;
export type MoveRequest = {
  palletCode: string;
  expectedCurrentLocationId: string;
  destinationLocationId: string;
  idempotencyKey: string;
};

const rpcErrors = new Set([
  'PALLET NOT FOUND',
  'PALLET NOT STORED',
  'PALLET ON HOLD',
  'PALLET SHIPPED',
  'LOCATION NOT FOUND',
  'LOCATION INACTIVE',
  'LOCATION NOT A RACK',
  'SAME LOCATION',
  'LOCATION OCCUPIED',
  'LOCATION CHANGED',
  'IDEMPOTENCY KEY CONFLICT',
]);

export async function getPalletForMove(code: string): Promise<MovePallet> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('pallets')
    .select(
      'id, pallet_code, current_location_id, current_boxes, current_pieces, boxes_per_full_pallet_snapshot, lifecycle_status, part:parts!pallets_part_id_fkey(part_number, description), location:locations!pallets_current_location_id_fkey(location_code, location_type)',
    )
    .eq('pallet_code', code)
    .maybeSingle();
  if (error) throw new Error('PALLET_LOOKUP_FAILED', { cause: error });
  if (!data) throw new Error('PALLET_NOT_FOUND');
  return palletSchema.parse(data);
}

export async function getMoveRack(code: string): Promise<MoveRack> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('locations')
    .select('id, location_code, location_type, active')
    .eq('location_code', code)
    .maybeSingle();
  if (error) throw new Error('LOCATION_LOOKUP_FAILED', { cause: error });
  if (!data) throw new Error('LOCATION_NOT_FOUND');
  const location = locationSchema.parse(data);
  if (!location.active) throw new Error('LOCATION_INACTIVE');
  if (location.location_type !== 'rack') throw new Error('LOCATION_NOT_A_RACK');
  const { data: occupants, error: occupancyError } = await client
    .from('pallets')
    .select('id')
    .eq('current_location_id', location.id)
    .neq('lifecycle_status', 'shipped')
    .limit(1);
  if (occupancyError)
    throw new Error('LOCATION_LOOKUP_FAILED', { cause: occupancyError });
  return { ...location, occupied: (occupants?.length ?? 0) > 0 };
}

export async function movePallet(request: MoveRequest): Promise<MoveResult> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .rpc('move_pallet', {
      p_pallet_code: request.palletCode,
      p_expected_current_location_id: request.expectedCurrentLocationId,
      p_destination_location_id: request.destinationLocationId,
      p_idempotency_key: request.idempotencyKey,
    })
    .single();
  if (error) {
    if (import.meta.env.DEV)
      console.error('Move Pallet RPC failed.', { code: error.code });
    throw new Error(
      rpcErrors.has(error.message)
        ? error.message.replaceAll(' ', '_')
        : 'MOVE_FAILED',
      { cause: error },
    );
  }
  return resultSchema.parse(data);
}
