import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { HomePage } from '@/features/home/HomePage';
import { TaskPlaceholderPage } from '@/features/task-placeholder/TaskPlaceholderPage';
import { taskRoutes } from '@/types/navigation';

const CreatePalletPage = lazy(async () => {
  const module = await import('@/features/create-pallet/CreatePalletPage');
  return { default: module.CreatePalletPage };
});

const StorePalletPage = lazy(async () => {
  const module = await import('@/features/store-pallet/StorePalletPage');
  return { default: module.StorePalletPage };
});

const FindInventoryPage = lazy(async () => {
  const module = await import('@/features/find-inventory/FindInventoryPage');
  return { default: module.FindInventoryPage };
});

const PullBoxesPage = lazy(async () => {
  const module = await import('@/features/pull-boxes/PullBoxesPage');
  return { default: module.PullBoxesPage };
});

const MovePalletPage = lazy(async () => {
  const module = await import('@/features/move-pallet/MovePalletPage');
  return { default: module.MovePalletPage };
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
      <Route
        path="/store"
        element={
          <Suspense fallback={<RouteLoadingState title="Store Pallet" />}>
            <StorePalletPage />
          </Suspense>
        }
      />
      <Route
        path="/find"
        element={
          <Suspense fallback={<RouteLoadingState title="Find Inventory" />}>
            <FindInventoryPage />
          </Suspense>
        }
      />
      <Route
        path="/pull"
        element={
          <Suspense fallback={<RouteLoadingState title="Pull Boxes" />}>
            <PullBoxesPage />
          </Suspense>
        }
      />
      <Route
        path="/move"
        element={
          <Suspense fallback={<RouteLoadingState title="Move Pallet" />}>
            <MovePalletPage />
          </Suspense>
        }
      />
      {taskRoutes
        .filter(
          (task) =>
            task.path !== '/create-pallet' &&
            task.path !== '/store' &&
            task.path !== '/find' &&
            task.path !== '/pull' &&
            task.path !== '/move',
        )
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

function RouteLoadingState({ title = 'Create Pallet' }: { title?: string }) {
  return (
    <main
      role="status"
      className="grid min-h-screen place-items-center px-4 text-center"
    >
      <p className="text-lg font-black text-[#172033]">Loading {title}…</p>
    </main>
  );
}
