import {
  calculatePullPreview,
  getPullIssue,
  optionalReferenceSchema,
  pullBoxesInputSchema,
  pullPalletCodeSchema,
} from '@/domain/inventory/pullBoxes';

describe('Pull Boxes preview and validation', () => {
  it('uses the pallet snapshot for a partial pull', () => {
    expect(calculatePullPreview(31, 21_700, 700, '6')).toEqual({
      preview: {
        boxesRemoved: 6,
        piecesRemoved: 4_200,
        remainingBoxes: 25,
        remainingPieces: 17_500,
      },
      issue: null,
    });
  });

  it('rejects invalid, excessive, and final-box pulls', () => {
    for (const input of ['0', '-1', '1.5', 'abc', '2147483648']) {
      expect(calculatePullPreview(31, 21_700, 700, input).preview).toBeNull();
    }
    expect(calculatePullPreview(31, 21_700, 700, '32').issue?.title).toBe(
      'TOO MANY BOXES',
    );
    expect(calculatePullPreview(31, 21_700, 700, '31').issue?.title).toBe(
      'WHOLE PALLET — USE SHIPPING',
    );
    expect(pullBoxesInputSchema.safeParse('3.0').success).toBe(false);
  });

  it('rejects preview arithmetic overflow and trims optional references', () => {
    expect(
      calculatePullPreview(4, 2_147_483_647, 1_073_741_824, '2').preview,
    ).toBeNull();
    expect(optionalReferenceSchema.parse('  PO-TEST  ')).toBe('PO-TEST');
    expect(optionalReferenceSchema.parse('  ')).toBeNull();
    expect(optionalReferenceSchema.safeParse('x'.repeat(101)).success).toBe(
      false,
    );
  });

  it('accepts a non-Mimir pallet code without embedding company rules', () => {
    expect(pullPalletCodeSchema.parse('  TEST-PALLET-1  ')).toBe(
      'TEST-PALLET-1',
    );
    expect(pullPalletCodeSchema.parse('  test-pallet-1  ')).toBe(
      'TEST-PALLET-1',
    );
    expect(getPullIssue(new Error('INVENTORY_CHANGED')).title).toBe(
      'INVENTORY CHANGED',
    );
    expect(getPullIssue(new Error('network lost')).title).toBe('NOT SAVED YET');
  });
});
