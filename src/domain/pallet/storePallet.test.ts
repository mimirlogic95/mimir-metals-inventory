import {
  getStoreIssue,
  locationCodeSchema,
  palletCodeSchema,
} from '@/domain/pallet/storePallet';

describe('Store Pallet input and errors', () => {
  it('normalizes stable pallet and location codes', () => {
    expect(palletCodeSchema.parse(' mm-p-0004821 ')).toBe('MM-P-0004821');
    expect(locationCodeSchema.parse(' b-003-ac ')).toBe('B-003-AC');
    expect(palletCodeSchema.safeParse('B-003-AC').success).toBe(false);
    expect(locationCodeSchema.safeParse('  ').success).toBe(false);
  });

  it('maps only known failures to worker-safe messages', () => {
    expect(getStoreIssue(new Error('LOCATION_OCCUPIED'))?.title).toBe(
      'LOCATION OCCUPIED',
    );
    expect(getStoreIssue(new Error('PALLET_ALREADY_STORED'))?.title).toBe(
      'PALLET ALREADY STORED',
    );
    expect(getStoreIssue(new Error('raw database failure'))).toBeNull();
  });
});
