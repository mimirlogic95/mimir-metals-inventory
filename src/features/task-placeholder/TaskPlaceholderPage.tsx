import { AppHeader } from '@/app/layout/AppHeader';

type TaskPlaceholderPageProps = {
  title: string;
};

export function TaskPlaceholderPage({ title }: TaskPlaceholderPageProps) {
  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />

      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_3px_0_rgba(15,23,42,0.08)]">
          <div className="h-1.5 bg-amber-400" />
          <div className="p-5 sm:p-7">
            <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
              Task
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-[#172033] sm:text-3xl">
              {title}
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 font-medium text-slate-600">
              Coming in a later mission.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
