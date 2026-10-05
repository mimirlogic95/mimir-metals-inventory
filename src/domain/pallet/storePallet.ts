import { z } from 'zod';

export const palletCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^MM-P-\d{7}$/, 'Enter a pallet code such as MM-P-0004821.');

export const locationCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Enter a rack location code.')
  .max(100, 'Location code must be 100 characters or fewer.');

export type StoreIssue = {
  title: string;
  message: string;
};

const storeIssues: Record<string, StoreIssue> = {
  PALLET_NOT_FOUND: {
    title: 'PALLET NOT FOUND',
    message: 'Check the pallet code and try again.',
  },
  PALLET_ALREADY_STORED: {
    title: 'PALLET ALREADY STORED',
    message: 'Use Move Pallet to change its rack location later.',
  },
  PALLET_SHIPPED: {
    title: 'PALLET SHIPPED',
    message: 'A shipped pallet cannot be stored.',
  },
  PALLET_ON_HOLD: {
    title: 'PALLET ON HOLD',
    message: 'Ask a supervisor to release the hold before storage.',
  },
  PALLET_NOT_READY_TO_STORE: {
    title: 'PALLET NOT READY TO STORE',
    message:
      'This pallet cannot enter warehouse storage from its current state.',
  },
  LOCATION_NOT_FOUND: {
    title: 'LOCATION NOT FOUND',
    message: 'Check the rack code and try again.',
  },
  LOCATION_UNAVAILABLE: {
    title: 'LOCATION UNAVAILABLE',
    message: 'Choose an active rack location.',
  },
  LOCATION_NOT_A_RACK: {
    title: 'RACK REQUIRED',
    message: 'Store Pallet accepts warehouse rack locations only.',
  },
  LOCATION_OCCUPIED: {
    title: 'LOCATION OCCUPIED',
    message: 'Scan another location.',
  },
  IDEMPOTENCY_KEY_CONFLICT: {
    title: 'THIS MAY ALREADY BE SAVED',
    message: 'Check the pallet before trying a different storage request.',
  },
};

export function getStoreIssue(error: unknown): StoreIssue | null {
  if (!(error instanceof Error)) {
    return null;
  }

  return storeIssues[error.message] ?? null;
}
