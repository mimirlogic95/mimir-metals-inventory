import { Link } from 'react-router-dom';

type AppHeaderProps = {
  backTo?: string;
};

export function AppHeader({ backTo }: AppHeaderProps) {
  return (
    <header className="bg-[#111d2d] text-white shadow-[0_2px_10px_rgba(15,23,42,0.24)]">
      <div className="mx-auto flex min-h-16 w-full max-w-3xl items-center gap-3 px-4 py-2 sm:px-6">
        {backTo ? (
          <Link
            to={backTo}
            aria-label="Back to home"
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/20 bg-white/10 text-2xl font-semibold transition-colors hover:bg-white/15"
          >
            <span aria-hidden="true">‹</span>
          </Link>
        ) : (
          <div
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-amber-400/45 bg-amber-400 text-sm font-black tracking-[-0.04em] text-[#111d2d]"
          >
            MM
          </div>
        )}

        <div className="min-w-0 leading-none">
          <p className="truncate text-sm font-black tracking-[0.14em] text-white">
            MIMIR METALS
          </p>
          <p className="mt-1.5 truncate text-[0.68rem] font-semibold tracking-[0.18em] text-slate-300 uppercase">
            Finished Goods
          </p>
        </div>

        <span className="ml-auto hidden rounded-full border border-white/15 px-3 py-1.5 text-[0.65rem] font-bold tracking-[0.14em] text-slate-300 uppercase sm:inline">
          Floor Operations
        </span>
      </div>
    </header>
  );
}
