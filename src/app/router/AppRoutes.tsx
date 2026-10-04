import { Navigate, Route, Routes } from 'react-router-dom';

import { HomePage } from '@/features/home/HomePage';
import { TaskPlaceholderPage } from '@/features/task-placeholder/TaskPlaceholderPage';
import { taskRoutes } from '@/types/navigation';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      {taskRoutes.map((task) => (
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
