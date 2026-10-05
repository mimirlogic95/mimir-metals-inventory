import {
  availableInventoryTotals,
  matchingParts,
} from '@/domain/inventory/findInventory';
import type {
  FindPart,
  FindPallet,
} from '@/features/find-inventory/findInventory.api';

const parts: FindPart[] = [
  {
    id: '96000000-0000-4000-8000-000000000001',
    part_number: 'MM-A3815',
    description: '3/8 x 1-5/8 Headed Anchor',
  },
  {
    id: '96000000-0000-4000-8000-000000000002',
    part_number: 'MM-SC343',
    description: '3/4 Shear Connector',
  },
];

const pallet: FindPallet = {
  id: '97000000-0000-4000-8000-000000000001',
  pallet_code: 'MM-P-0000001',
  current_boxes: 31,
  current_pieces: 21_700,
  boxes_per_full_pallet_snapshot: 48,
  packed_at: '2026-10-01T12:00:00Z',
  created_at: '2026-10-01T12:00:00Z',
  heat_number: 'M6-FICTIONAL-HEAT',
  lot_number: 'M6-FICTIONAL-LOT',
  machine_code: null,
  lifecycle_status: 'stored',
  location: { location_code: 'B-001-AA', location_type: 'rack' },
};

describe('Find Inventory display derivations', () => {
  it('matches part number fragments and descriptions without case or spacing sensitivity', () => {
    expect(matchingParts(parts, 'MM-A3815')).toEqual([parts[0]]);
    expect(matchingParts(parts, '3815')).toEqual([parts[0]]);
    expect(matchingParts(parts, 'mm a3815')).toEqual([parts[0]]);
    expect(matchingParts(parts, '  HEADED   anchor ')).toEqual([parts[0]]);
    expect(matchingParts(parts, ' ')).toEqual(parts);
    expect(matchingParts(parts, 'no-match')).toEqual([]);
  });

  it('sums only the eligible rows supplied by the server-filtered read', () => {
    expect(
      availableInventoryTotals([
        pallet,
        { ...pallet, current_boxes: 48, current_pieces: 33_600 },
      ]),
    ).toEqual({
      pallets: 2,
      boxes: 79,
      pieces: 55_300,
    });
  });
});
