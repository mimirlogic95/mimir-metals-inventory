import { Link } from 'react-router-dom';

import { AppHeader } from '@/app/layout/AppHeader';
import { TaskCard } from '@/components/navigation/TaskCard';
import { primaryTaskRoutes, secondaryTaskRoutes } from '@/types/navigation';

export function HomePage() {
  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader />

      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <section aria-labelledby="home-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
                Floor tasks
              </p>
              <h1
                id="home-heading"
                className="mt-1 text-2xl leading-tight font-black tracking-tight text-[#172033] sm:text-3xl"
              >
                Finished Goods
              </h1>
            </div>
            <p className="mb-1 text-right text-xs font-semibold text-slate-500">
              Select a task
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {primaryTaskRoutes.map((task) => (
              <TaskCard key={task.path} task={task} />
            ))}
          </div>
        </section>

        <section aria-labelledby="more-heading" className="mt-8">
          <div className="mb-3 flex items-center gap-3">
            <h2
              id="more-heading"
              className="shrink-0 text-xs font-black tracking-[0.17em] text-slate-500 uppercase"
            >
              More
            </h2>
            <div className="h-px w-full bg-slate-300" />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-300/90 bg-white shadow-[0_3px_0_rgba(15,23,42,0.06)]">
            {secondaryTaskRoutes.map((task, index) => (
              <Link
                key={task.path}
                to={task.path}
                className={`flex min-h-15 items-center gap-3 px-4 font-extrabold tracking-[0.04em] text-[#172033] transition-colors hover:bg-slate-50 ${index > 0 ? 'border-t border-slate-200' : ''}`}
              >
                <span className="text-xs font-black text-slate-400">
                  {task.order}
                </span>
                <span>{task.title.toUpperCase()}</span>
                <span
                  aria-hidden="true"
                  className="ml-auto text-xl text-slate-400"
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
