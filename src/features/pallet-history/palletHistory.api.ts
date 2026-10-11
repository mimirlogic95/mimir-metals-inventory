import { z } from 'zod';

import {
  historyCodeSchema,
  type HistoryEvent,
} from '@/domain/transaction/history';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

const lifecycleSchema = z.enum([
  'created',
  'stored',
  'shipping_staging',
  'on_hold',
  'shipped',
]);

const palletSchema = z.object({
  id: z.string().uuid(),
  pallet_code: z.string(),
  current_boxes: z.number().int().nonnegative(),
  current_pieces: z.number().int().nonnegative(),
  original_boxes: z.number().int().positive(),
  original_pieces: z.number().int().positive(),
  boxes_per_full_pallet_snapshot: z.number().int().positive(),
  lifecycle_status: lifecycleSchema,
  hold_reason: z.string().nullable(),
  packed_at: z.string(),
  heat_number: z.string(),
  lot_number: z.string(),
  machine_code: z.string().nullable(),
  part: z.object({ part_number: z.string(), description: z.string() }),
  location: z.object({ location_code: z.string() }).nullable(),
});

const adjustmentSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
  counted_boxes: z.number().int().nonnegative(),
  box_difference: z.number().int(),
  counted_pieces: z.number().int().nonnegative(),
  piece_difference: z.number().int(),
  reason_notes: z.string().nullable(),
  review_notes: z.string().nullable(),
});

const eventSchema = z.object({
  id: z.string().uuid(),
  transaction_type: z.string(),
  occurred_at: z.string(),
  previous_boxes: z.number().int().nullable(),
  box_change: z.number().int().nullable(),
  new_boxes: z.number().int().nullable(),
  previous_pieces: z.number().int().nullable(),
  piece_change: z.number().int().nullable(),
  new_pieces: z.number().int().nullable(),
  po_reference: z.string().nullable(),
  bol_reference: z.string().nullable(),
  actor: z.object({ display_name: z.string().nullable() }).nullable(),
  previous_location: z.object({ location_code: z.string() }).nullable(),
  new_location: z.object({ location_code: z.string() }).nullable(),
  adjustment: adjustmentSchema.nullable(),
});

const cursorSchema = z.object({
  occurredAt: z
    .string()
    .regex(/^[0-9TZ:.+-]+$/)
    .refine((value) => !Number.isNaN(Date.parse(value))),
  id: z.string().uuid(),
});

export type HistoryPallet = z.infer<typeof palletSchema>;
export type HistoryCursor = z.infer<typeof cursorSchema>;
export type HistoryPage = {
  events: HistoryEvent[];
  nextCursor: HistoryCursor | null;
};

export const historyPageSize = 25;

function readError(code: string): Error {
  return new Error(code);
}

async function authorizedClient() {
  const client = await getAuthenticatedSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw readError('ACCESS_DENIED');
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('active, role')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (profileError) throw readError('HISTORY_LOAD_FAILED');
  if (!profile?.active || !['worker', 'supervisor'].includes(profile.role)) {
    throw readError('ACCESS_DENIED');
  }
  return client;
}

export async function getHistoryPallet(code: string): Promise<HistoryPallet> {
  const normalized = historyCodeSchema.safeParse(code);
  if (!normalized.success) throw readError('INVALID_PALLET_CODE');
  const client = await authorizedClient();
  const { data, error } = await client
    .from('pallets')
    .select(
      'id, pallet_code, current_boxes, current_pieces, original_boxes, original_pieces, boxes_per_full_pallet_snapshot, lifecycle_status, hold_reason, packed_at, heat_number, lot_number, machine_code, part:parts!pallets_part_id_fkey(part_number, description), location:locations!pallets_current_location_id_fkey(location_code)',
    )
    .eq('pallet_code', normalized.data)
    .maybeSingle();
  if (error)
    throw readError(
      error.code === '42501' ? 'ACCESS_DENIED' : 'HISTORY_LOAD_FAILED',
    );
  if (!data) throw readError('PALLET_NOT_FOUND');
  return palletSchema.parse(data);
}

function toHistoryEvent(row: z.infer<typeof eventSchema>): HistoryEvent {
  return {
    id: row.id,
    transactionType: row.transaction_type,
    occurredAt: row.occurred_at,
    actorName: row.actor?.display_name ?? null,
    previousBoxes: row.previous_boxes,
    boxChange: row.box_change,
    newBoxes: row.new_boxes,
    previousPieces: row.previous_pieces,
    pieceChange: row.piece_change,
    newPieces: row.new_pieces,
    previousLocationCode: row.previous_location?.location_code ?? null,
    newLocationCode: row.new_location?.location_code ?? null,
    poReference: row.po_reference,
    bolReference: row.bol_reference,
    reasonNotes:
      row.transaction_type === 'adjustment_requested'
        ? (row.adjustment?.reason_notes ?? null)
        : row.transaction_type === 'adjustment_approved' ||
            row.transaction_type === 'adjustment_rejected'
          ? (row.adjustment?.review_notes ?? null)
          : null,
    adjustment: row.adjustment
      ? {
          status: row.adjustment.status,
          countedBoxes: row.adjustment.counted_boxes,
          boxDifference: row.adjustment.box_difference,
          countedPieces: row.adjustment.counted_pieces,
          pieceDifference: row.adjustment.piece_difference,
          reasonNotes: row.adjustment.reason_notes,
          reviewNotes: row.adjustment.review_notes,
        }
      : null,
  };
}

export async function getHistoryPage(
  palletId: string,
  cursor: HistoryCursor | null,
): Promise<HistoryPage> {
  const validId = z.string().uuid().parse(palletId);
  const validCursor = cursor === null ? null : cursorSchema.parse(cursor);
  const client = await authorizedClient();
  let query = client
    .from('inventory_transactions')
    .select(
      'id, transaction_type, occurred_at, previous_boxes, box_change, new_boxes, previous_pieces, piece_change, new_pieces, po_reference, bol_reference, actor:profiles!inventory_transactions_actor_user_id_fkey(display_name), previous_location:locations!inventory_transactions_previous_location_id_fkey(location_code), new_location:locations!inventory_transactions_new_location_id_fkey(location_code), adjustment:adjustment_requests!inventory_transactions_adjustment_request_id_fkey(status, counted_boxes, box_difference, counted_pieces, piece_difference, reason_notes, review_notes)',
    )
    .eq('pallet_id', validId);

  // Keyset pagination does not skip an older event when a new one is recorded.
  if (validCursor) {
    query = query.or(
      `occurred_at.lt.${validCursor.occurredAt},and(occurred_at.eq.${validCursor.occurredAt},id.lt.${validCursor.id})`,
    );
  }

  const { data, error } = await query
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, historyPageSize);
  if (error)
    throw readError(
      error.code === '42501' ? 'ACCESS_DENIED' : 'HISTORY_LOAD_FAILED',
    );
  const rows = z.array(eventSchema).parse(data);
  const visibleRows = rows.slice(0, historyPageSize);
  const last = visibleRows.at(-1);
  return {
    events: visibleRows.map(toHistoryEvent),
    nextCursor:
      rows.length > historyPageSize && last
        ? { occurredAt: last.occurred_at, id: last.id }
        : null,
  };
}
