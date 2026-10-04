import { z } from 'zod';

export const boxCountSchema = z.coerce
  .number({ error: 'Enter the number of boxes.' })
  .int('Boxes must be a whole number.')
  .positive('Boxes must be greater than zero.');

const requiredTraceField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(100, `${label} must be 100 characters or fewer.`);

export const palletDetailsSchema = z.object({
  heatNumber: requiredTraceField('Heat number'),
  lotNumber: requiredTraceField('Lot number'),
  machineCode: z
    .string()
    .trim()
    .max(100, 'Machine code must be 100 characters or fewer.')
    .optional()
    .transform((value) => value || undefined),
});

export type PalletDetails = z.infer<typeof palletDetailsSchema>;

export type PalletFillStatus = 'FULL' | 'PARTIAL';

export function calculatePieces(boxes: number, piecesPerBox: number): number {
  return boxes * piecesPerBox;
}

export function getPalletFillStatus(
  boxes: number,
  boxesPerFullPallet: number,
): PalletFillStatus {
  return boxes >= boxesPerFullPallet ? 'FULL' : 'PARTIAL';
}

export function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat('en-US').format(quantity);
}
