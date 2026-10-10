import { z } from 'zod';

export const shippingCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Enter a pallet code.')
  .max(100, 'Code must be 100 characters or fewer.');

export const shippingReferenceSchema = z
  .string()
  .trim()
  .max(100, 'Reference must be 100 characters or fewer.')
  .refine(hasNoControlCharacters, 'Remove control characters.');

export const shippingNoteSchema = z
  .string()
  .trim()
  .max(200, 'Note must be 200 characters or fewer.')
  .refine(hasNoControlCharacters, 'Remove control characters.');

function hasNoControlCharacters(value: string): boolean {
  return Array.from(value).every((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint >= 32 && codePoint !== 127;
  });
}

export type ShippingIssue = { title: string; message: string };

const issues: Record<string, ShippingIssue> = {
  PALLET_NOT_FOUND: {
    title: 'PALLET NOT FOUND',
    message: 'Check the pallet code and try again.',
  },
  PALLET_ON_HOLD: {
    title: 'PALLET ON HOLD',
    message: 'A supervisor must release the hold before shipping.',
  },
  ALREADY_SHIPPED: {
    title: 'ALREADY SHIPPED',
    message: 'This pallet has already left facility inventory.',
  },
  ALREADY_STAGED: {
    title: 'ALREADY STAGED',
    message: 'This pallet is already waiting in shipping staging.',
  },
  PALLET_NOT_ELIGIBLE: {
    title: 'PALLET NOT ELIGIBLE',
    message: 'Check the pallet lifecycle and physical location.',
  },
  INVALID_SHIPPING_LOCATION: {
    title: 'INVALID SHIPPING LOCATION',
    message: 'Choose an active shipping-staging location.',
  },
  INVENTORY_CHANGED: {
    title: 'INVENTORY CHANGED',
    message: 'Pallet state changed after review. Refresh and review again.',
  },
  INVALID_PALLET_QUANTITY: {
    title: 'INVALID PALLET QUANTITY',
    message: 'Stop and ask a supervisor to investigate this pallet.',
  },
  INVALID_SHIPPING_REQUEST: {
    title: 'INVALID SHIPPING REQUEST',
    message: 'Check the shipping references and review again.',
  },
  IDEMPOTENCY_KEY_CONFLICT: {
    title: 'THIS MAY ALREADY BE SAVED',
    message: 'Refresh the pallet before starting a different action.',
  },
  ACTIVE_WORKER_PROFILE_REQUIRED: {
    title: 'ACCESS REQUIRED',
    message: 'Sign in with an active worker or supervisor account.',
  },
};

export function getShippingIssue(
  error: unknown,
  context: 'lookup' | 'confirmation' = 'confirmation',
): ShippingIssue {
  if (error instanceof Error) {
    const known = issues[error.message];
    if (known) return known;
  }
  return context === 'lookup'
    ? { title: "COULDN'T LOAD", message: 'Check the connection and try again.' }
    : {
        title: 'NOT SAVED YET',
        message: 'Check the connection and retry this exact request.',
      };
}

export function sameReviewedShippingPallet(
  before: {
    current_boxes: number;
    current_pieces: number;
    current_location_id: string | null;
    lifecycle_status: string;
    inventory_version: number;
  },
  after: typeof before,
): boolean {
  return (
    before.current_boxes === after.current_boxes &&
    before.current_pieces === after.current_pieces &&
    before.current_location_id === after.current_location_id &&
    before.lifecycle_status === after.lifecycle_status &&
    before.inventory_version === after.inventory_version
  );
}
