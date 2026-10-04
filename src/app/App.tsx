import { BrowserRouter } from 'react-router-dom';

import { AppRoutes } from '@/app/router/AppRoutes';

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
