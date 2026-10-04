import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { HomePage } from '@/features/home/HomePage';
import { TaskPlaceholderPage } from '@/features/task-placeholder/TaskPlaceholderPage';
import { taskRoutes } from '@/types/navigation';

const CreatePalletPage = lazy(async () => {
  const module = await import('@/features/create-pallet/CreatePalletPage');
  return { default: module.CreatePalletPage };
});

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/create-pallet"
        element={
          <Suspense fallback={<RouteLoadingState />}>
            <CreatePalletPage />
          </Suspense>
        }
      />
      {taskRoutes
        .filter((task) => task.path !== '/create-pallet')
        .map((task) => (
          <Route
            key={task.path}
            path={task.path}
            element={<TaskPlaceholderPage title={task.title} />}
          />
        ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RouteLoadingState() {
  return (
    <main
      role="status"
      className="grid min-h-screen place-items-center px-4 text-center"
    >
      <p className="text-lg font-black text-[#172033]">
        Loading Create Pallet…
      </p>
    </main>
  );
}
