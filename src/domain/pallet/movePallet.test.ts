import { getMoveIssue, moveCodeSchema } from '@/domain/pallet/movePallet';

describe('Move Pallet domain', () => {
  it('normalizes manual pallet and rack codes without a company-specific format', () => {
    expect(moveCodeSchema.parse(' mm-p-0000008 ')).toBe('MM-P-0000008');
    expect(moveCodeSchema.parse(' b-003-ac ')).toBe('B-003-AC');
    expect(moveCodeSchema.parse(' other-pallet-42 ')).toBe('OTHER-PALLET-42');
  });

  it('maps known errors but hides unknown technical errors', () => {
    expect(getMoveIssue(new Error('LOCATION_CHANGED')).title).toBe(
      'LOCATION CHANGED',
    );
    expect(getMoveIssue(new Error('LOCATION_OCCUPIED')).title).toBe(
      'LOCATION OCCUPIED',
    );
    expect(getMoveIssue(new Error('PostgreSQL 23505')).title).toBe(
      'NOT SAVED YET',
    );
    expect(
      getMoveIssue(new Error('PALLET_LOOKUP_FAILED'), 'lookup').title,
    ).toBe("COULDN'T LOAD");
    expect(getMoveIssue(new Error('LOCATION_NOT_FOUND'), 'lookup').title).toBe(
      'LOCATION NOT FOUND',
    );
  });
});
