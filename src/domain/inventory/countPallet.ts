import { z } from 'zod';

export const countPalletCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Enter a pallet code.')
  .max(100, 'Pallet code must be 100 characters or fewer.');

export const countedBoxesSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)$/, 'Enter a whole number of boxes, including zero.')
  .transform(Number)
  .pipe(z.number().int().safe().max(2147483647));

export const reasonCodes = [
  'unrecorded_shipping_pull',
  'damaged_product',
  'packing_correction',
  'count_error',
  'other',
] as const;

export type CountIssue = { title: string; message: string };
export type CountPreview = {
  countedBoxes: number;
  countedPieces: number;
  boxDifference: number;
  pieceDifference: number;
  matches: boolean;
};

const issues: Record<string, CountIssue> = {
  PALLET_NOT_FOUND: {
    title: 'PALLET NOT FOUND',
    message: 'Check the pallet code and try again.',
  },
  PALLET_SHIPPED: {
    title: 'PALLET SHIPPED',
    message: 'A shipped pallet cannot be counted.',
  },
  PALLET_NOT_COUNTABLE: {
    title: 'PALLET NOT COUNTABLE',
    message:
      'Count applies to positive-balance rack inventory, including held rack pallets.',
  },
  INVENTORY_CHANGED: {
    title: 'INVENTORY CHANGED',
    message:
      'The pallet changed since you started counting. Refresh and try again.',
  },
  ADJUSTMENT_ALREADY_PENDING: {
    title: 'ADJUSTMENT ALREADY PENDING',
    message:
      'This pallet already has a count discrepancy waiting for supervisor review.',
  },
  INVALID_COUNT: {
    title: 'INVALID COUNT',
    message: 'Enter a nonnegative whole number of boxes within pallet limits.',
  },
  REASON_REQUIRED: {
    title: 'REASON REQUIRED',
    message: 'Choose a reason for the count difference.',
  },
  NOTE_TOO_LONG: {
    title: 'NOTE TOO LONG',
    message: 'Use 200 characters or fewer.',
  },
  IDEMPOTENCY_KEY_CONFLICT: {
    title: 'REQUEST CHANGED',
    message: 'Refresh the pallet before starting a different count.',
  },
};

export function getCountIssue(
  error: unknown,
  context: 'lookup' | 'confirmation' = 'confirmation',
): CountIssue {
  const known = error instanceof Error ? issues[error.message] : undefined;
  if (known) return known;
  return context === 'lookup'
    ? { title: "COULDN'T LOAD", message: 'Check the connection and try again.' }
    : {
        title: 'NOT SAVED YET',
        message:
          'The result could not be confirmed. Retry this same Count request.',
      };
}

export function calculateCountPreview(
  systemBoxes: number,
  systemPieces: number,
  piecesPerBoxSnapshot: number,
  input: string,
): { preview: CountPreview | null; issue: CountIssue | null } {
  const parsed = countedBoxesSchema.safeParse(input);
  if (!parsed.success) return { preview: null, issue: issues.INVALID_COUNT! };
  const countedPieces = parsed.data * piecesPerBoxSnapshot;
  const pieceDifference = countedPieces - systemPieces;
  if (
    !Number.isSafeInteger(countedPieces) ||
    countedPieces > 2147483647 ||
    !Number.isSafeInteger(pieceDifference) ||
    pieceDifference < -2147483648 ||
    pieceDifference > 2147483647
  )
    return { preview: null, issue: issues.INVALID_COUNT! };
  return {
    preview: {
      countedBoxes: parsed.data,
      countedPieces,
      boxDifference: parsed.data - systemBoxes,
      pieceDifference,
      matches: parsed.data === systemBoxes,
    },
    issue: null,
  };
}

export function formatSignedQuantity(value: number): string {
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();
}
