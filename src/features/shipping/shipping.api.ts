import { z } from 'zod';

import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

const palletSchema = z.object({
  id: z.string().uuid(),
  pallet_code: z.string(),
  current_location_id: z.string().uuid().nullable(),
  current_boxes: z.number().int().nonnegative(),
  current_pieces: z.number().int().nonnegative(),
  inventory_version: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER),
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
    .object({
      location_code: z.string(),
      location_type: z.enum(['rack', 'packing', 'shipping_staging']),
    })
    .nullable(),
});

const locationSchema = z.object({
  id: z.string().uuid(),
  location_code: z.string(),
  location_type: z.literal('shipping_staging'),
  active: z.literal(true),
});

const stageResultSchema = z.object({
  pallet_id: z.string().uuid(),
  pallet_code: z.string(),
  part_number: z.string(),
  description: z.string(),
  previous_location_id: z.string().uuid().nullable(),
  previous_location_code: z.string().nullable(),
  staging_location_id: z.string().uuid(),
  staging_location_code: z.string(),
  current_boxes: z.number().int().positive(),
  current_pieces: z.number().int().positive(),
  lifecycle_status: z.literal('shipping_staging'),
  actor_user_id: z.string().uuid(),
  actor_name: z.string(),
  transaction_id: z.string().uuid(),
  staged_at: z.string(),
});

const shipResultSchema = z.object({
  pallet_id: z.string().uuid(),
  pallet_code: z.string(),
  part_number: z.string(),
  description: z.string(),
  source_location_id: z.string().uuid(),
  source_location_code: z.string(),
  shipped_boxes: z.number().int().positive(),
  shipped_pieces: z.number().int().positive(),
  current_boxes: z.literal(0),
  current_pieces: z.literal(0),
  lifecycle_status: z.literal('shipped'),
  po_reference: z.string().nullable(),
  bol_reference: z.string().nullable(),
  reason_notes: z.string().nullable(),
  actor_user_id: z.string().uuid(),
  actor_name: z.string(),
  transaction_id: z.string().uuid(),
  shipped_at: z.string(),
});

export type ShippingPallet = z.infer<typeof palletSchema>;
export type ShippingLocation = z.infer<typeof locationSchema>;
export type StageResult = z.infer<typeof stageResultSchema>;
export type ShipResult = z.infer<typeof shipResultSchema>;
export type ReviewedShippingState = {
  palletCode: string;
  expectedCurrentLocationId: string | null;
  expectedLifecycleStatus: ShippingPallet['lifecycle_status'];
  expectedCurrentBoxes: number;
  expectedCurrentPieces: number;
  expectedInventoryVersion: number;
  idempotencyKey: string;
};
export type StageRequest = ReviewedShippingState & {
  destinationLocationId: string;
};
export type ShipRequest = ReviewedShippingState & {
  poReference: string | null;
  bolReference: string | null;
  reasonNotes: string | null;
};

const rpcErrors = new Set([
  'PALLET NOT FOUND',
  'PALLET ON HOLD',
  'ALREADY SHIPPED',
  'ALREADY STAGED',
  'PALLET NOT ELIGIBLE',
  'INVALID SHIPPING LOCATION',
  'INVENTORY CHANGED',
  'INVALID PALLET QUANTITY',
  'INVALID SHIPPING REQUEST',
  'IDEMPOTENCY KEY CONFLICT',
  'ACTIVE WORKER PROFILE REQUIRED',
]);

export async function getShippingPallet(code: string): Promise<ShippingPallet> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('pallets')
    .select(
      'id, pallet_code, current_location_id, current_boxes, current_pieces, inventory_version, boxes_per_full_pallet_snapshot, lifecycle_status, part:parts!pallets_part_id_fkey(part_number, description), location:locations!pallets_current_location_id_fkey(location_code, location_type)',
    )
    .eq('pallet_code', code)
    .maybeSingle();
  if (error) throw new Error('PALLET_LOOKUP_FAILED', { cause: error });
  if (!data) throw new Error('PALLET_NOT_FOUND');
  return palletSchema.parse(data);
}

export async function getShippingLocations(): Promise<ShippingLocation[]> {
  const client = await getAuthenticatedSupabaseClient();
  const locations: ShippingLocation[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await client
      .from('locations')
      .select('id, location_code, location_type, active')
      .eq('location_type', 'shipping_staging')
      .eq('active', true)
      .order('location_code')
      .range(from, from + 499);
    if (error) throw new Error('LOCATION_LOOKUP_FAILED', { cause: error });
    locations.push(...z.array(locationSchema).parse(data));
    if (!data || data.length < 500) break;
  }
  return locations;
}

function throwRpcError(message: string, code: string): never {
  if (import.meta.env.DEV) console.error('Shipping RPC failed.', { code });
  throw new Error(
    rpcErrors.has(message) ? message.replaceAll(' ', '_') : 'SHIPPING_FAILED',
  );
}

export async function stagePallet(request: StageRequest): Promise<StageResult> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .rpc('stage_pallet_for_shipping', {
      p_pallet_code: request.palletCode,
      // PostgREST accepts SQL NULL for unlocated created pallets; generated args mark it string.
      p_expected_current_location_id:
        request.expectedCurrentLocationId as string,
      p_expected_lifecycle_status: request.expectedLifecycleStatus,
      p_expected_current_boxes: request.expectedCurrentBoxes,
      p_expected_current_pieces: request.expectedCurrentPieces,
      p_expected_inventory_version: request.expectedInventoryVersion,
      p_destination_location_id: request.destinationLocationId,
      p_idempotency_key: request.idempotencyKey,
    })
    .single();
  if (error) throwRpcError(error.message, error.code);
  return stageResultSchema.parse(data);
}

export async function shipPallet(request: ShipRequest): Promise<ShipResult> {
  const client = await getAuthenticatedSupabaseClient();
  if (!request.expectedCurrentLocationId)
    throw new Error('INVALID_SHIPPING_REQUEST');
  const { data, error } = await client
    .rpc('ship_pallet', {
      p_pallet_code: request.palletCode,
      p_expected_current_location_id: request.expectedCurrentLocationId,
      p_expected_lifecycle_status: request.expectedLifecycleStatus,
      p_expected_current_boxes: request.expectedCurrentBoxes,
      p_expected_current_pieces: request.expectedCurrentPieces,
      p_expected_inventory_version: request.expectedInventoryVersion,
      p_po_reference: request.poReference as string,
      p_bol_reference: request.bolReference as string,
      p_reason_notes: request.reasonNotes as string,
      p_idempotency_key: request.idempotencyKey,
    })
    .single();
  if (error) throwRpcError(error.message, error.code);
  return shipResultSchema.parse(data);
}
