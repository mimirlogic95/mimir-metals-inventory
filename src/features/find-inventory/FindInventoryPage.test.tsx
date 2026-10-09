import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { FindInventoryPage } from '@/features/find-inventory/FindInventoryPage';
import {
  getFindInventory,
  getFindParts,
  type FindInventory,
  type FindPallet,
} from '@/features/find-inventory/findInventory.api';

vi.mock(
  '@/features/find-inventory/findInventory.api',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@/features/find-inventory/findInventory.api')
      >();
    return { ...actual, getFindParts: vi.fn(), getFindInventory: vi.fn() };
  },
);

const mockParts = vi.mocked(getFindParts);
const mockInventory = vi.mocked(getFindInventory);
const part = {
  id: '96000000-0000-4000-8000-000000000001',
  part_number: 'MM-A3815',
  description: '3/8 x 1-5/8 Headed Anchor',
};
const older: FindPallet = {
  id: '97000000-0000-4000-8000-000000000001',
  pallet_code: 'MM-P-0000007',
  current_boxes: 31,
  current_pieces: 21_700,
  boxes_per_full_pallet_snapshot: 48,
  packed_at: '2026-10-01T12:00:00Z',
  created_at: '2026-10-01T12:00:00Z',
  heat_number: 'M6-FICTIONAL-HEAT',
  lot_number: 'M6-FICTIONAL-LOT',
  machine_code: 'M6-FICTIONAL-MACHINE',
  lifecycle_status: 'stored',
  location: { location_code: 'B-001-AC', location_type: 'rack' },
};
const newer: FindPallet = {
  ...older,
  id: '97000000-0000-4000-8000-000000000002',
  pallet_code: 'MM-P-0000008',
  current_boxes: 48,
  current_pieces: 33_600,
  packed_at: '2026-10-02T12:00:00Z',
  created_at: '2026-10-02T12:00:00Z',
  location: { location_code: 'B-002-AC', location_type: 'rack' },
};
const inventory: FindInventory = {
  pallets: [older, newer],
  heldPalletCount: 1,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FindInventoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectPart(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('button', { name: /MM-A3815/ });
  await user.click(screen.getByRole('button', { name: /MM-A3815/ }));
}

describe('FindInventoryPage', () => {
  beforeEach(() => {
    mockParts.mockReset().mockResolvedValue([
      part,
      {
        id: '96000000-0000-4000-8000-000000000002',
        part_number: 'MM-SC343',
        description: 'Fictional Shear Connector',
      },
    ]);
    mockInventory.mockReset().mockResolvedValue(inventory);
  });

  it('searches by number or description and shows no matching parts', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: /MM-A3815/ });
    const input = screen.getByRole('searchbox', {
      name: 'Part number or description',
    });
    await user.type(input, '3815');
    expect(
      screen.getByRole('button', { name: /MM-A3815/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /MM-SC343/ }),
    ).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'headed anchor');
    expect(
      screen.getByRole('button', { name: /MM-A3815/ }),
    ).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'unlisted');
    expect(screen.getByText('NO MATCHING PARTS')).toBeInTheDocument();
  });

  it('shows server-ordered FIFO, totals, locations, fill, held notice, and detail', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPart(user);
    const summary = await screen.findByRole('region', {
      name: 'Available inventory summary',
    });
    expect(within(summary).getByText('2')).toBeInTheDocument();
    expect(within(summary).getByText('79')).toBeInTheDocument();
    expect(within(summary).getByText('55,300')).toBeInTheDocument();
    expect(screen.getByText(/Held inventory exists/)).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Pallets in FIFO order' });
    const cards = within(list).getAllByRole('button');
    expect(cards).toHaveLength(2);
    const [first, second] = cards;
    if (!first || !second) throw new Error('Expected two pallet cards.');
    expect(within(first).getByText('PULL FIRST')).toBeInTheDocument();
    expect(within(first).getByText('B-001-AC')).toBeInTheDocument();
    expect(within(first).getByText(/PARTIAL/)).toBeInTheDocument();
    expect(within(second).getByText('B-002-AC')).toBeInTheDocument();
    expect(within(second).getByText(/FULL/)).toBeInTheDocument();
    expect(within(second).queryByText('PULL FIRST')).not.toBeInTheDocument();
    await user.click(first);
    const detail = screen.getByRole('region', { name: 'Pallet details' });
    expect(within(detail).getByText('M6-FICTIONAL-HEAT')).toBeInTheDocument();
    expect(within(detail).getByText('M6-FICTIONAL-LOT')).toBeInTheDocument();
    expect(
      within(detail).getByText('M6-FICTIONAL-MACHINE'),
    ).toBeInTheDocument();
    expect(within(detail).getByText('PULL FIRST')).toBeInTheDocument();
    expect(within(detail).getByText('STORED')).toBeInTheDocument();
    expect(
      within(detail).getByRole('link', { name: 'PULL BOXES' }),
    ).toHaveAttribute('href', '/pull?code=MM-P-0000007');
    expect(
      within(detail).getByRole('link', { name: 'MOVE PALLET' }),
    ).toHaveAttribute('href', '/move?code=MM-P-0000007');
    expect(
      within(detail).getByRole('link', { name: 'COUNT INVENTORY' }),
    ).toHaveAttribute('href', '/count?code=MM-P-0000007');
  });

  it('shows no available inventory without including held pallets', async () => {
    mockInventory.mockResolvedValue({ pallets: [], heldPalletCount: 1 });
    const user = userEvent.setup();
    renderPage();
    await selectPart(user);
    expect(
      await screen.findByText('NO AVAILABLE INVENTORY'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Held inventory exists/)).toBeInTheDocument();
    expect(screen.queryByText('PULL FIRST')).not.toBeInTheDocument();
  });

  it('hides stale results on refresh failure and allows a retry', async () => {
    const user = userEvent.setup();
    renderPage();
    await selectPart(user);
    await screen.findByText('PULL FIRST');
    mockInventory
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(inventory);
    await user.click(screen.getByRole('button', { name: 'REFRESH INVENTORY' }));
    expect(
      await screen.findByText('INVENTORY MAY HAVE CHANGED'),
    ).toBeInTheDocument();
    expect(screen.queryByText('PULL FIRST')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'REFRESH INVENTORY' }));
    expect(await screen.findByText('PULL FIRST')).toBeInTheDocument();
    expect(mockInventory).toHaveBeenCalledTimes(3);
  });

  it('shows a load error instead of raw database detail', async () => {
    mockInventory.mockRejectedValue(new Error('PostgreSQL internal error'));
    const user = userEvent.setup();
    renderPage();
    await selectPart(user);
    expect(
      await screen.findByText('UNABLE TO LOAD INVENTORY'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('PostgreSQL internal error'),
    ).not.toBeInTheDocument();
  });
});
