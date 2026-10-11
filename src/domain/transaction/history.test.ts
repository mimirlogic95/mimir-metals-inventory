import {
  formatHistoryTimestamp,
  formatSignedQuantity,
  historyCodeSchema,
  historyEventMeaning,
  historyEventTitle,
  matchedCount,
  shipmentQuantity,
  type HistoryEvent,
} from '@/domain/transaction/history';

const event: HistoryEvent = {
  id: '97000000-0000-4000-8000-000000000001',
  transactionType: 'count_matched',
  occurredAt: '2026-10-10T12:00:00Z',
  actorName: 'Fictional Worker',
  previousBoxes: 31,
  boxChange: 0,
  newBoxes: 31,
  previousPieces: 21_700,
  pieceChange: 0,
  newPieces: 21_700,
  previousLocationCode: 'B-001-AA',
  newLocationCode: 'B-001-AA',
  poReference: null,
  bolReference: null,
  reasonNotes: null,
  adjustment: null,
};

describe('History domain', () => {
  it('normalizes manual and reload-safe pallet codes without a fixed brand prefix', () => {
    expect(historyCodeSchema.parse('  mm-p-0000033  ')).toBe('MM-P-0000033');
    expect(historyCodeSchema.parse('other-42')).toBe('OTHER-42');
    expect(historyCodeSchema.safeParse('bad,code').success).toBe(false);
  });

  it('maps every current transaction type and safely handles a future type', () => {
    expect(historyEventTitle('pallet_created')).toBe('Pallet Created');
    expect(historyEventTitle('stored')).toBe('Pallet Stored');
    expect(historyEventTitle('box_pull')).toBe('Boxes Pulled');
    expect(historyEventTitle('moved')).toBe('Pallet Moved');
    expect(historyEventTitle('count_matched')).toBe('Physical Count Matched');
    expect(historyEventTitle('adjustment_requested')).toBe(
      'Adjustment Requested',
    );
    expect(historyEventTitle('adjustment_approved')).toBe(
      'Adjustment Approved',
    );
    expect(historyEventTitle('adjustment_rejected')).toBe(
      'Adjustment Rejected',
    );
    expect(historyEventTitle('shipping_staging')).toBe(
      'Moved to Shipping Staging',
    );
    expect(historyEventTitle('shipped')).toBe('Pallet Shipped');
    expect(historyEventTitle('hold_placed')).toBe('Hold Placed');
    expect(historyEventTitle('hold_released')).toBe('Hold Released');
    expect(historyEventTitle('label_printed')).toBe('Label Printed');
    expect(historyEventTitle('future_event')).toBe('Inventory Event Recorded');
  });

  it('distinguishes Count evidence and requested/rejected changes from approval', () => {
    expect(historyEventMeaning('count_matched')).toContain('did not change');
    expect(historyEventMeaning('adjustment_requested')).toContain(
      'did not change',
    );
    expect(historyEventMeaning('adjustment_rejected')).toContain(
      'did not change',
    );
    expect(historyEventMeaning('adjustment_approved')).toContain('applied');
    expect(matchedCount(event)).toEqual({
      counted_boxes: 31,
      counted_pieces: 21_700,
    });
    expect(matchedCount({ ...event, previousBoxes: null })).toBeNull();
    expect(
      matchedCount({ ...event, transactionType: 'adjustment_requested' }),
    ).toBeNull();
  });

  it('distinguishes storage and staging from dispatch', () => {
    expect(historyEventMeaning('stored')).toContain('Location changed');
    expect(historyEventMeaning('moved')).toContain('Location changed');
    expect(historyEventMeaning('shipping_staging')).toContain('Not dispatched');
    expect(historyEventMeaning('shipped')).toContain('left facility inventory');
    expect(shipmentQuantity({ ...event, transactionType: 'shipped' })).toEqual({
      boxes: 31,
      pieces: 21_700,
    });
    expect(shipmentQuantity(event)).toBeNull();
  });

  it('formats signed deltas and a database timestamp with an explicit local zone', () => {
    expect(formatSignedQuantity(-2_800)).toBe('−2,800');
    expect(formatSignedQuantity(2_800)).toBe('+2,800');
    expect(formatSignedQuantity(0)).toBe('0');
    expect(formatHistoryTimestamp('2026-10-10T12:00:00Z', 'UTC')).toContain(
      'UTC',
    );
    expect(formatHistoryTimestamp('invalid', 'UTC')).toBe('Date unavailable');
  });
});
