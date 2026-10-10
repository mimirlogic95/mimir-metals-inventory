import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import {
  AdjustmentReviewPage,
  AdjustmentsPage,
} from '@/features/adjustments/AdjustmentsPage';
import {
  decideAdjustment,
  getAdjustmentRequest,
  getPendingAdjustments,
  requireSupervisor,
  type AdjustmentRequest,
  type AdjustmentResult,
} from '@/features/adjustments/adjustments.api';

vi.mock('@/features/adjustments/adjustments.api', () => ({
  requireSupervisor: vi.fn(),
  getPendingAdjustments: vi.fn(),
  getAdjustmentRequest: vi.fn(),
  decideAdjustment: vi.fn(),
}));

const mockSupervisor = vi.mocked(requireSupervisor);
const mockQueue = vi.mocked(getPendingAdjustments);
const mockDetail = vi.mocked(getAdjustmentRequest);
const mockDecision = vi.mocked(decideAdjustment);
const requestId = '95100000-0000-4000-8000-000000000098';
const request: AdjustmentRequest = {
  id: requestId,
  pallet_id: '97100000-0000-4000-8000-000000000001',
  requested_by_user_id: '95100000-0000-4000-8000-000000000001',
  created_at: '2026-10-09T12:00:00Z',
  status: 'pending',
  system_boxes: 31,
  system_pieces: 21700,
  counted_boxes: 29,
  counted_pieces: 20300,
  box_difference: -2,
  piece_difference: -1400,
  reason_code: 'count_error',
  reason_notes: 'Fictional recount needed',
  count_location_id: '98100000-0000-4000-8000-000000000001',
  count_inventory_version: 0,
  count_lifecycle_status: 'stored',
  count_lifecycle_status_before_hold: null,
  reviewed_at: null,
  review_notes: null,
  requester: { display_name: 'Fictional Worker' },
  count_location: { location_code: 'M10-RACK-A' },
  pallet: {
    pallet_code: 'MM-P-9800001',
    current_boxes: 31,
    current_pieces: 21700,
    current_location_id: '98100000-0000-4000-8000-000000000001',
    inventory_version: 0,
    lifecycle_status: 'stored',
    lifecycle_status_before_hold: null,
    hold_reason: null,
    packed_at: '2026-10-08T10:00:00Z',
    part: { part_number: 'MM-M10-TEST', description: 'Fictional test part' },
    location: { location_code: 'M10-RACK-A' },
  },
};

const approved: AdjustmentResult = {
  request_id: requestId,
  pallet_id: request.pallet_id,
  pallet_code: request.pallet.pallet_code,
  part_number: request.pallet.part.part_number,
  decision_status: 'approved',
  reviewed_by_user_id: '95100000-0000-4000-8000-000000000002',
  reviewer_name: 'Fictional Supervisor',
  reviewed_at: '2026-10-09T13:00:00Z',
  location_id: request.count_location_id,
  location_code: 'M10-RACK-A',
  lifecycle_status: 'stored',
  before_boxes: 31,
  box_change: -2,
  after_boxes: 29,
  before_pieces: 21700,
  piece_change: -1400,
  after_pieces: 20300,
  review_notes: null,
  transaction_id: '96100000-0000-4000-8000-000000000099',
};

function renderPage(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/adjustments" element={<AdjustmentsPage />} />
          <Route
            path="/adjustments/:requestId"
            element={<AdjustmentReviewPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('supervisor adjustments', () => {
  beforeEach(() => {
    mockSupervisor.mockReset().mockResolvedValue('Fictional Supervisor');
    mockQueue.mockReset().mockResolvedValue([request]);
    mockDetail.mockReset().mockResolvedValue(request);
    mockDecision.mockReset().mockResolvedValue(approved);
  });

  it('guards the queue before requesting sensitive adjustment rows', async () => {
    mockSupervisor.mockRejectedValue(new Error('SUPERVISOR_ACCESS_REQUIRED'));
    renderPage('/adjustments');
    expect(
      await screen.findByText('SUPERVISOR ACCESS REQUIRED'),
    ).toBeInTheDocument();
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('shows count-time evidence and an unmistakable signed difference in a mobile card', async () => {
    renderPage('/adjustments');
    expect(await screen.findByText('MM-P-9800001')).toBeInTheDocument();
    expect(screen.getByText(/Counted by Fictional Worker/)).toBeInTheDocument();
    expect(screen.getByText(/-2 boxes/)).toBeInTheDocument();
    expect(screen.getByText(/-1,400 pieces/)).toBeInTheDocument();
    expect(mockQueue).toHaveBeenCalledTimes(1);
  });

  it('requires review and confirmation before approval, then shows only server result', async () => {
    const user = userEvent.setup();
    renderPage(`/adjustments/${requestId}`);
    expect(await screen.findByText('SYSTEM AT COUNT TIME')).toBeInTheDocument();
    expect(screen.getByText('PHYSICAL COUNT')).toBeInTheDocument();
    expect(screen.getByText('PROPOSED CORRECTION')).toBeInTheDocument();
    expect(mockDecision).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'APPROVE ADJUSTMENT' }),
    );
    expect(
      await screen.findByText('APPROVE INVENTORY CORRECTION?'),
    ).toBeInTheDocument();
    expect(mockDecision).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'CONFIRM APPROVAL' }));
    expect(await screen.findByText('ADJUSTMENT APPROVED')).toBeInTheDocument();
    expect(
      screen.getByText(/Approved by Fictional Supervisor/),
    ).toBeInTheDocument();
    expect(mockDecision.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        requestId,
        decision: 'approve',
        reviewNotes: null,
        idempotencyKey: expect.any(String),
      }),
    );
  });

  it('allows a zero Count to be rejected with a reason but never approved', async () => {
    mockDetail.mockResolvedValue({
      ...request,
      counted_boxes: 0,
      counted_pieces: 0,
      box_difference: -31,
      piece_difference: -21700,
    });
    mockDecision.mockResolvedValue({
      ...approved,
      decision_status: 'rejected',
      box_change: 0,
      piece_change: 0,
      after_boxes: 31,
      after_pieces: 21700,
      review_notes: 'Recount required',
    });
    const user = userEvent.setup();
    renderPage(`/adjustments/${requestId}`);
    expect(
      await screen.findByText('ZERO BALANCE NOT SUPPORTED'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'APPROVE ADJUSTMENT' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'REJECT REQUEST' }));
    await user.click(screen.getByRole('button', { name: 'CONFIRM REJECTION' }));
    expect(screen.getByText('REJECTION REASON REQUIRED')).toBeInTheDocument();
    await user.type(
      screen.getByRole('textbox', { name: /Supervisor reason/ }),
      'Recount required',
    );
    await user.click(screen.getByRole('button', { name: 'CONFIRM REJECTION' }));
    expect(await screen.findByText('REQUEST REJECTED')).toBeInTheDocument();
    expect(screen.getByText('Inventory unchanged.')).toBeInTheDocument();
    expect(mockDecision.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        decision: 'reject',
        reviewNotes: 'Recount required',
      }),
    );
  });

  it('retries an uncertain confirmation with the exact same frozen key and note', async () => {
    mockDecision
      .mockRejectedValueOnce(new Error('DECISION_UNCERTAIN'))
      .mockResolvedValueOnce(approved);
    const user = userEvent.setup();
    renderPage(`/adjustments/${requestId}`);
    await screen.findByText('SYSTEM AT COUNT TIME');
    await user.click(
      screen.getByRole('button', { name: 'APPROVE ADJUSTMENT' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: /Supervisor reason/ }),
      'Fictional review',
    );
    await user.click(screen.getByRole('button', { name: 'CONFIRM APPROVAL' }));
    expect(await screen.findByText('NOT SAVED YET')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Supervisor reason/ }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole('button', { name: 'RETRY SAME DECISION' }),
    );
    expect(await screen.findByText('ADJUSTMENT APPROVED')).toBeInTheDocument();
    expect(mockDecision).toHaveBeenCalledTimes(2);
    expect(mockDecision.mock.calls[1]?.[0]).toEqual(
      mockDecision.mock.calls[0]?.[0],
    );
  });

  it('uses a read error rather than uncertain-save language on lookup failure', async () => {
    mockDetail.mockRejectedValue(new Error('ADJUSTMENTS_LOAD_FAILED'));
    renderPage(`/adjustments/${requestId}`);
    expect(await screen.findByText("COULDN'T LOAD")).toBeInTheDocument();
    expect(screen.queryByText('NOT SAVED YET')).not.toBeInTheDocument();
  });
});
