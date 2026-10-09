import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { CountPalletPage } from '@/features/count-inventory/CountPalletPage';
import {
  countPallet,
  getPalletForCount,
  type CountPallet,
  type CountResult,
} from '@/features/count-inventory/countPallet.api';

vi.mock('@/features/count-inventory/countPallet.api', () => ({
  getPalletForCount: vi.fn(),
  countPallet: vi.fn(),
}));

const mockGet = vi.mocked(getPalletForCount);
const mockCount = vi.mocked(countPallet);
const locationId = '98900000-0000-4000-8000-000000000001';
const pallet: CountPallet = {
  id: '97900000-0000-4000-8000-000000000001',
  pallet_code: 'MM-P-0000009',
  current_location_id: locationId,
  current_boxes: 31,
  current_pieces: 21700,
  pieces_per_box_snapshot: 700,
  boxes_per_full_pallet_snapshot: 48,
  lifecycle_status: 'stored',
  lifecycle_status_before_hold: null,
  part: { part_number: 'MM-A3815', description: 'Fictional Anchor' },
  location: { location_code: 'B-003-AD', location_type: 'rack' },
};
const matched: CountResult = {
  pallet_id: pallet.id,
  pallet_code: pallet.pallet_code,
  part_number: pallet.part.part_number,
  description: pallet.part.description,
  location_id: locationId,
  location_code: 'B-003-AD',
  lifecycle_status: 'stored',
  system_boxes: 31,
  system_pieces: 21700,
  counted_boxes: 31,
  counted_pieces: 21700,
  box_difference: 0,
  piece_difference: 0,
  outcome: 'matched',
  adjustment_request_id: null,
  transaction_id: '97900000-0000-4000-8000-000000000099',
  recorded_at: '2026-10-09T12:00:00Z',
};
const discrepancy: CountResult = {
  ...matched,
  counted_boxes: 29,
  counted_pieces: 20300,
  box_difference: -2,
  piece_difference: -1400,
  outcome: 'discrepancy',
  adjustment_request_id: '97900000-0000-4000-8000-000000000098',
};

function renderPage(entry = '/count') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/count" element={<CountPalletPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function enterCount(
  user: ReturnType<typeof userEvent.setup>,
  boxes: string,
  entry = '/count',
) {
  renderPage(entry);
  if (entry === '/count') {
    await user.type(
      screen.getByRole('textbox', { name: 'Pallet code' }),
      'mm-p-0000009',
    );
    await user.click(screen.getByRole('button', { name: 'LOOK UP PALLET' }));
  }
  const field = await screen.findByRole('spinbutton', {
    name: 'HOW MANY BOXES ARE PHYSICALLY HERE?',
  });
  await user.type(field, boxes);
}

describe('CountPalletPage', () => {
  beforeEach(() => {
    mockGet.mockReset().mockResolvedValue(pallet);
    mockCount.mockReset().mockResolvedValue(matched);
  });

  it('normalizes manual lookup, reviews a match, and shows server-confirmed success', async () => {
    const user = userEvent.setup();
    await enterCount(user, '31');
    expect(mockGet).toHaveBeenCalledWith('MM-P-0000009');
    expect(screen.getByText('SYSTEM QUANTITY')).toBeInTheDocument();
    expect(screen.getByText('COUNT MATCHES')).toBeInTheDocument();
    expect(mockCount).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'REVIEW COUNT' }));
    expect(
      await screen.findByRole('heading', { name: 'Review Count' }),
    ).toBeInTheDocument();
    expect(mockCount).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'CONFIRM COUNT' }));
    expect(
      await screen.findByRole('heading', { name: 'Count Complete' }),
    ).toBeInTheDocument();
    expect(mockCount.mock.calls[0]?.[0]).toMatchObject({
      palletCode: 'MM-P-0000009',
      countedBoxes: 31,
      expectedCurrentBoxes: 31,
      expectedCurrentPieces: 21700,
      expectedCurrentLocationId: locationId,
      reasonCode: null,
    });
  });

  it('preselects from Find URL and submits discrepancy without faking inventory changes', async () => {
    mockCount.mockResolvedValue(discrepancy);
    const user = userEvent.setup();
    await enterCount(user, '29', '/count?code=mm-p-0000009');
    expect(mockGet).toHaveBeenCalledWith('MM-P-0000009');
    const difference = screen.getByText('COUNT DIFFERENCE').parentElement;
    if (!difference) throw new Error('Missing difference panel.');
    expect(within(difference).getByText('-2 boxes')).toBeInTheDocument();
    expect(within(difference).getByText('-1,400 pieces')).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Reason for difference' }),
      'other',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Note (optional)' }),
      'Fictional discrepancy',
    );
    await user.click(screen.getByRole('button', { name: 'REVIEW COUNT' }));
    expect(
      await screen.findByText(/Supervisor approval is required/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'SUBMIT ADJUSTMENT REQUEST' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Adjustment Requested' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Inventory has NOT been changed/),
    ).toBeInTheDocument();
    expect(mockCount.mock.calls[0]?.[0]).toMatchObject({
      countedBoxes: 29,
      reasonCode: 'other',
      reasonNotes: 'Fictional discrepancy',
    });
  });

  it('allows zero and blocks discrepancy review until reason selected', async () => {
    const user = userEvent.setup();
    await enterCount(user, '0');
    expect(screen.getByText('-31 boxes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'REVIEW COUNT' }));
    expect(screen.getByText('REASON REQUIRED')).toBeInTheDocument();
    expect(mockCount).not.toHaveBeenCalled();
  });

  it('shows lookup read failure, not an uncertain write', async () => {
    mockGet.mockRejectedValue(new Error('PALLET_LOOKUP_FAILED'));
    renderPage('/count?code=MM-P-0000009');
    expect(await screen.findByText("COULDN'T LOAD")).toBeInTheDocument();
    expect(screen.queryByText('NOT SAVED YET')).not.toBeInTheDocument();
  });

  it('retries uncertain confirmation with the exact frozen request', async () => {
    mockCount
      .mockRejectedValueOnce(new Error('COUNT_FAILED'))
      .mockResolvedValueOnce(matched);
    const user = userEvent.setup();
    await enterCount(user, '31');
    await user.click(screen.getByRole('button', { name: 'REVIEW COUNT' }));
    await user.click(
      await screen.findByRole('button', { name: 'CONFIRM COUNT' }),
    );
    expect(await screen.findByText('NOT SAVED YET')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'RETRY SAME REQUEST' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Count Complete' }),
    ).toBeInTheDocument();
    expect(mockCount.mock.calls[0]?.[0]).toEqual(mockCount.mock.calls[1]?.[0]);
  });

  it('rejects an already shipped pallet in the UI', async () => {
    mockGet.mockResolvedValue({ ...pallet, lifecycle_status: 'shipped' });
    renderPage('/count?code=MM-P-0000009');
    expect(await screen.findByText('PALLET SHIPPED')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });
});
