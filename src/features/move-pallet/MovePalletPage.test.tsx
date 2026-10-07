import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { MovePalletPage } from '@/features/move-pallet/MovePalletPage';
import {
  getMoveRack,
  getPalletForMove,
  movePallet,
  type MovePallet,
  type MoveRack,
  type MoveResult,
} from '@/features/move-pallet/movePallet.api';

vi.mock('@/features/move-pallet/movePallet.api', () => ({
  getPalletForMove: vi.fn(),
  getMoveRack: vi.fn(),
  movePallet: vi.fn(),
}));

const mockPallet = vi.mocked(getPalletForMove);
const mockRack = vi.mocked(getMoveRack);
const mockMove = vi.mocked(movePallet);
const sourceId = '98800000-0000-4000-8000-000000000001';
const destinationId = '98800000-0000-4000-8000-000000000002';
const pallet: MovePallet = {
  id: '97800000-0000-4000-8000-000000000001',
  pallet_code: 'MM-P-0000008',
  current_location_id: sourceId,
  current_boxes: 31,
  current_pieces: 21700,
  boxes_per_full_pallet_snapshot: 48,
  lifecycle_status: 'stored',
  part: { part_number: 'MM-A3815', description: 'Fictional Anchor' },
  location: { location_code: 'B-001-AB', location_type: 'rack' },
};
const rack: MoveRack = {
  id: destinationId,
  location_code: 'B-003-AC',
  location_type: 'rack',
  active: true,
  occupied: false,
};
const saved: MoveResult = {
  pallet_id: pallet.id,
  pallet_code: pallet.pallet_code,
  part_number: pallet.part.part_number,
  description: pallet.part.description,
  previous_location_id: sourceId,
  previous_location_code: 'B-001-AB',
  destination_location_id: destinationId,
  destination_location_code: 'B-003-AC',
  current_boxes: 31,
  current_pieces: 21700,
  boxes_per_full_pallet_snapshot: 48,
  lifecycle_status: 'stored',
  transaction_id: '97800000-0000-4000-8000-000000000099',
  moved_at: '2026-10-07T12:00:00Z',
};

function renderPage(initialEntry = '/move') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/move" element={<MovePalletPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function reachRack(
  user: ReturnType<typeof userEvent.setup>,
  initialEntry = '/move',
) {
  renderPage(initialEntry);
  if (initialEntry === '/move') {
    await user.type(
      screen.getByRole('textbox', { name: 'Pallet code' }),
      'mm-p-0000008',
    );
    await user.click(screen.getByRole('button', { name: 'LOOK UP PALLET' }));
  }
  expect(await screen.findByText('B-001-AB')).toBeInTheDocument();
  await user.type(
    screen.getByRole('textbox', { name: 'Destination rack code' }),
    'b-003-ac',
  );
  await user.click(screen.getByRole('button', { name: 'CHECK RACK' }));
}

describe('MovePalletPage', () => {
  beforeEach(() => {
    mockPallet.mockReset().mockResolvedValue(pallet);
    mockRack.mockReset().mockResolvedValue(rack);
    mockMove.mockReset().mockResolvedValue(saved);
  });

  it('resolves lowercase manual pallet and rack codes, reviews, then displays only server-returned success', async () => {
    const user = userEvent.setup();
    await reachRack(user);
    expect(mockPallet).toHaveBeenCalledWith('MM-P-0000008');
    expect(mockRack).toHaveBeenCalledWith('B-003-AC');
    expect(mockMove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'REVIEW MOVE' }));
    const review = await screen.findByText('Review Move');
    expect(review).toBeInTheDocument();
    expect(screen.getByText('B-001-AB')).toBeInTheDocument();
    expect(screen.getByText('B-003-AC')).toBeInTheDocument();
    expect(screen.getByText('21,700')).toBeInTheDocument();
    expect(mockMove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'CONFIRM MOVE' }));
    expect(
      await screen.findByRole('heading', { name: 'Pallet Moved' }),
    ).toBeInTheDocument();
    const request = mockMove.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      palletCode: 'MM-P-0000008',
      expectedCurrentLocationId: sourceId,
      destinationLocationId: destinationId,
    });
    expect(request?.idempotencyKey).toBeTruthy();
    expect(screen.getAllByText('B-003-AC')).toHaveLength(1);
  });

  it('preselects a Find pallet via reload-safe URL', async () => {
    const user = userEvent.setup();
    await reachRack(user, '/move?code=mm-p-0000008');
    expect(mockPallet).toHaveBeenCalledWith('MM-P-0000008');
    expect(screen.getByText('OPEN')).toBeInTheDocument();
  });

  it('blocks an occupied rack before review', async () => {
    mockRack.mockResolvedValue({ ...rack, occupied: true });
    const user = userEvent.setup();
    await reachRack(user);
    expect(await screen.findAllByText('LOCATION OCCUPIED')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'REVIEW MOVE' }),
    ).not.toBeInTheDocument();
    expect(mockMove).not.toHaveBeenCalled();
  });

  it('shows a read error, not a save error, when pallet lookup fails', async () => {
    mockPallet.mockRejectedValue(new Error('PALLET_LOOKUP_FAILED'));
    renderPage('/move?code=MM-P-0000008');
    expect(await screen.findByText("COULDN'T LOAD")).toBeInTheDocument();
    expect(screen.queryByText('NOT SAVED YET')).not.toBeInTheDocument();
    expect(mockMove).not.toHaveBeenCalled();
  });

  it('shows a read error, not a save error, when rack lookup fails', async () => {
    mockRack.mockRejectedValue(new Error('LOCATION_LOOKUP_FAILED'));
    const user = userEvent.setup();
    await reachRack(user);
    expect(await screen.findByText("COULDN'T LOAD")).toBeInTheDocument();
    expect(screen.queryByText('NOT SAVED YET')).not.toBeInTheDocument();
    expect(mockMove).not.toHaveBeenCalled();
  });

  it.each([
    ['created', 'PALLET NOT STORED'],
    ['on_hold', 'PALLET ON HOLD'],
    ['shipped', 'PALLET SHIPPED'],
  ] as const)('blocks %s pallets', async (status, title) => {
    mockPallet.mockResolvedValue({ ...pallet, lifecycle_status: status });
    renderPage('/move?code=MM-P-0000008');
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Destination rack code' }),
    ).not.toBeInTheDocument();
    expect(mockMove).not.toHaveBeenCalled();
  });

  it('retries uncertain failure with the exact same request key', async () => {
    mockMove
      .mockRejectedValueOnce(new Error('MOVE_FAILED'))
      .mockResolvedValueOnce(saved);
    const user = userEvent.setup();
    await reachRack(user);
    await user.click(screen.getByRole('button', { name: 'REVIEW MOVE' }));
    await user.click(screen.getByRole('button', { name: 'CONFIRM MOVE' }));
    expect(await screen.findByText('NOT SAVED YET')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'RETRY SAME MOVE' }));
    expect(
      await screen.findByRole('heading', { name: 'Pallet Moved' }),
    ).toBeInTheDocument();
    expect(mockMove).toHaveBeenCalledTimes(2);
    expect(mockMove.mock.calls[0]?.[0]).toEqual(mockMove.mock.calls[1]?.[0]);
  });
});
