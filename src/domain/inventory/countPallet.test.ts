import {
  calculateCountPreview,
  countPalletCodeSchema,
  formatSignedQuantity,
  getCountIssue,
} from '@/domain/inventory/countPallet';

describe('Count preview', () => {
  it('normalizes pallet codes and derives pieces and signed differences from snapshots', () => {
    expect(countPalletCodeSchema.parse(' mm-p-0000009 ')).toBe('MM-P-0000009');
    expect(calculateCountPreview(31, 21700, 700, '29').preview).toEqual({
      countedBoxes: 29,
      countedPieces: 20300,
      boxDifference: -2,
      pieceDifference: -1400,
      matches: false,
    });
    expect(formatSignedQuantity(2)).toBe('+2');
    expect(formatSignedQuantity(-1400)).toBe('-1,400');
  });

  it('allows zero as an observation and a matching count', () => {
    expect(calculateCountPreview(31, 21700, 700, '0').preview).toMatchObject({
      countedBoxes: 0,
      countedPieces: 0,
      boxDifference: -31,
    });
    expect(calculateCountPreview(31, 21700, 700, '31').preview?.matches).toBe(
      true,
    );
  });

  it.each(['-1', '1.5', '01', 'nope', '2147483648'])(
    'rejects invalid box entry %s',
    (input) => {
      expect(calculateCountPreview(31, 21700, 700, input).issue?.title).toBe(
        'INVALID COUNT',
      );
    },
  );

  it('rejects piece overflow and separates read errors from uncertain writes', () => {
    expect(
      calculateCountPreview(1, 2147483647, 2147483647, '2').issue?.title,
    ).toBe('INVALID COUNT');
    expect(
      getCountIssue(new Error('PALLET_LOOKUP_FAILED'), 'lookup').title,
    ).toBe("COULDN'T LOAD");
    expect(getCountIssue(new Error('COUNT_FAILED')).title).toBe(
      'NOT SAVED YET',
    );
    expect(getCountIssue(new Error('INVENTORY_CHANGED')).title).toBe(
      'INVENTORY CHANGED',
    );
  });
});
