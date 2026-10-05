import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { StorePalletPage } from '@/features/store-pallet/StorePalletPage';
import {
  getPalletForStore,
  getRackLocation,
  storePallet,
  type RackLocation,
  type StorePallet,
  type StoredPallet,
} from '@/features/store-pallet/storePallet.api';

vi.mock('@/features/store-pallet/storePallet.api', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/store-pallet/storePallet.api')
    >();
  return {
    ...actual,
    getPalletForStore: vi.fn(),
    getRackLocation: vi.fn(),
    storePallet: vi.fn(),
  };
});

const mockGetPallet = vi.mocked(getPalletForStore);
const mockGetLocation = vi.mocked(getRackLocation);
const mockStore = vi.mocked(storePallet);

const pallet: StorePallet = {
  id: '97000000-0000-4000-8000-000000000001',
  pallet_code: 'MM-P-0004821',
  current_boxes: 31,
  current_pieces: 21_700,
  boxes_per_full_pallet_snapshot: 48,
  current_location_id: null,
  lifecycle_status: 'created',
  part: {
    part_number: 'MM-A3815',
    description: 'Fictional finished part',
  },
};

const rack: RackLocation = {
  id: '98000000-0000-4000-8000-000000000001',
  location_code: 'B-003-AC',
  location_type: 'rack',
  active: true,
  zone: 'B',
  rack: '003',
  position: 'AC',
  occupied: false,
};

const saved: StoredPallet = {
  pallet_id: pallet.id,
  pallet_code: pallet.pallet_code,
  part_number: pallet.part.part_number,
  description: pallet.part.description,
  current_boxes: 31,
  current_pieces: 21_700,
  boxes_per_full_pallet_snapshot: 48,
  lifecycle_status: 'stored',
  destination_location_id: rack.id,
  destination_location_code: rack.location_code,
  zone: rack.zone,
  rack: rack.rack,
  position: rack.position,
  stored_at: '2026-10-04T18:00:00.000Z',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StorePalletPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function reachLocation(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Pallet code'), 'mm-p-0004821');
  await user.click(screen.getByRole('button', { name: 'LOOK UP PALLET' }));
  await screen.findByText('Fictional finished part');
  await user.click(
    screen.getByRole('button', { name: 'CONTINUE TO LOCATION' }),
  );
}

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await reachLocation(user);
  await user.type(screen.getByLabelText('Rack location code'), 'b-003-ac');
  await user.click(screen.getByRole('button', { name: 'CHECK LOCATION' }));
  await screen.findByText('OPEN');
  await user.click(screen.getByRole('button', { name: 'REVIEW STORAGE' }));
}

describe('StorePalletPage', () => {
  beforeEach(() => {
    mockGetPallet.mockReset().mockResolvedValue(pallet);
    mockGetLocation.mockReset().mockResolvedValue(rack);
    mockStore.mockReset().mockResolvedValue(saved);
  });

  it('looks up pallet and rack, then reviews before storing', async () => {
    const user = userEvent.setup();
    renderPage();
    await reachReview(user);

    expect(mockGetPallet).toHaveBeenCalledWith('MM-P-0004821');
    expect(mockGetLocation).toHaveBeenCalledWith('B-003-AC');
    expect(
      screen.getByRole('heading', { name: 'Review Storage' }),
    ).toBeInTheDocument();
    expect(screen.getByText('21,700')).toBeInTheDocument();
    expect(mockStore).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'STORE PALLET' }));

    expect(
      await screen.findByRole('heading', { name: 'Pallet Stored' }),
    ).toBeInTheDocument();
    expect(screen.getByText('MM-P-0004821')).toBeInTheDocument();
    expect(screen.getByText('B-003-AC')).toBeInTheDocument();
    expect(mockStore.mock.calls[0]?.[0]).toEqual({
      palletCode: pallet.pallet_code,
      destinationLocationId: rack.id,
      idempotencyKey: expect.any(String),
    });
  });

  it('blocks an occupied rack before review', async () => {
    mockGetLocation.mockResolvedValue({ ...rack, occupied: true });
    const user = userEvent.setup();
    renderPage();
    await reachLocation(user);
    await user.type(screen.getByLabelText('Rack location code'), 'B-003-AC');
    await user.click(screen.getByRole('button', { name: 'CHECK LOCATION' }));

    expect(await screen.findByText('LOCATION OCCUPIED')).toBeInTheDocument();
    expect(screen.getByText(/already contains a pallet/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'REVIEW STORAGE' }),
    ).not.toBeInTheDocument();
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('rejects already stored pallets without offering Store', async () => {
    mockGetPallet.mockResolvedValue({ ...pallet, lifecycle_status: 'stored' });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Pallet code'), pallet.pallet_code);
    await user.click(screen.getByRole('button', { name: 'LOOK UP PALLET' }));

    expect(
      await screen.findByText('PALLET ALREADY STORED'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'CONTINUE TO LOCATION' }),
    ).not.toBeInTheDocument();
  });

  it('reuses the same idempotency key after an uncertain failure', async () => {
    mockStore
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(saved);
    const user = userEvent.setup();
    renderPage();
    await reachReview(user);
    await user.click(screen.getByRole('button', { name: 'STORE PALLET' }));

    expect(await screen.findByText('NOT SAVED YET')).toBeInTheDocument();
    const firstKey = mockStore.mock.calls[0]?.[0].idempotencyKey;
    await user.click(screen.getByRole('button', { name: 'RETRY STORE' }));

    await waitFor(() => expect(mockStore).toHaveBeenCalledTimes(2));
    expect(mockStore.mock.calls[1]?.[0].idempotencyKey).toBe(firstKey);
    expect(
      await screen.findByRole('heading', { name: 'Pallet Stored' }),
    ).toBeInTheDocument();
  });
});
