import { z } from 'zod';

import type { Database } from '@/types/database.generated';

type TransactionType =
  Database['public']['Enums']['inventory_transaction_type'];

export const historyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Enter a pallet code.')
  .max(100, 'Code must be 100 characters or fewer.')
  .regex(/^[A-Z0-9-]+$/, 'Enter a valid pallet code.');

export type HistoryAdjustment = {
  status: 'pending' | 'approved' | 'rejected';
  countedBoxes: number;
  boxDifference: number;
  countedPieces: number;
  pieceDifference: number;
  reasonNotes: string | null;
  reviewNotes: string | null;
};

export type HistoryEvent = {
  id: string;
  transactionType: string;
  occurredAt: string;
  actorName: string | null;
  previousBoxes: number | null;
  boxChange: number | null;
  newBoxes: number | null;
  previousPieces: number | null;
  pieceChange: number | null;
  newPieces: number | null;
  previousLocationCode: string | null;
  newLocationCode: string | null;
  poReference: string | null;
  bolReference: string | null;
  reasonNotes: string | null;
  adjustment: HistoryAdjustment | null;
};

const titles: Record<TransactionType, string> = {
  pallet_created: 'Pallet Created',
  label_printed: 'Label Printed',
  stored: 'Pallet Stored',
  box_pull: 'Boxes Pulled',
  moved: 'Pallet Moved',
  count_matched: 'Physical Count Matched',
  adjustment_requested: 'Adjustment Requested',
  adjustment_approved: 'Adjustment Approved',
  adjustment_rejected: 'Adjustment Rejected',
  hold_placed: 'Hold Placed',
  hold_released: 'Hold Released',
  shipping_staging: 'Moved to Shipping Staging',
  shipped: 'Pallet Shipped',
};

export function historyEventTitle(type: string): string {
  return Object.hasOwn(titles, type)
    ? titles[type as TransactionType]
    : 'Inventory Event Recorded';
}

export function historyEventMeaning(type: string): string {
  switch (type) {
    case 'pallet_created':
      return 'Original pallet quantity entered facility inventory.';
    case 'box_pull':
      return 'Boxes were removed from this pallet.';
    case 'adjustment_approved':
      return 'A supervisor applied an inventory correction.';
    case 'shipped':
      return 'The remaining quantity left facility inventory.';
    case 'stored':
    case 'moved':
      return 'Location changed. Inventory quantity did not change.';
    case 'shipping_staging':
      return 'Moved to shipping staging. Not dispatched; inventory quantity did not change.';
    case 'count_matched':
      return 'A physical count matched the system. Inventory quantity did not change.';
    case 'adjustment_requested':
      return 'A count difference was reported. Inventory quantity did not change.';
    case 'adjustment_rejected':
      return 'A supervisor declined the request. Inventory quantity did not change.';
    case 'hold_placed':
    case 'hold_released':
      return 'Hold status changed. Inventory quantity did not change.';
    case 'label_printed':
      return 'A label was printed. Inventory quantity did not change.';
    default:
      return 'Recorded pallet activity. Review the saved quantities below.';
  }
}

export function formatSignedQuantity(value: number): string {
  const quantity = new Intl.NumberFormat('en-US').format(Math.abs(value));
  return value > 0 ? `+${quantity}` : value < 0 ? `−${quantity}` : '0';
}

export function formatHistoryTimestamp(
  value: string,
  timeZone?: string,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function matchedCount(event: HistoryEvent) {
  if (event.transactionType !== 'count_matched') return null;
  // A matched Count saves the observed quantity as its before/after values.
  if (event.previousBoxes !== null && event.previousPieces !== null) {
    return {
      counted_boxes: event.previousBoxes,
      counted_pieces: event.previousPieces,
    };
  }
  return null;
}

export function shipmentQuantity(event: HistoryEvent) {
  if (event.transactionType !== 'shipped') return null;
  if (event.previousBoxes === null || event.previousPieces === null)
    return null;
  return { boxes: event.previousBoxes, pieces: event.previousPieces };
}
