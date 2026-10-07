import { getFindInventory } from '@/features/find-inventory/findInventory.api';
import { getPullContext, pullBoxes } from '@/features/pull-boxes/pullBoxes.api';
import { getAuthenticatedSupabaseClient } from '@/lib/supabase/developmentAuth';

vi.mock('@/lib/supabase/developmentAuth', () => ({
  getAuthenticatedSupabaseClient: vi.fn(),
}));
vi.mock('@/features/find-inventory/findInventory.api', () => ({
  getFindInventory: vi.fn(),
}));

const pallet = {
  id: '97000000-0000-4000-8000-000000000071',
  pallet_code: 'MM-P-0000071',
  part_id: '96000000-0000-4000-8000-000000000071',
  current_boxes: 31,
  current_pieces: 21_700,
  pieces_per_box_snapshot: 700,
  boxes_per_full_pallet_snapshot: 48,
  lifecycle_status: 'stored',
  part: { part_number: 'MM-A3815', description: 'Fictional part' },
  location: { location_code: 'M7-RACK-1', location_type: 'rack' },
};

describe('Pull Boxes data access', () => {
  it('loads current pallet and database-ordered FIFO guidance', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: pallet, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(query),
    } as never);
    vi.mocked(getFindInventory).mockResolvedValue({
      pallets: [
        {
          id: pallet.id,
          pallet_code: pallet.pallet_code,
          location: pallet.location,
        },
      ] as never,
      heldPalletCount: 0,
    });

    const result = await getPullContext(pallet.pallet_code);
    expect(result.pallet).toEqual(pallet);
    expect(result.fifo?.isFirst).toBe(true);
    expect(getFindInventory).toHaveBeenCalledWith(pallet.part_id);
    expect(query.eq).toHaveBeenCalledWith('pallet_code', pallet.pallet_code);
  });

  it('calls only the protected RPC and maps a stale-state error', async () => {
    const rpcQuery = {
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'INVENTORY CHANGED', code: '22023' },
      }),
    };
    const rpc = vi.fn().mockReturnValue(rpcQuery);
    vi.mocked(getAuthenticatedSupabaseClient).mockResolvedValue({
      rpc,
    } as never);
    const request = {
      palletCode: pallet.pallet_code,
      boxesToPull: 6,
      expectedCurrentBoxes: 31,
      expectedCurrentPieces: 21_700,
      poReference: 'M7-FICTIONAL-PO',
      bolReference: null,
      idempotencyKey: 'mission-7-test-key',
    };
    await expect(pullBoxes(request)).rejects.toThrow('INVENTORY_CHANGED');
    expect(rpc).toHaveBeenCalledWith('pull_boxes', {
      p_pallet_code: request.palletCode,
      p_boxes_to_pull: 6,
      p_expected_current_boxes: 31,
      p_expected_current_pieces: 21_700,
      p_idempotency_key: request.idempotencyKey,
      p_po_reference: request.poReference,
    });
  });
});
