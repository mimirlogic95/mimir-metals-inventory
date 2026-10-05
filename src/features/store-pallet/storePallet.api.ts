import { z } from 'zod';

import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

const palletSchema = z.object({
  id: z.string().uuid(),
  pallet_code: z.string(),
  current_boxes: z.number().int().nonnegative(),
  current_pieces: z.number().int().nonnegative(),
  boxes_per_full_pallet_snapshot: z.number().int().positive(),
  current_location_id: z.string().uuid().nullable(),
  lifecycle_status: z.enum([
    'created',
    'stored',
    'shipping_staging',
    'on_hold',
    'shipped',
  ]),
  part: z.object({
    part_number: z.string(),
    description: z.string(),
  }),
});

const locationSchema = z.object({
  id: z.string().uuid(),
  location_code: z.string(),
  location_type: z.enum(['rack', 'packing', 'shipping_staging']),
  active: z.boolean(),
  zone: z.string().nullable(),
  rack: z.string().nullable(),
  position: z.string().nullable(),
});

const storedPalletSchema = z.object({
  pallet_id: z.string().uuid(),
  pallet_code: z.string(),
  part_number: z.string(),
  description: z.string(),
  current_boxes: z.number().int().nonnegative(),
  current_pieces: z.number().int().nonnegative(),
  boxes_per_full_pallet_snapshot: z.number().int().positive(),
  lifecycle_status: z.literal('stored'),
  destination_location_id: z.string().uuid(),
  destination_location_code: z.string(),
  zone: z.string().nullable(),
  rack: z.string().nullable(),
  position: z.string().nullable(),
  stored_at: z.string(),
});

export type StorePallet = z.infer<typeof palletSchema>;
export type RackLocation = z.infer<typeof locationSchema> & {
  occupied: boolean;
};
export type StoredPallet = z.infer<typeof storedPalletSchema>;

export type StorePalletRequest = {
  palletCode: string;
  destinationLocationId: string;
  idempotencyKey: string;
};

const rpcErrors: Record<string, string> = {
  'PALLET NOT FOUND': 'PALLET_NOT_FOUND',
  'PALLET ALREADY STORED': 'PALLET_ALREADY_STORED',
  'PALLET SHIPPED': 'PALLET_SHIPPED',
  'PALLET ON HOLD': 'PALLET_ON_HOLD',
  'PALLET NOT READY TO STORE': 'PALLET_NOT_READY_TO_STORE',
  'LOCATION NOT FOUND': 'LOCATION_NOT_FOUND',
  'LOCATION UNAVAILABLE': 'LOCATION_UNAVAILABLE',
  'LOCATION NOT A RACK': 'LOCATION_NOT_A_RACK',
  'LOCATION OCCUPIED': 'LOCATION_OCCUPIED',
  'IDEMPOTENCY KEY CONFLICT': 'IDEMPOTENCY_KEY_CONFLICT',
};

function reportDevelopmentError(context: string, code: string | undefined) {
  if (import.meta.env.DEV) {
    console.error(context, { code: code ?? 'unknown' });
  }
}

export async function getPalletForStore(code: string): Promise<StorePallet> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('pallets')
    .select(
      'id, pallet_code, current_boxes, current_pieces, boxes_per_full_pallet_snapshot, current_location_id, lifecycle_status, part:parts!pallets_part_id_fkey(part_number, description)',
    )
    .eq('pallet_code', code)
    .maybeSingle();

  if (error) {
    reportDevelopmentError('Pallet lookup failed.', error.code);
    throw new Error('PALLET_LOOKUP_FAILED', { cause: error });
  }

  if (!data) {
    throw new Error('PALLET_NOT_FOUND');
  }

  return palletSchema.parse(data);
}

export async function getRackLocation(code: string): Promise<RackLocation> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('locations')
    .select('id, location_code, location_type, active, zone, rack, position')
    .eq('location_code', code)
    .maybeSingle();

  if (error) {
    reportDevelopmentError('Location lookup failed.', error.code);
    throw new Error('LOCATION_LOOKUP_FAILED', { cause: error });
  }

  if (!data) {
    throw new Error('LOCATION_NOT_FOUND');
  }

  const location = locationSchema.parse(data);

  if (!location.active) {
    throw new Error('LOCATION_UNAVAILABLE');
  }

  if (location.location_type !== 'rack') {
    throw new Error('LOCATION_NOT_A_RACK');
  }

  const { data: occupants, error: occupancyError } = await client
    .from('pallets')
    .select('id')
    .eq('current_location_id', location.id)
    .neq('lifecycle_status', 'shipped')
    .limit(1);

  if (occupancyError) {
    reportDevelopmentError(
      'Rack occupancy lookup failed.',
      occupancyError.code,
    );
    throw new Error('LOCATION_LOOKUP_FAILED', { cause: occupancyError });
  }

  return { ...location, occupied: (occupants?.length ?? 0) > 0 };
}

export async function storePallet(
  request: StorePalletRequest,
): Promise<StoredPallet> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .rpc('store_pallet', {
      p_pallet_code: request.palletCode,
      p_destination_location_id: request.destinationLocationId,
      p_idempotency_key: request.idempotencyKey,
    })
    .single();

  if (error) {
    reportDevelopmentError('Store Pallet RPC failed.', error.code);
    throw new Error(rpcErrors[error.message] ?? 'STORE_FAILED', {
      cause: error,
    });
  }

  return storedPalletSchema.parse(data);
}
