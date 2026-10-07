import { z } from 'zod';

export const pullPalletCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Enter a pallet code.')
  .max(100, 'Pallet code must be 100 characters or fewer.');

export const pullBoxesInputSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/, 'Enter a positive whole number of boxes.')
  .transform(Number)
  .pipe(z.number().int().safe().max(2147483647));

export const optionalReferenceSchema = z
  .string()
  .trim()
  .max(100, 'Reference must be 100 characters or fewer.')
  .transform((value) => value || null);

export type PullPreview = {
  boxesRemoved: number;
  piecesRemoved: number;
  remainingBoxes: number;
  remainingPieces: number;
};

export type PullIssue = { title: string; message: string };

const issues: Record<string, PullIssue> = {
  PALLET_NOT_FOUND: {
    title: 'PALLET NOT FOUND',
    message: 'Check the pallet code and try again.',
  },
  PALLET_ON_HOLD: {
    title: 'PALLET ON HOLD',
    message:
      'A supervisor must release this pallet before boxes can be pulled.',
  },
  PALLET_SHIPPED: {
    title: 'PALLET SHIPPED',
    message: 'A shipped pallet cannot be pulled again.',
  },
  PALLET_NOT_READY_TO_PULL: {
    title: 'PALLET NOT READY',
    message: 'Only stored rack pallets can use Pull Boxes.',
  },
  NO_INVENTORY: {
    title: 'NO INVENTORY',
    message: 'This pallet has no boxes available to pull.',
  },
  INVALID_PULL_QUANTITY: {
    title: 'INVALID QUANTITY',
    message: 'Enter a positive whole number of boxes.',
  },
  TOO_MANY_BOXES: {
    title: 'TOO MANY BOXES',
    message: 'Choose fewer boxes than the current pallet balance.',
  },
  WHOLE_PALLET_USE_SHIPPING: {
    title: 'WHOLE PALLET — USE SHIPPING',
    message: 'The final boxes belong in the Shipping workflow.',
  },
  INVENTORY_CHANGED: {
    title: 'INVENTORY CHANGED',
    message:
      'Refresh the pallet and review the new balance before trying again.',
  },
  IDEMPOTENCY_KEY_CONFLICT: {
    title: 'REQUEST CHANGED',
    message: 'Refresh the pallet before starting a different pull.',
  },
  REFERENCE_TOO_LONG: {
    title: 'REFERENCE TOO LONG',
    message: 'Use 100 characters or fewer for PO and BOL references.',
  },
};

export function getPullIssue(error: unknown): PullIssue {
  const issue = error instanceof Error ? issues[error.message] : undefined;
  if (issue) {
    return issue;
  }
  return {
    title: 'NOT SAVED YET',
    message: 'The result could not be confirmed. Retry this same request.',
  };
}

export function calculatePullPreview(
  currentBoxes: number,
  currentPieces: number,
  piecesPerBoxSnapshot: number,
  boxesInput: string,
): { preview: PullPreview | null; issue: PullIssue | null } {
  const parsed = pullBoxesInputSchema.safeParse(boxesInput);
  if (!parsed.success) {
    return { preview: null, issue: issues.INVALID_PULL_QUANTITY! };
  }
  const boxesRemoved = parsed.data;
  if (boxesRemoved > currentBoxes) {
    return { preview: null, issue: issues.TOO_MANY_BOXES! };
  }
  if (boxesRemoved === currentBoxes) {
    return { preview: null, issue: issues.WHOLE_PALLET_USE_SHIPPING! };
  }
  const piecesRemoved = boxesRemoved * piecesPerBoxSnapshot;
  const remainingPieces = currentPieces - piecesRemoved;
  if (
    !Number.isSafeInteger(piecesRemoved) ||
    piecesRemoved > 2147483647 ||
    !Number.isSafeInteger(remainingPieces) ||
    remainingPieces < 0
  ) {
    return { preview: null, issue: issues.INVALID_PULL_QUANTITY! };
  }
  return {
    preview: {
      boxesRemoved,
      piecesRemoved,
      remainingBoxes: currentBoxes - boxesRemoved,
      remainingPieces,
    },
    issue: null,
  };
}
