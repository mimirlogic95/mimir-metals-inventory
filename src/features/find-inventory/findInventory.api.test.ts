import { getFindInventory } from '@/features/find-inventory/findInventory.api';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

vi.mock('@/lib/supabase/developmentAuth', () => ({
  getAuthenticatedSupabaseClient: vi.fn(),
}));

const partId = '96000000-0000-4000-8000-000000000061';

const row = {
  id: '97000000-0000-4000-8000-000000000061',
  pallet_code: 'MM-P-9600061',
  current_boxes: 31,
  current_pieces: 21_700,
  boxes_per_full_pallet_snapshot: 48,
  packed_at: '2026-09-01T00:00:00Z',
  created_at: '2026-09-02T00:00:00Z',
  heat_number: 'M6-FICTIONAL-HEAT',
  lot_number: 'M6-FICTIONAL-LOT',
  machine_code: null,
  lifecycle_status: 'stored',
  location: { location_code: 'M6-RACK-61', location_type: 'rack' },
};

describe('Find Inventory server read', () => {
  it('filters eligible rack stock, orders with a stable tie-breaker, and reads held stock separately', async () => {
    const eligibleQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockResolvedValue({ data: [row], error: null }),
    };
    eligibleQuery.select.mockReturnValue(eligibleQuery);
    eligibleQuery.eq.mockReturnValue(eligibleQuery);
    eligibleQuery.gt.mockReturnValue(eligibleQuery);
    eligibleQuery.order.mockReturnValue(eligibleQuery);

    const heldQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn().mockResolvedValue({ count: 1, error: null }),
    };
    heldQuery.select.mockReturnValue(heldQuery);
    heldQuery.eq.mockReturnValue(heldQuery);
    heldQuery.gt.mockReturnValueOnce(heldQuery);

    const from = vi
      .fn()
      .mockReturnValueOnce(eligibleQuery)
      .mockReturnValueOnce(heldQuery);
    vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({
      from,
    } as never);

    const result = await getFindInventory(partId);
    expect(result).toEqual({ pallets: [row], heldPalletCount: 1 });
    expect(eligibleQuery.eq.mock.calls).toEqual([
      ['part_id', partId],
      ['lifecycle_status', 'stored'],
      ['location.location_type', 'rack'],
    ]);
    expect(eligibleQuery.gt.mock.calls).toEqual([
      ['current_boxes', 0],
      ['current_pieces', 0],
    ]);
    expect(eligibleQuery.order.mock.calls).toEqual([
      ['packed_at', { ascending: true }],
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(eligibleQuery.range).toHaveBeenCalledWith(0, 499);
    expect(eligibleQuery.select.mock.calls[0]?.[0]).toContain('!inner');
    expect(heldQuery.eq.mock.calls).toEqual([
      ['part_id', partId],
      ['lifecycle_status', 'on_hold'],
    ]);
    expect(heldQuery.select).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
    });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('retrieves a second page after a full API page', async () => {
    const eligibleQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn(),
      order: vi.fn(),
      range: vi
        .fn()
        .mockResolvedValueOnce({ data: Array(500).fill(row), error: null })
        .mockResolvedValueOnce({ data: [row], error: null }),
    };
    for (const method of ['select', 'eq', 'gt', 'order'] as const) {
      eligibleQuery[method].mockReturnValue(eligibleQuery);
    }
    const heldQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn().mockResolvedValue({ count: 0, error: null }),
    };
    heldQuery.select.mockReturnValue(heldQuery);
    heldQuery.eq.mockReturnValue(heldQuery);
    heldQuery.gt.mockReturnValueOnce(heldQuery);
    const from = vi
      .fn()
      .mockReturnValueOnce(eligibleQuery)
      .mockReturnValueOnce(eligibleQuery)
      .mockReturnValueOnce(heldQuery);
    vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({
      from,
    } as never);

    const result = await getFindInventory(partId);
    expect(result.pallets).toHaveLength(501);
    expect(eligibleQuery.range.mock.calls).toEqual([
      [0, 499],
      [500, 999],
    ]);
  });
});
