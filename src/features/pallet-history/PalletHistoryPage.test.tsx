import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import type { HistoryEvent } from '@/domain/transaction/history';
import { HistoryEventCard } from '@/features/pallet-history/HistoryEventCard';
import {
  getHistoryPage,
  getHistoryPallet,
  type HistoryPallet,
} from '@/features/pallet-history/palletHistory.api';
import { PalletHistoryPage } from '@/features/pallet-history/PalletHistoryPage';

vi.mock('@/features/pallet-history/palletHistory.api', () => ({
  getHistoryPallet: vi.fn(),
  getHistoryPage: vi.fn(),
}));

const palletId = '97000000-0000-4000-8000-000000000001';
const pallet: HistoryPallet = {
  id: palletId,
  pallet_code: 'MM-P-0000033',
  current_boxes: 0,
  current_pieces: 0,
  original_boxes: 31,
  original_pieces: 21_700,
  boxes_per_full_pallet_snapshot: 48,
  lifecycle_status: 'shipped',
  hold_reason: null,
  packed_at: '2026-10-10T11:00:00Z',
  heat_number: 'FICTIONAL-HEAT',
  lot_number: 'FICTIONAL-LOT',
  machine_code: null,
  part: { part_number: 'MM-A3815', description: 'Fictional anchor' },
  location: null,
};
const event: HistoryEvent = {
  id: '97000000-0000-4000-8000-000000000002',
  transactionType: 'shipped',
  occurredAt: '2026-10-10T12:00:00Z',
  actorName: 'Fictional Worker',
  previousBoxes: 31,
  boxChange: -31,
  newBoxes: 0,
  previousPieces: 21_700,
  pieceChange: -21_700,
  newPieces: 0,
  previousLocationCode: 'SHIPPING-STAGING-01',
  newLocationCode: null,
  poReference: 'FICTIONAL-PO',
  bolReference: 'FICTIONAL-BOL',
  reasonNotes: null,
  adjustment: null,
};

function Path() {
  const location = useLocation();
  return <output data-testid="path">{location.search}</output>;
}

function renderPage(path = '/history') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/history"
            element={
              <>
                <PalletHistoryPage />
                <Path />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PalletHistoryPage', () => {
  beforeEach(() => {
    vi.mocked(getHistoryPallet).mockReset().mockResolvedValue(pallet);
    vi.mocked(getHistoryPage)
      .mockReset()
      .mockResolvedValue({
        events: [event],
        nextCursor: null,
      });
  });

  it('has a read-only empty search state and normalizes manual lookup into the URL', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByText(/Enter a pallet code to see/)).toBeInTheDocument();
    expect(getHistoryPallet).not.toHaveBeenCalled();
    await user.type(
      screen.getByRole('searchbox', { name: 'Pallet code' }),
      '  mm-p-0000033  ',
    );
    await user.click(screen.getByRole('button', { name: 'LOOK UP PALLET' }));
    expect(await screen.findByText('Pallet Shipped')).toBeInTheDocument();
    expect(getHistoryPallet).toHaveBeenCalledWith('MM-P-0000033');
    expect(screen.getByTestId('path')).toHaveTextContent('code=MM-P-0000033');
  });

  it('loads a shipped pallet from a refresh-safe URL and separates current, original, and dispatched quantities', async () => {
    renderPage('/history?code=mm-p-0000033');
    expect(await screen.findByText('Pallet Shipped')).toBeInTheDocument();
    expect(screen.getByText('CURRENT INVENTORY')).toBeInTheDocument();
    expect(screen.getByText('ORIGINALLY PACKED')).toBeInTheDocument();
    expect(screen.getByText('PREVIOUSLY SHIPPED')).toBeInTheDocument();
    expect(screen.getByText('0 boxes / 0 pieces')).toBeInTheDocument();
    expect(screen.getAllByText('31 boxes / 21,700 pieces')).toHaveLength(2);
    expect(screen.getAllByText('No current warehouse location')).toHaveLength(
      2,
    );
    expect(screen.getByText('FICTIONAL-PO')).toBeInTheDocument();
    expect(screen.getByText('FICTIONAL-BOL')).toBeInTheDocument();
    expect(screen.getByText(/Fictional Worker/)).toBeInTheDocument();
    expect(screen.getByText('−31')).toBeInTheDocument();
    expect(screen.getByText('−21,700')).toBeInTheDocument();
  });

  it('shows invalid and missing pallets without displaying technical errors', async () => {
    renderPage('/history?code=bad%2Ccode');
    expect(screen.getByText('PALLET NOT FOUND')).toBeInTheDocument();
    expect(getHistoryPallet).not.toHaveBeenCalled();
  });

  it('reports access denial and read failures separately', async () => {
    vi.mocked(getHistoryPallet).mockRejectedValue(new Error('ACCESS_DENIED'));
    renderPage('/history?code=MM-P-0000033');
    expect(await screen.findByText('ACCESS DENIED')).toBeInTheDocument();
  });

  it('loads older events without replacing already loaded history', async () => {
    const user = userEvent.setup();
    const cursor = { occurredAt: event.occurredAt, id: event.id };
    vi.mocked(getHistoryPage)
      .mockResolvedValueOnce({ events: [event], nextCursor: cursor })
      .mockResolvedValueOnce({
        events: [
          {
            ...event,
            id: '97000000-0000-4000-8000-000000000003',
            transactionType: 'pallet_created',
          },
        ],
        nextCursor: null,
      });
    renderPage('/history?code=MM-P-0000033');
    await user.click(
      await screen.findByRole('button', { name: 'LOAD OLDER EVENTS' }),
    );
    expect(await screen.findByText('Pallet Created')).toBeInTheDocument();
    expect(screen.getByText('Pallet Shipped')).toBeInTheDocument();
    expect(getHistoryPage).toHaveBeenLastCalledWith(palletId, cursor);
  });

  it('warns that a partially loaded timeline is incomplete after load-more fails', async () => {
    const user = userEvent.setup();
    vi.mocked(getHistoryPage)
      .mockResolvedValueOnce({
        events: [event],
        nextCursor: { occurredAt: event.occurredAt, id: event.id },
      })
      .mockRejectedValueOnce(new Error('HISTORY_LOAD_FAILED'));
    renderPage('/history?code=MM-P-0000033');
    await user.click(
      await screen.findByRole('button', { name: 'LOAD OLDER EVENTS' }),
    );
    expect(await screen.findByText('INCOMPLETE HISTORY')).toBeInTheDocument();
    expect(screen.getByText('Pallet Shipped')).toBeInTheDocument();
  });

  it('shows a no-history state without inventing events', async () => {
    vi.mocked(getHistoryPage).mockResolvedValue({
      events: [],
      nextCursor: null,
    });
    renderPage('/history?code=MM-P-0000033');
    expect(await screen.findByText('NO HISTORY AVAILABLE')).toBeInTheDocument();
  });
});

describe('HistoryEventCard', () => {
  it('shows a request as proposed rather than an applied inventory change', () => {
    render(
      <HistoryEventCard
        event={{
          ...event,
          transactionType: 'adjustment_requested',
          boxChange: 0,
          pieceChange: 0,
          newBoxes: 31,
          newPieces: 21_700,
          adjustment: {
            status: 'pending',
            countedBoxes: 29,
            boxDifference: -2,
            countedPieces: 20_300,
            pieceDifference: -1_400,
            reasonNotes: null,
            reviewNotes: null,
          },
        }}
      />,
    );
    expect(screen.getByText('PROPOSED — NOT APPLIED')).toBeInTheDocument();
    expect(screen.getByText('NO QUANTITY CHANGE')).toBeInTheDocument();
    expect(screen.getByText(/proposed −2 boxes/)).toBeInTheDocument();
  });

  it('shows actual approval deltas and a zero-delta rejection reason', () => {
    const { rerender } = render(
      <HistoryEventCard
        event={{
          ...event,
          transactionType: 'adjustment_approved',
          previousBoxes: 31,
          boxChange: -2,
          newBoxes: 29,
          previousPieces: 21_700,
          pieceChange: -1_400,
          newPieces: 20_300,
        }}
      />,
    );
    expect(screen.getByText('−2')).toBeInTheDocument();
    expect(screen.getByText('−1,400')).toBeInTheDocument();
    rerender(
      <HistoryEventCard
        event={{
          ...event,
          transactionType: 'adjustment_rejected',
          boxChange: 0,
          pieceChange: 0,
          reasonNotes: 'Recount required',
          adjustment: {
            status: 'rejected',
            countedBoxes: 30,
            boxDifference: -1,
            countedPieces: 21_000,
            pieceDifference: -700,
            reasonNotes: null,
            reviewNotes: 'Recount required',
          },
        }}
      />,
    );
    expect(
      screen.getByText(/Decision reason: Recount required/),
    ).toBeInTheDocument();
    expect(screen.getByText('NO QUANTITY CHANGE')).toBeInTheDocument();
  });

  it('hides adjustment notes when request RLS does not expose the linked request', () => {
    render(
      <HistoryEventCard
        event={{
          ...event,
          transactionType: 'adjustment_rejected',
          boxChange: 0,
          pieceChange: 0,
          reasonNotes: 'Private recount explanation',
          adjustment: null,
        }}
      />,
    );
    expect(screen.getByText('Adjustment Rejected')).toBeInTheDocument();
    expect(screen.getByText('NO QUANTITY CHANGE')).toBeInTheDocument();
    expect(
      screen.queryByText(/Private recount explanation/),
    ).not.toBeInTheDocument();
  });

  it('handles matched Count, staging, missing actor/references, and unknown future events', () => {
    const { rerender } = render(
      <HistoryEventCard
        event={{
          ...event,
          transactionType: 'count_matched',
          boxChange: 0,
          pieceChange: 0,
          actorName: null,
        }}
      />,
    );
    expect(
      screen.getByText(/Physically counted: 31 boxes/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Recorded user/)).toBeInTheDocument();
    rerender(
      <HistoryEventCard
        event={{
          ...event,
          transactionType: 'shipping_staging',
          boxChange: 0,
          pieceChange: 0,
        }}
      />,
    );
    expect(screen.getByText(/Not dispatched/)).toBeInTheDocument();
    rerender(
      <HistoryEventCard
        event={{ ...event, poReference: null, bolReference: null }}
      />,
    );
    expect(screen.getAllByText('Not supplied')).toHaveLength(2);
    rerender(
      <HistoryEventCard
        event={{
          ...event,
          transactionType: 'future_event',
          boxChange: null,
          pieceChange: null,
        }}
      />,
    );
    expect(screen.getByText('Inventory Event Recorded')).toBeInTheDocument();
    expect(screen.getByText('RECORDED EVENT')).toBeInTheDocument();
  });
});
