import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ShippingPage } from '@/features/shipping/ShippingPage';
import {
  getShippingLocations,
  getShippingPallet,
  shipPallet,
  stagePallet,
  type ShipResult,
  type ShippingPallet,
  type StageResult,
} from '@/features/shipping/shipping.api';

vi.mock('@/features/shipping/shipping.api', () => ({
  getShippingPallet: vi.fn(),
  getShippingLocations: vi.fn(),
  stagePallet: vi.fn(),
  shipPallet: vi.fn(),
}));

const mockPallet = vi.mocked(getShippingPallet);
const mockLocations = vi.mocked(getShippingLocations);
const mockStage = vi.mocked(stagePallet);
const mockShip = vi.mocked(shipPallet);
const rackId = '98110000-0000-4000-8000-000000000001';
const stagingId = '98110000-0000-4000-8000-000000000002';
const pallet: ShippingPallet = {
  id: '97110000-0000-4000-8000-000000000001',
  pallet_code: 'MM-P-0000023',
  current_location_id: rackId,
  current_boxes: 31,
  current_pieces: 21700,
  inventory_version: 4,
  boxes_per_full_pallet_snapshot: 48,
  lifecycle_status: 'stored',
  part: { part_number: 'MM-A3815', description: 'Fictional Anchor' },
  location: { location_code: 'B-001-AA', location_type: 'rack' },
};
const staged: StageResult = {
  pallet_id: pallet.id,
  pallet_code: pallet.pallet_code,
  part_number: pallet.part.part_number,
  description: pallet.part.description,
  previous_location_id: rackId,
  previous_location_code: 'B-001-AA',
  staging_location_id: stagingId,
  staging_location_code: 'SHIPPING-STAGING-01',
  current_boxes: 31,
  current_pieces: 21700,
  lifecycle_status: 'shipping_staging',
  actor_user_id: '95110000-0000-4000-8000-000000000001',
  actor_name: 'Fictional Worker',
  transaction_id: '97110000-0000-4000-8000-000000000099',
  staged_at: '2026-10-10T12:00:00Z',
};
const shipped: ShipResult = {
  pallet_id: pallet.id,
  pallet_code: pallet.pallet_code,
  part_number: pallet.part.part_number,
  description: pallet.part.description,
  source_location_id: rackId,
  source_location_code: 'B-001-AA',
  shipped_boxes: 31,
  shipped_pieces: 21700,
  current_boxes: 0,
  current_pieces: 0,
  lifecycle_status: 'shipped',
  po_reference: 'FICTIONAL-PO',
  bol_reference: 'FICTIONAL-BOL',
  reason_notes: null,
  actor_user_id: '95110000-0000-4000-8000-000000000001',
  actor_name: 'Fictional Worker',
  transaction_id: '97110000-0000-4000-8000-000000000098',
  shipped_at: '2026-10-10T12:00:00Z',
};

function renderPage(path = '/shipping') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/shipping" element={<ShippingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ShippingPage', () => {
  beforeEach(() => {
    mockPallet.mockReset().mockResolvedValue(pallet);
    mockLocations.mockReset().mockResolvedValue([
      {
        id: stagingId,
        location_code: 'SHIPPING-STAGING-01',
        location_type: 'shipping_staging',
        active: true,
      },
    ]);
    mockStage.mockReset().mockResolvedValue(staged);
    mockShip.mockReset().mockResolvedValue(shipped);
  });

  it('normalizes manual pallet lookup and reviews staging before a write', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(
      screen.getByRole('textbox', { name: 'Pallet code' }),
      'mm-p-0000023',
    );
    await user.click(screen.getByRole('button', { name: 'LOOK UP PALLET' }));
    expect(mockPallet).toHaveBeenCalledWith('MM-P-0000023');
    expect(await screen.findByText('B-001-AA')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'SHIPPING-STAGING-01' }),
    );
    await user.click(screen.getByRole('button', { name: 'REVIEW STAGING' }));
    expect(await screen.findByText('STAGE — NOT SHIPPED')).toBeInTheDocument();
    expect(mockStage).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'CONFIRM STAGING' }));
    expect(
      await screen.findByText('STAGED — NOT SHIPPED YET'),
    ).toBeInTheDocument();
    expect(mockStage.mock.calls[0]?.[0]).toMatchObject({
      palletCode: pallet.pallet_code,
      expectedCurrentBoxes: 31,
      expectedCurrentPieces: 21700,
      expectedCurrentLocationId: rackId,
      expectedLifecycleStatus: 'stored',
      expectedInventoryVersion: 4,
      destinationLocationId: stagingId,
    });
    expect(mockShip).not.toHaveBeenCalled();
  });

  it('preselects a Find pallet and dispatches the reviewed remaining quantity', async () => {
    const user = userEvent.setup();
    renderPage('/shipping?code=mm-p-0000023');
    expect(mockPallet).toHaveBeenCalledWith('MM-P-0000023');
    expect(await screen.findByText('B-001-AA')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'DISPATCH PALLET' }));
    await user.type(
      screen.getByRole('textbox', { name: 'PO NUMBER' }),
      ' FICTIONAL-PO ',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'BOL NUMBER' }),
      ' FICTIONAL-BOL ',
    );
    await user.click(screen.getByRole('button', { name: 'REVIEW SHIPMENT' }));
    expect(await screen.findByText('Review Shipment')).toBeInTheDocument();
    expect(
      screen.getByText(
        'THIS PALLET WILL NO LONGER BE AVAILABLE IN WAREHOUSE INVENTORY.',
      ),
    ).toBeInTheDocument();
    expect(mockShip).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'CONFIRM SHIPMENT' }));
    expect(
      await screen.findByText(
        'PALLET SHIPPED — NO LONGER IN WAREHOUSE INVENTORY',
      ),
    ).toBeInTheDocument();
    expect(mockShip.mock.calls[0]?.[0]).toMatchObject({
      expectedCurrentBoxes: 31,
      expectedCurrentPieces: 21700,
      expectedInventoryVersion: 4,
      poReference: 'FICTIONAL-PO',
      bolReference: 'FICTIONAL-BOL',
    });
    expect(screen.getByText('Fictional Worker')).toBeInTheDocument();
    mockPallet.mockResolvedValue({
      ...pallet,
      lifecycle_status: 'shipped',
      current_boxes: 0,
      current_pieces: 0,
      current_location_id: null,
      location: null,
    });
    await user.click(screen.getByRole('button', { name: 'VIEW PALLET' }));
    expect(await screen.findByText('NO CURRENT LOCATION')).toBeInTheDocument();
    expect(screen.getByText('ALREADY SHIPPED')).toBeInTheDocument();
  });

  it('requires hot jobs to stage before dispatch', async () => {
    mockPallet.mockResolvedValue({
      ...pallet,
      lifecycle_status: 'created',
      current_location_id: null,
      location: null,
    });
    renderPage('/shipping?code=MM-P-0000023');
    expect(
      await screen.findByText(
        'Hot jobs stage first; no warehouse rack is required.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'DISPATCH PALLET' }),
    ).not.toBeInTheDocument();
  });

  it.each(['on_hold', 'shipped'] as const)(
    'blocks %s pallets',
    async (lifecycle) => {
      mockPallet.mockResolvedValue({ ...pallet, lifecycle_status: lifecycle });
      renderPage('/shipping?code=MM-P-0000023');
      expect(
        await screen.findByText(
          lifecycle === 'on_hold' ? 'PALLET ON HOLD' : 'ALREADY SHIPPED',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'DISPATCH PALLET' }),
      ).not.toBeInTheDocument();
      expect(mockShip).not.toHaveBeenCalled();
    },
  );

  it('uses a read error for lookup failures', async () => {
    mockPallet.mockRejectedValue(new Error('PALLET_LOOKUP_FAILED'));
    renderPage('/shipping?code=MM-P-0000023');
    expect(await screen.findByText("COULDN'T LOAD")).toBeInTheDocument();
    expect(screen.queryByText('NOT SAVED YET')).not.toBeInTheDocument();
  });

  it('retries uncertain dispatch using the exact frozen request and key', async () => {
    mockShip
      .mockRejectedValueOnce(new Error('SHIPPING_FAILED'))
      .mockResolvedValueOnce(shipped);
    const user = userEvent.setup();
    renderPage('/shipping?code=MM-P-0000023');
    await screen.findByText('B-001-AA');
    await user.click(screen.getByRole('button', { name: 'DISPATCH PALLET' }));
    await user.click(screen.getByRole('button', { name: 'REVIEW SHIPMENT' }));
    await screen.findByText('Review Shipment');
    await user.click(screen.getByRole('button', { name: 'CONFIRM SHIPMENT' }));
    expect(await screen.findByText('NOT SAVED YET')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'RETRY SAME SHIPMENT' }),
    );
    expect(
      await screen.findByText(
        'PALLET SHIPPED — NO LONGER IN WAREHOUSE INVENTORY',
      ),
    ).toBeInTheDocument();
    expect(mockShip).toHaveBeenCalledTimes(2);
    expect(mockShip.mock.calls[1]?.[0]).toEqual(mockShip.mock.calls[0]?.[0]);
  });

  it('requires a fresh review after a known stale-state rejection', async () => {
    mockShip.mockRejectedValue(new Error('INVENTORY_CHANGED'));
    const user = userEvent.setup();
    renderPage('/shipping?code=MM-P-0000023');
    await screen.findByText('B-001-AA');
    await user.click(screen.getByRole('button', { name: 'DISPATCH PALLET' }));
    await user.click(screen.getByRole('button', { name: 'REVIEW SHIPMENT' }));
    await screen.findByText('Review Shipment');
    await user.click(screen.getByRole('button', { name: 'CONFIRM SHIPMENT' }));
    expect(await screen.findByText('INVENTORY CHANGED')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'RETRY SAME SHIPMENT' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'REFRESH / CHANGE ACTION' }),
    ).toBeInTheDocument();
  });
});
