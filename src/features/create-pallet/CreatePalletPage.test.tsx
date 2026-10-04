import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { CreatePalletPage } from '@/features/create-pallet/CreatePalletPage';
import {
  createPallet,
  getActiveParts,
  getPackingSpec,
  type CreatedPallet,
} from '@/features/create-pallet/createPallet.api';

vi.mock('@/features/create-pallet/createPallet.api', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/create-pallet/createPallet.api')
    >();

  return {
    ...actual,
    getActiveParts: vi.fn(),
    getPackingSpec: vi.fn(),
    createPallet: vi.fn(),
  };
});

const mockGetActiveParts = vi.mocked(getActiveParts);
const mockGetPackingSpec = vi.mocked(getPackingSpec);
const mockCreatePallet = vi.mocked(createPallet);

const part = {
  id: '10000000-0000-4000-8000-000000000002',
  part_number: 'MM-A3815',
  description: '3/8 x 1-5/8 Headed Anchor',
  product_family: '3/8 Anchor',
};

const packingSpec = {
  part_id: part.id,
  pieces_per_box: 700,
  boxes_per_full_pallet: 48,
  pieces_per_full_pallet: 33_600,
  estimated_box_weight_lb: 56,
};

const createdPallet: CreatedPallet = {
  id: '97000000-0000-4000-8000-000000000001',
  pallet_code: 'MM-P-0004821',
  part_id: part.id,
  part_number: part.part_number,
  description: part.description,
  product_family: part.product_family,
  heat_number: 'MM-M4-HEAT-21',
  lot_number: 'MM-M4-LOT-21',
  machine_code: 'MM-M4-MACHINE-14',
  packed_by_user_id: '95000000-0000-4000-8000-000000000001',
  packed_at: '2026-10-04T16:00:00.000Z',
  pieces_per_box_snapshot: 700,
  boxes_per_full_pallet_snapshot: 48,
  estimated_box_weight_lb_snapshot: 56,
  original_boxes: 31,
  original_pieces: 21_700,
  current_boxes: 31,
  current_pieces: 21_700,
  lifecycle_status: 'created',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CreatePalletPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function reachReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', {
      name: /MM-A3815.*headed anchor/i,
    }),
  );
  await screen.findByText('700');
  await user.type(screen.getByLabelText('Number of boxes'), '31');

  expect(screen.getByText('21,700 pieces')).toBeInTheDocument();
  expect(screen.getByText('PARTIAL')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'CONTINUE' }));
  await user.type(screen.getByLabelText('Heat number'), 'MM-M4-HEAT-21');
  await user.type(screen.getByLabelText('Lot number'), 'MM-M4-LOT-21');
  await user.type(screen.getByLabelText(/Machine code/i), 'MM-M4-MACHINE-14');
  await user.click(screen.getByRole('button', { name: 'REVIEW PALLET' }));
}

describe('CreatePalletPage', () => {
  beforeEach(() => {
    mockGetActiveParts.mockResolvedValue([part]);
    mockGetPackingSpec.mockResolvedValue(packingSpec);
    mockCreatePallet.mockResolvedValue(createdPallet);
  });

  it('supports part selection, box preview, review, success, and label view', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(part.part_number)).toBeInTheDocument();
    await reachReview(user);

    expect(
      screen.getByText(
        'Confirm these details before creating permanent inventory.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('21,700')).toBeInTheDocument();
    expect(screen.getByText('MM-M4-HEAT-21')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'CREATE PALLET' }));

    expect(
      await screen.findByRole('heading', { name: 'Pallet Created' }),
    ).toBeInTheDocument();
    expect(screen.getByText('MM-P-0004821')).toBeInTheDocument();
    expect(mockCreatePallet.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        partId: part.id,
        boxes: 31,
        heatNumber: 'MM-M4-HEAT-21',
        lotNumber: 'MM-M4-LOT-21',
        machineCode: 'MM-M4-MACHINE-14',
        idempotencyKey: expect.any(String),
      }),
    );

    await user.click(screen.getByRole('button', { name: 'PRINT LABEL' }));

    expect(
      screen.getByLabelText('Printable label for MM-P-0004821'),
    ).toBeInTheDocument();
    expect(screen.getByText('Finished Goods Pallet')).toBeInTheDocument();
    expect(screen.getByText('MM-M4-LOT-21')).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'QR code containing MM-P-0004821',
      }),
    ).toBeInTheDocument();
  });

  it('reuses the same idempotency key when a failed request is retried', async () => {
    mockCreatePallet
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(createdPallet);
    const user = userEvent.setup();
    renderPage();
    await reachReview(user);

    await user.click(screen.getByRole('button', { name: 'CREATE PALLET' }));
    expect(await screen.findByText('NOT SAVED YET')).toBeInTheDocument();

    const firstKey = mockCreatePallet.mock.calls[0]?.[0].idempotencyKey;
    await user.click(screen.getByRole('button', { name: 'RETRY CREATE' }));

    await waitFor(() => expect(mockCreatePallet).toHaveBeenCalledTimes(2));
    expect(mockCreatePallet.mock.calls[1]?.[0].idempotencyKey).toBe(firstKey);
    expect(
      await screen.findByRole('heading', { name: 'Pallet Created' }),
    ).toBeInTheDocument();
  });
});
