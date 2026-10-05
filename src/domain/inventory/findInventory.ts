import type {
  FindPart,
  FindPallet,
} from '@/features/find-inventory/findInventory.api';

export function matchingParts(parts: FindPart[], input: string): FindPart[] {
  const text = input.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!text) return parts;

  const compact = text.replace(/[^a-z0-9]/g, '');
  return parts.filter((part) => {
    const number = part.part_number.toLowerCase();
    const description = part.description.toLowerCase().replace(/\s+/g, ' ');
    return (
      number.includes(text) ||
      (compact.length > 0 &&
        number.replace(/[^a-z0-9]/g, '').includes(compact)) ||
      description.includes(text)
    );
  });
}

export function availableInventoryTotals(pallets: FindPallet[]) {
  return pallets.reduce(
    (totals, pallet) => ({
      pallets: totals.pallets + 1,
      boxes: totals.boxes + pallet.current_boxes,
      pieces: totals.pieces + pallet.current_pieces,
    }),
    { pallets: 0, boxes: 0, pieces: 0 },
  );
}
