import { Link } from 'react-router-dom';

import type { TaskRoute } from '@/types/navigation';

type TaskCardProps = {
  task: TaskRoute;
};

export function TaskCard({ task }: TaskCardProps) {
  return (
    <Link
      to={task.path}
      className="group flex min-h-30 flex-col justify-between rounded-xl border border-slate-300/90 bg-white p-4 shadow-[0_3px_0_rgba(15,23,42,0.08)] transition duration-150 hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_5px_0_rgba(15,23,42,0.09)] active:translate-y-0 active:shadow-none"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="text-[0.68rem] font-black tracking-[0.16em] text-slate-400">
          {task.order}
        </span>
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-slate-100 text-lg font-semibold text-slate-500 transition-colors group-hover:bg-amber-100 group-hover:text-amber-800"
        >
          →
        </span>
      </span>
      <span className="max-w-[10rem] text-[0.95rem] leading-tight font-black tracking-[0.035em] text-[#172033]">
        {task.title.toUpperCase()}
      </span>
    </Link>
  );
}
