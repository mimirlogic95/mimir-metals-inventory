import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { App } from '@/app/App';

describe('HomePage navigation', () => {
  it('opens a task placeholder and returns home', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('link', { name: /create pallet/i }));

    expect(
      screen.getByRole('heading', { name: 'Create Pallet' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Coming in a later mission.')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to home' }));

    expect(
      screen.getByRole('heading', { name: 'Finished Goods' }),
    ).toBeInTheDocument();
  });
});
