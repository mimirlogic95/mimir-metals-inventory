import { z } from 'zod';

import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

const findPartSchema = z.object({
  id: z.string().uuid(),
  part_number: z.string(),
  description: z.string(),
});

const findPalletSchema = z.object({
  id: z.string().uuid(),
  pallet_code: z.string(),
  current_boxes: z.number().int().positive(),
  current_pieces: z.number().int().positive(),
  boxes_per_full_pallet_snapshot: z.number().int().positive(),
  packed_at: z.string(),
  created_at: z.string(),
  heat_number: z.string(),
  lot_number: z.string(),
  machine_code: z.string().nullable(),
  lifecycle_status: z.literal('stored'),
  location: z.object({
    location_code: z.string(),
    location_type: z.literal('rack'),
  }),
});

export type FindPart = z.infer<typeof findPartSchema>;
export type FindPallet = z.infer<typeof findPalletSchema>;
export type FindInventory = { pallets: FindPallet[]; heldPalletCount: number };

const pageSize = 500;

export async function getFindParts(): Promise<FindPart[]> {
  const client = await getAuthenticatedSupabaseClient();
  const parts: FindPart[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('parts')
      .select('id, part_number, description')
      .eq('active', true)
      .order('part_number')
      .range(from, from + pageSize - 1);

    if (error) throw new Error('PARTS_LOAD_FAILED', { cause: error });
    parts.push(...z.array(findPartSchema).parse(data));
    if (!data || data.length < pageSize) break;
  }
  return parts;
}

export async function getFindInventory(partId: string): Promise<FindInventory> {
  const validPartId = z.string().uuid().parse(partId);
  const client = await getAuthenticatedSupabaseClient();
  const pallets: FindPallet[] = [];

  // Page explicitly so PostgREST's row limit cannot silently undercount stock.
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('pallets')
      .select(
        'id, pallet_code, current_boxes, current_pieces, boxes_per_full_pallet_snapshot, packed_at, created_at, heat_number, lot_number, machine_code, lifecycle_status, location:locations!pallets_current_location_id_fkey!inner(location_code, location_type)',
      )
      .eq('part_id', validPartId)
      .eq('lifecycle_status', 'stored')
      .gt('current_boxes', 0)
      .gt('current_pieces', 0)
      .eq('location.location_type', 'rack')
      .order('packed_at', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error('INVENTORY_LOAD_FAILED', { cause: error });
    pallets.push(...z.array(findPalletSchema).parse(data));
    if (!data || data.length < pageSize) break;
  }

  const { count, error } = await client
    .from('pallets')
    .select('id', { count: 'exact', head: true })
    .eq('part_id', validPartId)
    .eq('lifecycle_status', 'on_hold')
    .gt('current_boxes', 0)
    .gt('current_pieces', 0);

  if (error || count === null) {
    throw new Error('INVENTORY_LOAD_FAILED', { cause: error });
  }

  return { pallets, heldPalletCount: count };
}
