import {
  decideAdjustment,
  getPendingAdjustments,
  requireSupervisor,
} from '@/features/adjustments/adjustments.api';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

vi.mock('@/lib/supabase/developmentAuth', () => ({
  getAuthenticatedSupabaseClient: vi.fn(),
}));

const requestId = '95100000-0000-4000-8000-000000000098';
const decision = {
  requestId,
  decision: 'approve' as const,
  reviewNotes: 'Fictional supervisor review',
  idempotencyKey: 'm10-api-decision',
};

describe('adjustment data boundary', () => {
  beforeEach(() => vi.mocked(getAuthenticatedSupabaseClient).mockReset());

  it('requires an active supervisor profile for the UI gate', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { role: 'worker', active: true },
      error: null,
    });
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: requestId } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue(query),
    } as never);
    await expect(requireSupervisor()).rejects.toThrow(
      'SUPERVISOR_ACCESS_REQUIRED',
    );
    expect(query.eq).toHaveBeenCalledWith('id', requestId);
  });

  it('reads only pending requests and never writes a table from the browser', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    const from = vi.fn().mockReturnValue(query);
    vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({
      from,
    } as never);
    await expect(getPendingAdjustments()).resolves.toEqual([]);
    expect(from).toHaveBeenCalledWith('adjustment_requests');
    expect(query.eq).toHaveBeenCalledWith('status', 'pending');
    expect(query.order.mock.calls).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(query.range).toHaveBeenCalledWith(0, 99);
  });

  it('sends only the frozen decision fields to the protected RPC', async () => {
    const result = {
      request_id: requestId,
      pallet_id: '97100000-0000-4000-8000-000000000001',
      pallet_code: 'MM-P-9800001',
      part_number: 'MM-M10-TEST',
      decision_status: 'approved',
      reviewed_by_user_id: '95100000-0000-4000-8000-000000000002',
      reviewer_name: 'Fictional Supervisor',
      reviewed_at: '2026-10-09T13:00:00Z',
      location_id: '98100000-0000-4000-8000-000000000001',
      location_code: 'M10-RACK-A',
      lifecycle_status: 'stored',
      before_boxes: 31,
      box_change: -2,
      after_boxes: 29,
      before_pieces: 21700,
      piece_change: -1400,
      after_pieces: 20300,
      review_notes: decision.reviewNotes,
      transaction_id: '96100000-0000-4000-8000-000000000099',
    };
    const single = vi.fn().mockResolvedValue({ data: result, error: null });
    const rpc = vi.fn().mockReturnValue({ single });
    const from = vi.fn();
    vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({
      rpc,
      from,
    } as never);
    await expect(decideAdjustment(decision)).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith('approve_adjustment_request', {
      p_request_id: requestId,
      p_review_notes: decision.reviewNotes,
      p_idempotency_key: decision.idempotencyKey,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('maps expected server denials and keeps unknown write errors uncertain', async () => {
    const single = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: '22023', message: 'ZERO BALANCE NOT SUPPORTED' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST000', message: 'transport failed' },
      });
    vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({
      rpc: vi.fn().mockReturnValue({ single }),
    } as never);
    await expect(decideAdjustment(decision)).rejects.toThrow(
      'ZERO_BALANCE_NOT_SUPPORTED',
    );
    await expect(decideAdjustment(decision)).rejects.toThrow(
      'DECISION_UNCERTAIN',
    );
  });
});
