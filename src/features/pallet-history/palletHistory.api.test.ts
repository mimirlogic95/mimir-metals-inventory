import {
  getHistoryPage,
  getHistoryPallet,
  historyPageSize,
} from '@/features/pallet-history/palletHistory.api';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

vi.mock('@/lib/supabase/developmentAuth', () => ({
  getAuthenticatedSupabaseClient: vi.fn(),
}));

const palletId = '97000000-0000-4000-8000-000000000001';
const actorId = '95000000-0000-4000-8000-000000000001';
const palletRow = {
  id: palletId,
  pallet_code: 'MM-P-0000033',
  current_boxes: 0,
  current_pieces: 0,
  original_boxes: 31,
  original_pieces: 21_700,
  boxes_per_full_pallet_snapshot: 48,
  lifecycle_status: 'shipped',
  hold_reason: null,
  packed_at: '2026-10-10T11:00:00Z',
  heat_number: 'FICTIONAL-HEAT',
  lot_number: 'FICTIONAL-LOT',
  machine_code: null,
  part: { part_number: 'MM-A3815', description: 'Fictional anchor' },
  location: null,
};

function eventRow(index: number) {
  return {
    id: `97000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    transaction_type: 'shipped',
    occurred_at: '2026-10-10T12:00:00+00:00',
    previous_boxes: 31,
    box_change: -31,
    new_boxes: 0,
    previous_pieces: 21_700,
    piece_change: -21_700,
    new_pieces: 0,
    po_reference: 'FICTIONAL-PO',
    bol_reference: null,
    reason_notes: null,
    actor: { display_name: 'Fictional Worker' },
    previous_location: { location_code: 'SHIPPING-STAGING-01' },
    new_location: null,
    adjustment: null,
  };
}

function queryWithResult(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    range: vi.fn().mockResolvedValue(result),
  };
  for (const method of ['select', 'eq', 'or', 'order'] as const) {
    query[method].mockReturnValue(query);
  }
  return query;
}

function authorizeAndRead(
  readTable: 'pallets' | 'inventory_transactions',
  readQuery: ReturnType<typeof queryWithResult>,
  active = true,
) {
  const profileQuery = queryWithResult({
    data: { active, role: 'worker' },
    error: null,
  });
  const from = vi.fn((table: string) => {
    if (table === 'profiles') return profileQuery;
    if (table === readTable) return readQuery;
    throw new Error('Unexpected table');
  });
  vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: actorId } }, error: null }),
    },
    from,
  } as never);
  return { from, profileQuery };
}

describe('Pallet History read access', () => {
  beforeEach(() => vi.mocked(getAuthenticatedSupabaseClient).mockReset());

  it('normalizes a direct URL lookup and reads a shipped pallet with zero current inventory', async () => {
    const query = queryWithResult({ data: palletRow, error: null });
    const { profileQuery } = authorizeAndRead('pallets', query);
    const result = await getHistoryPallet(' mm-p-0000033 ');
    expect(result).toEqual(palletRow);
    expect(profileQuery.select).toHaveBeenCalledWith('active, role');
    expect(query.eq).toHaveBeenCalledWith('pallet_code', 'MM-P-0000033');
    expect(query.select.mock.calls[0]?.[0]).not.toContain('auth.users');
  });

  it('rejects inactive readers before accessing pallet data', async () => {
    const query = queryWithResult({ data: palletRow, error: null });
    const { from } = authorizeAndRead('pallets', query, false);
    await expect(getHistoryPallet('MM-P-0000033')).rejects.toThrow(
      'ACCESS_DENIED',
    );
    expect(from).not.toHaveBeenCalledWith('pallets');
  });

  it('distinguishes invalid and absent pallets from a read failure', async () => {
    await expect(getHistoryPallet('bad,code')).rejects.toThrow(
      'INVALID_PALLET_CODE',
    );
    const missing = queryWithResult({ data: null, error: null });
    authorizeAndRead('pallets', missing);
    await expect(getHistoryPallet('MM-P-0000033')).rejects.toThrow(
      'PALLET_NOT_FOUND',
    );
    missing.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: '08006' },
    });
    await expect(getHistoryPallet('MM-P-0000033')).rejects.toThrow(
      'HISTORY_LOAD_FAILED',
    );
  });

  it('orders bounded history by timestamp and UUID and uses a stable keyset cursor', async () => {
    const rows = Array.from({ length: historyPageSize + 1 }, (_, index) =>
      eventRow(index + 1),
    );
    const query = queryWithResult({ data: rows, error: null });
    const { from } = authorizeAndRead('inventory_transactions', query);
    const first = await getHistoryPage(palletId, null);
    expect(first.events).toHaveLength(historyPageSize);
    expect(first.nextCursor).toEqual({
      occurredAt: rows[24]?.occurred_at,
      id: rows[24]?.id,
    });
    expect(query.order.mock.calls).toEqual([
      ['occurred_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(query.range).toHaveBeenCalledWith(0, historyPageSize);
    expect(query.eq).toHaveBeenCalledWith('pallet_id', palletId);
    expect(query.select.mock.calls[0]?.[0]).toContain('actor:profiles');
    const transactionProjection =
      query.select.mock.calls[0]?.[0].split('adjustment:')[0];
    expect(transactionProjection).not.toContain('reason_notes');
    expect(transactionProjection).not.toContain('reason_code');
    expect(transactionProjection).not.toContain('metadata');
    expect(from).not.toHaveBeenCalledWith('auth.users');

    query.range.mockResolvedValue({ data: [eventRow(27)], error: null });
    const older = await getHistoryPage(palletId, first.nextCursor);
    expect(query.or).toHaveBeenCalledWith(
      `occurred_at.lt.${rows[24]?.occurred_at},and(occurred_at.eq.${rows[24]?.occurred_at},id.lt.${rows[24]?.id})`,
    );
    expect(older.events[0]).toMatchObject({
      transactionType: 'shipped',
      actorName: 'Fictional Worker',
      previousLocationCode: 'SHIPPING-STAGING-01',
      previousBoxes: 31,
      boxChange: -31,
      newBoxes: 0,
    });
    expect(older.nextCursor).toBeNull();
  });

  it('does not drop events when adjustment details are hidden by RLS', async () => {
    const query = queryWithResult({
      data: [
        {
          ...eventRow(1),
          transaction_type: 'adjustment_requested',
          adjustment: null,
          actor: null,
          reason_notes: 'Private count explanation',
        },
      ],
      error: null,
    });
    authorizeAndRead('inventory_transactions', query);
    const result = await getHistoryPage(palletId, null);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.adjustment).toBeNull();
    expect(result.events[0]?.actorName).toBeNull();
    expect(result.events[0]?.reasonNotes).toBeNull();
  });

  it('reads decision notes only through a request visible under its RLS policy', async () => {
    const query = queryWithResult({
      data: [
        {
          ...eventRow(1),
          transaction_type: 'adjustment_rejected',
          reason_notes: 'Transaction note is not selected',
          adjustment: {
            status: 'rejected',
            system_boxes: 31,
            counted_boxes: 30,
            box_difference: -1,
            system_pieces: 21_700,
            counted_pieces: 21_000,
            piece_difference: -700,
            reason_code: 'count_error',
            reason_notes: 'Fictional count evidence',
            review_notes: 'Recount required',
          },
        },
      ],
      error: null,
    });
    authorizeAndRead('inventory_transactions', query);
    const result = await getHistoryPage(palletId, null);
    expect(result.events[0]?.reasonNotes).toBe('Recount required');
  });

  it('returns a read error without implying an inventory write', async () => {
    const query = queryWithResult({ data: null, error: { code: '08006' } });
    authorizeAndRead('inventory_transactions', query);
    await expect(getHistoryPage(palletId, null)).rejects.toThrow(
      'HISTORY_LOAD_FAILED',
    );
    expect(query.range).toHaveBeenCalledTimes(1);
  });
});
