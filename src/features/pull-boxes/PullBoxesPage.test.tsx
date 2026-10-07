import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { PullBoxesPage } from '@/features/pull-boxes/PullBoxesPage';
import {
  getPullContext,
  pullBoxes,
  type PullContext,
  type PullResult,
} from '@/features/pull-boxes/pullBoxes.api';

vi.mock('@/features/pull-boxes/pullBoxes.api', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/pull-boxes/pullBoxes.api')
    >();
  return { ...actual, getPullContext: vi.fn(), pullBoxes: vi.fn() };
});

const mockContext = vi.mocked(getPullContext);
const mockPull = vi.mocked(pullBoxes);
const context: PullContext = {
  pallet: {
    id: '97000000-0000-4000-8000-000000000071',
    pallet_code: 'MM-P-0000071',
    part_id: '96000000-0000-4000-8000-000000000071',
    current_boxes: 31,
    current_pieces: 21_700,
    pieces_per_box_snapshot: 700,
    boxes_per_full_pallet_snapshot: 48,
    lifecycle_status: 'stored',
    part: { part_number: 'MM-A3815', description: 'Fictional part' },
    location: { location_code: 'M7-RACK-1', location_type: 'rack' },
  },
  fifo: {
    isFirst: true,
    oldestPalletCode: 'MM-P-0000071',
    oldestLocationCode: 'M7-RACK-1',
  },
};
const saved: PullResult = {
  pallet_id: context.pallet.id,
  pallet_code: context.pallet.pallet_code,
  part_number: context.pallet.part.part_number,
  description: context.pallet.part.description,
  location_code: 'M7-RACK-1',
  previous_boxes: 31,
  boxes_removed: 6,
  current_boxes: 25,
  previous_pieces: 21_700,
  pieces_removed: 4_200,
  current_pieces: 17_500,
  transaction_id: '99000000-0000-4000-8000-000000000071',
  pulled_at: '2026-10-06T12:00:00Z',
};

function renderPage(path = '/pull') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <PullBoxesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function reachEntry(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText('Pallet code'),
    context.pallet.pallet_code,
  );
  await user.click(screen.getByRole('button', { name: 'LOOK UP PALLET' }));
  await screen.findByText('Fictional part');
}

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await reachEntry(user);
  await user.type(screen.getByLabelText('Boxes to pull'), '6');
  await user.type(
    screen.getByLabelText('PO reference (optional)'),
    'M7-FICTIONAL-PO',
  );
  await user.click(screen.getByRole('button', { name: 'REVIEW PULL' }));
  await screen.findByRole('heading', { name: 'Review Pull' });
}

describe('PullBoxesPage', () => {
  beforeEach(() => {
    mockContext.mockReset().mockResolvedValue(context);
    mockPull.mockReset().mockResolvedValue(saved);
  });

  it('starts from Home, previews snapshot math, reviews, and shows server-returned success', async () => {
    const user = userEvent.setup();
    renderPage();
    await reachEntry(user);
    expect(screen.getByText('PULL FIRST')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Boxes to pull'), '6');
    const removing = screen.getByText('REMOVING').parentElement!;
    const remaining = screen.getByText('REMAINING').parentElement!;
    expect(within(removing).getByText(/4,200/)).toBeInTheDocument();
    expect(within(remaining).getByText(/17,500/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'REVIEW PULL' }));
    await screen.findByRole('heading', { name: 'Review Pull' });
    expect(mockPull).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'CONFIRM PULL' }));
    expect(await screen.findByText('BOXES PULLED')).toBeInTheDocument();
    expect(mockPull.mock.calls[0]?.[0]).toMatchObject({
      palletCode: context.pallet.pallet_code,
      boxesToPull: 6,
      expectedCurrentBoxes: 31,
      expectedCurrentPieces: 21_700,
      idempotencyKey: expect.any(String),
    });
    expect(screen.getByText('DONE')).toBeInTheDocument();
  });

  it('preselects a recoverable pallet URL and warns on non-FIFO choice', async () => {
    mockContext.mockResolvedValue({
      ...context,
      fifo: {
        isFirst: false,
        oldestPalletCode: 'MM-P-0000003',
        oldestLocationCode: 'M7-RACK-0',
      },
    });
    renderPage('/pull?code=mm-p-0000071');
    expect(await screen.findByText('NOT FIFO PALLET')).toBeInTheDocument();
    expect(mockContext).toHaveBeenCalledWith('MM-P-0000071');
    expect(screen.getByText(/MM-P-0000003/)).toBeInTheDocument();
    expect(screen.getByLabelText('Boxes to pull')).toBeInTheDocument();
  });

  it('uses the same canonical pallet code from manual entry and a URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('Pallet code'), ' mm-p-0000071 ');
    await user.click(screen.getByRole('button', { name: 'LOOK UP PALLET' }));
    await screen.findByText('Fictional part');
    expect(mockContext).toHaveBeenCalledWith('MM-P-0000071');
  });

  it('blocks a held pallet', async () => {
    mockContext.mockResolvedValue({
      ...context,
      pallet: { ...context.pallet, lifecycle_status: 'on_hold' },
    });
    const user = userEvent.setup();
    renderPage();
    await reachEntry(user);
    expect(screen.getByText('PALLET ON HOLD')).toBeInTheDocument();
    expect(screen.queryByLabelText('Boxes to pull')).not.toBeInTheDocument();
    expect(mockPull).not.toHaveBeenCalled();
  });

  it('directs a whole-pallet attempt to Shipping without writing', async () => {
    const user = userEvent.setup();
    renderPage();
    await reachEntry(user);
    await user.type(screen.getByLabelText('Boxes to pull'), '31');
    expect(screen.getByText('WHOLE PALLET — USE SHIPPING')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'REVIEW PULL' })).toBeDisabled();
    expect(mockPull).not.toHaveBeenCalled();
  });

  it('keeps the same request key after an uncertain response', async () => {
    mockPull
      .mockRejectedValueOnce(new Error('network lost'))
      .mockResolvedValueOnce(saved);
    const user = userEvent.setup();
    renderPage();
    await reachReview(user);
    await user.click(screen.getByRole('button', { name: 'CONFIRM PULL' }));
    expect(await screen.findByText('NOT SAVED YET')).toBeInTheDocument();
    const original = mockPull.mock.calls[0]?.[0];
    await user.click(
      screen.getByRole('button', { name: 'RETRY SAME REQUEST' }),
    );
    await waitFor(() => expect(mockPull).toHaveBeenCalledTimes(2));
    expect(mockPull.mock.calls[1]?.[0]).toEqual(original);
    expect(await screen.findByText('BOXES PULLED')).toBeInTheDocument();
  });

  it('requires a new review after a definite stale-state rejection', async () => {
    mockPull.mockRejectedValue(new Error('INVENTORY_CHANGED'));
    const user = userEvent.setup();
    renderPage();
    await reachReview(user);
    await user.click(screen.getByRole('button', { name: 'CONFIRM PULL' }));
    expect(await screen.findByText('INVENTORY CHANGED')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'RETRY SAME REQUEST' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'REFRESH AND REVIEW AGAIN' }),
    ).toBeInTheDocument();
  });

  it('detects changed inventory on review and makes no write', async () => {
    mockContext.mockResolvedValueOnce(context).mockResolvedValueOnce({
      ...context,
      pallet: { ...context.pallet, current_boxes: 30, current_pieces: 21_000 },
    });
    const user = userEvent.setup();
    renderPage();
    await reachEntry(user);
    await user.type(screen.getByLabelText('Boxes to pull'), '6');
    await user.click(screen.getByRole('button', { name: 'REVIEW PULL' }));
    expect(await screen.findByText('INVENTORY CHANGED')).toBeInTheDocument();
    expect(mockPull).not.toHaveBeenCalled();
  });
});
