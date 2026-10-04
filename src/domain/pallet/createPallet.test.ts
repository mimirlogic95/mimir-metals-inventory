import {
  calculatePieces,
  getPalletFillStatus,
} from '@/domain/pallet/createPallet';

describe('Create Pallet calculations', () => {
  it('calculates the piece preview from boxes and pieces per box', () => {
    expect(calculatePieces(31, 700)).toBe(21_700);
  });

  it.each([
    [48, 48, 'FULL'],
    [49, 48, 'FULL'],
    [31, 48, 'PARTIAL'],
    [1, 48, 'PARTIAL'],
  ] as const)(
    'derives %s boxes against %s full-pallet boxes as %s',
    (boxes, fullPalletBoxes, expected) => {
      expect(getPalletFillStatus(boxes, fullPalletBoxes)).toBe(expected);
    },
  );
});
