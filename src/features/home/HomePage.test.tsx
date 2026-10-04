import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '@/app/App';
import { getActiveParts } from '@/features/create-pallet/createPallet.api';

vi.mock('@/features/create-pallet/createPallet.api', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/create-pallet/createPallet.api')
    >();

  return { ...actual, getActiveParts: vi.fn() };
});

describe('HomePage navigation', () => {
  it('opens Create Pallet and returns home', async () => {
    vi.mocked(getActiveParts).mockResolvedValue([]);
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('link', { name: /create pallet/i }));

    expect(
      await screen.findByRole('heading', { name: 'Select Part' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Choose the finished part on this pallet.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to home' }));

    expect(
      screen.getByRole('heading', { name: 'Finished Goods' }),
    ).toBeInTheDocument();
  });
});
