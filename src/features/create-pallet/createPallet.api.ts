import { z } from 'zod';

import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

const activePartSchema = z.object({
  id: z.string().uuid(),
  part_number: z.string(),
  description: z.string(),
  product_family: z.string(),
});

const packingSpecSchema = z.object({
  part_id: z.string().uuid(),
  pieces_per_box: z.number().int().positive(),
  boxes_per_full_pallet: z.number().int().positive(),
  pieces_per_full_pallet: z.number().int().positive(),
  estimated_box_weight_lb: z.number().positive().nullable(),
});

const createdPalletSchema = z.object({
  id: z.string().uuid(),
  pallet_code: z.string().regex(/^MM-P-\d{7}$/),
  part_id: z.string().uuid(),
  part_number: z.string(),
  description: z.string(),
  product_family: z.string(),
  heat_number: z.string(),
  lot_number: z.string(),
  machine_code: z.string().nullable(),
  packed_by_user_id: z.string().uuid(),
  packed_at: z.string(),
  pieces_per_box_snapshot: z.number().int().positive(),
  boxes_per_full_pallet_snapshot: z.number().int().positive(),
  estimated_box_weight_lb_snapshot: z.number().positive().nullable(),
  original_boxes: z.number().int().positive(),
  original_pieces: z.number().int().positive(),
  current_boxes: z.number().int().positive(),
  current_pieces: z.number().int().positive(),
  lifecycle_status: z.literal('created'),
});

export type ActivePart = z.infer<typeof activePartSchema>;
export type PackingSpec = z.infer<typeof packingSpecSchema>;
export type CreatedPallet = z.infer<typeof createdPalletSchema>;

export type CreatePalletRequest = {
  partId: string;
  boxes: number;
  heatNumber: string;
  lotNumber: string;
  machineCode?: string;
  idempotencyKey: string;
};

function reportDevelopmentError(context: string, error: unknown) {
  if (import.meta.env.DEV) {
    console.error(context, error);
  }
}

export async function getActiveParts(): Promise<ActivePart[]> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('parts')
    .select('id, part_number, description, product_family')
    .eq('active', true)
    .order('part_number');

  if (error) {
    reportDevelopmentError('Unable to load active parts.', error);
    throw new Error('PARTS_LOAD_FAILED', { cause: error });
  }

  return z.array(activePartSchema).parse(data);
}

export async function getPackingSpec(partId: string): Promise<PackingSpec> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('packing_specs')
    .select(
      'part_id, pieces_per_box, boxes_per_full_pallet, pieces_per_full_pallet, estimated_box_weight_lb',
    )
    .eq('part_id', partId)
    .single();

  if (error) {
    reportDevelopmentError('Unable to load the selected packing spec.', error);
    throw new Error('PACKING_SPEC_LOAD_FAILED', { cause: error });
  }

  return packingSpecSchema.parse(data);
}

export async function createPallet(
  request: CreatePalletRequest,
): Promise<CreatedPallet> {
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .rpc('create_pallet', {
      p_part_id: request.partId,
      p_boxes: request.boxes,
      p_heat_number: request.heatNumber,
      p_lot_number: request.lotNumber,
      p_idempotency_key: request.idempotencyKey,
      ...(request.machineCode ? { p_machine_code: request.machineCode } : {}),
    })
    .single();

  if (error) {
    reportDevelopmentError('Create Pallet RPC failed.', error);
    throw new Error('PALLET_CREATE_FAILED', { cause: error });
  }

  return createdPalletSchema.parse(data);
}
