import {
  getShippingIssue,
  sameReviewedShippingPallet,
  shippingCodeSchema,
  shippingReferenceSchema,
} from '@/domain/inventory/shipping';

describe('shipping input and review rules', () => {
  it('normalizes pallet codes and trims references without changing their case', () => {
    expect(shippingCodeSchema.parse(' mm-p-0000023 ')).toBe('MM-P-0000023');
    expect(shippingReferenceSchema.parse(' po-42 ')).toBe('po-42');
  });

  it('rejects oversized and control-character references', () => {
    expect(shippingReferenceSchema.safeParse('A'.repeat(101)).success).toBe(
      false,
    );
    expect(shippingReferenceSchema.safeParse('PO\n42').success).toBe(false);
  });

  it('detects intervening pallet changes even if visible quantities are unchanged', () => {
    const before = {
      current_boxes: 31,
      current_pieces: 21700,
      current_location_id: 'rack-a',
      lifecycle_status: 'stored',
      inventory_version: 3,
    };
    expect(
      sameReviewedShippingPallet(before, { ...before, inventory_version: 5 }),
    ).toBe(false);
    expect(sameReviewedShippingPallet(before, before)).toBe(true);
  });

  it('distinguishes a failed read from an uncertain confirmation', () => {
    expect(getShippingIssue(new Error('NETWORK'), 'lookup').title).toBe(
      "COULDN'T LOAD",
    );
    expect(getShippingIssue(new Error('NETWORK')).title).toBe('NOT SAVED YET');
    expect(getShippingIssue(new Error('PALLET_ON_HOLD')).title).toBe(
      'PALLET ON HOLD',
    );
  });
});
