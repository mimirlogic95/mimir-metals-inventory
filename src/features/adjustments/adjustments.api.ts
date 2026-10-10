import { z } from 'zod';

import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

const lifecycle = z.enum([
  'created',
  'stored',
  'shipping_staging',
  'on_hold',
  'shipped',
]);

const requestSchema = z.object({
  id: z.string().uuid(),
  pallet_id: z.string().uuid(),
  requested_by_user_id: z.string().uuid(),
  created_at: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  system_boxes: z.number().int().nonnegative(),
  system_pieces: z.number().int().nonnegative(),
  counted_boxes: z.number().int().nonnegative(),
  counted_pieces: z.number().int().nonnegative(),
  box_difference: z.number().int(),
  piece_difference: z.number().int(),
  reason_code: z.string(),
  reason_notes: z.string().nullable(),
  count_location_id: z.string().uuid().nullable(),
  count_inventory_version: z.number().int().nullable(),
  count_lifecycle_status: lifecycle.nullable(),
  count_lifecycle_status_before_hold: lifecycle.nullable(),
  reviewed_at: z.string().nullable(),
  review_notes: z.string().nullable(),
  requester: z.object({ display_name: z.string() }),
  count_location: z.object({ location_code: z.string() }).nullable(),
  pallet: z.object({
    pallet_code: z.string(),
    current_boxes: z.number().int().nonnegative(),
    current_pieces: z.number().int().nonnegative(),
    current_location_id: z.string().uuid().nullable(),
    inventory_version: z.number().int().nonnegative(),
    lifecycle_status: lifecycle,
    lifecycle_status_before_hold: lifecycle.nullable(),
    hold_reason: z.string().nullable(),
    packed_at: z.string(),
    part: z.object({ part_number: z.string(), description: z.string() }),
    location: z.object({ location_code: z.string() }).nullable(),
  }),
});

const resultSchema = z.object({
  request_id: z.string().uuid(),
  pallet_id: z.string().uuid(),
  pallet_code: z.string(),
  part_number: z.string(),
  decision_status: z.enum(['approved', 'rejected']),
  reviewed_by_user_id: z.string().uuid(),
  reviewer_name: z.string(),
  reviewed_at: z.string(),
  location_id: z.string().uuid().nullable(),
  location_code: z.string().nullable(),
  lifecycle_status: lifecycle,
  before_boxes: z.number().int().nonnegative(),
  box_change: z.number().int(),
  after_boxes: z.number().int().nonnegative(),
  before_pieces: z.number().int().nonnegative(),
  piece_change: z.number().int(),
  after_pieces: z.number().int().nonnegative(),
  review_notes: z.string().nullable(),
  transaction_id: z.string().uuid(),
});

export type AdjustmentRequest = z.infer<typeof requestSchema>;
export type AdjustmentResult = z.infer<typeof resultSchema>;
export type DecisionInput = {
  requestId: string;
  decision: 'approve' | 'reject';
  reviewNotes: string | null;
  idempotencyKey: string;
};

const requestSelect =
  'id, pallet_id, requested_by_user_id, created_at, status, system_boxes, system_pieces, counted_boxes, counted_pieces, box_difference, piece_difference, reason_code, reason_notes, count_location_id, count_inventory_version, count_lifecycle_status, count_lifecycle_status_before_hold, reviewed_at, review_notes, requester:profiles!adjustment_requests_requested_by_user_id_fkey(display_name), count_location:locations!adjustment_requests_count_location_id_fkey(location_code), pallet:pallets!adjustment_requests_pallet_id_fkey(pallet_code, current_boxes, current_pieces, current_location_id, inventory_version, lifecycle_status, lifecycle_status_before_hold, hold_reason, packed_at, part:parts!pallets_part_id_fkey(part_number, description), location:locations!pallets_current_location_id_fkey(location_code))';

export async function requireSupervisor(): Promise<string> {
  const client = await getAuthenticatedSupabaseClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error('SUPERVISOR_ACCESS_REQUIRED');
  const { data, error } = await client
    .from('profiles')
    .select('id, role, active, display_name')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (error) throw new Error('SUPERVISOR_LOAD_FAILED', { cause: error });
  if (!data || !data.active || data.role !== 'supervisor')
    throw new Error('SUPERVISOR_ACCESS_REQUIRED');
  return data.display_name;
}

export async function getPendingAdjustments(): Promise<AdjustmentRequest[]> {
  const client = await getAuthenticatedSupabaseClient();
  const requests: AdjustmentRequest[] = [];
  const pageSize = 100;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from('adjustment_requests')
      .select(requestSelect)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error('ADJUSTMENTS_LOAD_FAILED', { cause: error });
    requests.push(...z.array(requestSchema).parse(data));
    if (!data || data.length < pageSize) break;
  }
  return requests;
}

export async function getAdjustmentRequest(
  requestId: string,
): Promise<AdjustmentRequest> {
  const id = z.string().uuid().safeParse(requestId);
  if (!id.success) throw new Error('REQUEST_NOT_FOUND');
  const client = await getAuthenticatedSupabaseClient();
  const { data, error } = await client
    .from('adjustment_requests')
    .select(requestSelect)
    .eq('id', id.data)
    .maybeSingle();
  if (error) throw new Error('ADJUSTMENTS_LOAD_FAILED', { cause: error });
  if (!data) throw new Error('REQUEST_NOT_FOUND');
  return requestSchema.parse(data);
}

const knownErrors = new Set([
  'AUTHENTICATION REQUIRED',
  'SUPERVISOR ACCESS REQUIRED',
  'REQUEST NOT FOUND',
  'REQUEST ALREADY RESOLVED',
  'INVENTORY CHANGED',
  'PALLET NOT ELIGIBLE',
  'INVALID ADJUSTMENT',
  'CANNOT APPROVE OWN REQUEST',
  'ZERO BALANCE NOT SUPPORTED',
  'REJECTION REASON REQUIRED',
  'IDEMPOTENCY CONFLICT',
]);

export async function decideAdjustment(
  input: DecisionInput,
): Promise<AdjustmentResult> {
  const client = await getAuthenticatedSupabaseClient();
  const args = {
    p_request_id: input.requestId,
    p_review_notes: input.reviewNotes ?? '',
    p_idempotency_key: input.idempotencyKey,
  };
  const response =
    input.decision === 'approve'
      ? await client.rpc('approve_adjustment_request', args).single()
      : await client.rpc('reject_adjustment_request', args).single();
  if (response.error) {
    if (import.meta.env.DEV)
      console.error('Adjustment decision RPC failed.', {
        code: response.error.code,
      });
    throw new Error(
      knownErrors.has(response.error.message)
        ? response.error.message.replaceAll(' ', '_')
        : 'DECISION_UNCERTAIN',
      { cause: response.error },
    );
  }
  return resultSchema.parse(response.data);
}
