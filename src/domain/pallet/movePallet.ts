import { z } from 'zod';

export const moveCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Enter a code.')
  .max(100, 'Code must be 100 characters or fewer.');

export type MoveIssue = { title: string; message: string };

const issues: Record<string, MoveIssue> = {
  PALLET_NOT_FOUND: {
    title: 'PALLET NOT FOUND',
    message: 'Check the pallet code and try again.',
  },
  PALLET_NOT_STORED: {
    title: 'PALLET NOT STORED',
    message:
      'Only stored rack pallets can be moved. Use Store for a created pallet.',
  },
  PALLET_ON_HOLD: {
    title: 'PALLET ON HOLD',
    message: 'A supervisor must release the hold before this pallet can move.',
  },
  PALLET_SHIPPED: {
    title: 'PALLET SHIPPED',
    message: 'A shipped pallet cannot be moved.',
  },
  LOCATION_NOT_FOUND: {
    title: 'LOCATION NOT FOUND',
    message: 'Check the rack code and try again.',
  },
  LOCATION_INACTIVE: {
    title: 'LOCATION INACTIVE',
    message: 'Choose an active rack.',
  },
  LOCATION_NOT_A_RACK: {
    title: 'RACK REQUIRED',
    message: 'Move Pallet accepts rack destinations only.',
  },
  SAME_LOCATION: {
    title: 'SAME LOCATION',
    message: 'Choose a different rack.',
  },
  LOCATION_OCCUPIED: {
    title: 'LOCATION OCCUPIED',
    message: 'This rack already contains a pallet. Choose another location.',
  },
  LOCATION_CHANGED: {
    title: 'LOCATION CHANGED',
    message:
      'This pallet is no longer in the rack you reviewed. Refresh and try again.',
  },
  IDEMPOTENCY_KEY_CONFLICT: {
    title: 'THIS MAY ALREADY BE SAVED',
    message: 'Refresh the pallet before starting a different move.',
  },
};

export function getMoveIssue(
  error: unknown,
  context: 'lookup' | 'confirmation' = 'confirmation',
): MoveIssue {
  if (error instanceof Error) {
    const knownIssue = issues[error.message];
    if (knownIssue) return knownIssue;
  }
  if (context === 'lookup') {
    return {
      title: "COULDN'T LOAD",
      message: 'Check the connection and try again.',
    };
  }
  return {
    title: 'NOT SAVED YET',
    message: 'Check the connection and retry this same Move request.',
  };
}
