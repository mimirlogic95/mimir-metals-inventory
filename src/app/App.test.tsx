import { render, screen } from '@testing-library/react';

import { App } from '@/app/App';

describe('App', () => {
  it('renders the finished-goods home screen', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Finished Goods' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /create pallet/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /history/i })).toBeInTheDocument();
  });
});
