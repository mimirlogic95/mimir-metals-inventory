export type TaskRoute = {
  order: string;
  title: string;
  path: string;
  priority: 'primary' | 'secondary';
};

export const taskRoutes = [
  {
    order: '01',
    title: 'Create Pallet',
    path: '/create-pallet',
    priority: 'primary',
  },
  { order: '02', title: 'Store', path: '/store', priority: 'primary' },
  { order: '03', title: 'Find', path: '/find', priority: 'primary' },
  { order: '04', title: 'Pull Boxes', path: '/pull', priority: 'primary' },
  { order: '05', title: 'Move', path: '/move', priority: 'primary' },
  { order: '06', title: 'Count', path: '/count', priority: 'primary' },
  { order: '07', title: 'Shipping', path: '/shipping', priority: 'secondary' },
  { order: '08', title: 'History', path: '/history', priority: 'secondary' },
  {
    order: '09',
    title: 'Supervisor Adjustments',
    path: '/adjustments',
    priority: 'secondary',
  },
] as const satisfies readonly TaskRoute[];

export const primaryTaskRoutes = taskRoutes.filter(
  (task) => task.priority === 'primary',
);

export const secondaryTaskRoutes = taskRoutes.filter(
  (task) => task.priority === 'secondary',
);
