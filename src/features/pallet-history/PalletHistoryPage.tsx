import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AppHeader } from '@/app/layout/AppHeader';
import {
  formatQuantity,
  getPalletFillStatus,
} from '@/domain/pallet/createPallet';
import {
  formatHistoryTimestamp,
  historyCodeSchema,
  shipmentQuantity,
} from '@/domain/transaction/history';
import { HistoryEventCard } from '@/features/pallet-history/HistoryEventCard';
import type { HistoryPallet } from '@/features/pallet-history/palletHistory.api';
import {
  useHistoryPallet,
  usePalletTimeline,
} from '@/features/pallet-history/usePalletHistory';

const buttonClass =
  'min-h-12 rounded-xl border-2 border-[#111d2d] bg-white px-4 py-2 text-sm font-black text-[#111d2d] focus-visible:outline-4 focus-visible:outline-amber-500';

function issueFor(error: unknown): { title: string; message: string } {
  const code = error instanceof Error ? error.message : '';
  if (code === 'PALLET_NOT_FOUND') {
    return {
      title: 'PALLET NOT FOUND',
      message: 'Check the pallet code and search again.',
    };
  }
  if (code === 'ACCESS_DENIED' || code === 'AUTHENTICATION_REQUIRED') {
    return {
      title: 'ACCESS DENIED',
      message: 'Sign in with an active worker or supervisor account.',
    };
  }
  return {
    title: "COULDN'T LOAD",
    message: 'Check your connection and try again.',
  };
}

export function PalletHistoryPage() {
  const [params, setParams] = useSearchParams();
  const urlCode = params.get('code');
  const parsedCode =
    urlCode === null ? null : historyCodeSchema.safeParse(urlCode);
  const code = parsedCode?.success ? parsedCode.data : null;
  const [online, setOnline] = useState(() => navigator.onLine);
  const palletQuery = useHistoryPallet(code);
  const pallet =
    online && !palletQuery.isFetching && !palletQuery.isError
      ? palletQuery.data
      : undefined;
  const timelineQuery = usePalletTimeline(pallet?.id ?? null);
  const events = timelineQuery.data?.pages.flatMap((page) => page.events) ?? [];
  const shipment = events.find((event) => event.transactionType === 'shipped');

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  function search(normalizedCode: string) {
    setParams({ code: normalizedCode });
    if (normalizedCode === code) {
      void palletQuery.refetch();
      void timelineQuery.refetch();
    }
  }

  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
          Read-only pallet lookup
        </p>
        <h1 className="mt-1 text-2xl font-black text-[#172033] sm:text-3xl">
          Inventory History
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          Find a pallet, including one that has already shipped. History shows
          what happened; Find shows inventory available now.
        </p>

        <HistorySearch
          key={urlCode ?? ''}
          initialCode={urlCode ?? ''}
          onSearch={search}
        />

        {urlCode === null ? (
          <p className="mt-5 rounded-xl border border-slate-300 bg-white p-4 font-semibold text-slate-600">
            Enter a pallet code to see its current state and complete saved
            history.
          </p>
        ) : !parsedCode?.success ? (
          <Issue
            title="PALLET NOT FOUND"
            message="Enter a valid pallet code and search again."
          />
        ) : !online ? (
          <Issue
            title="COULDN'T LOAD"
            message="Reconnect to load authoritative pallet history."
          />
        ) : palletQuery.isFetching || palletQuery.isPending ? (
          <p role="status" className="mt-5 font-bold text-slate-600">
            Loading pallet…
          </p>
        ) : palletQuery.isError ? (
          <Issue {...issueFor(palletQuery.error)} />
        ) : pallet ? (
          <>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  void palletQuery.refetch();
                  void timelineQuery.refetch();
                }}
                disabled={palletQuery.isFetching || timelineQuery.isFetching}
              >
                REFRESH HISTORY
              </button>
            </div>
            <PalletOverview
              pallet={pallet}
              shipment={shipment ? shipmentQuantity(shipment) : null}
            />
            <section className="mt-6" aria-label="Pallet transaction history">
              <h2 className="text-xl font-black text-[#172033]">
                Saved Events
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Newest first · database times shown in your local time zone
              </p>
              {timelineQuery.isPending ? (
                <p role="status" className="mt-4 font-bold text-slate-600">
                  Loading events…
                </p>
              ) : timelineQuery.isError && events.length === 0 ? (
                <Issue
                  title="COULDN'T LOAD"
                  message="The pallet loaded, but its history did not. Try again."
                />
              ) : (
                <>
                  {(timelineQuery.isError ||
                    timelineQuery.isFetchNextPageError) && (
                    <Issue
                      title="INCOMPLETE HISTORY"
                      message="Older events may be missing. Check the connection and try loading more."
                    />
                  )}
                  {events.length === 0 ? (
                    <Issue
                      title="NO HISTORY AVAILABLE"
                      message="No saved events were returned for this pallet."
                    />
                  ) : (
                    <ol className="mt-4 space-y-3">
                      {events.map((event) => (
                        <li key={event.id}>
                          <HistoryEventCard event={event} />
                        </li>
                      ))}
                    </ol>
                  )}
                  {timelineQuery.hasNextPage && (
                    <button
                      type="button"
                      className={`${buttonClass} mt-4 w-full`}
                      onClick={() => void timelineQuery.fetchNextPage()}
                      disabled={timelineQuery.isFetchingNextPage}
                    >
                      {timelineQuery.isFetchingNextPage
                        ? 'LOADING OLDER EVENTS…'
                        : 'LOAD OLDER EVENTS'}
                    </button>
                  )}
                </>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function HistorySearch({
  initialCode,
  onSearch,
}: {
  initialCode: string;
  onSearch: (normalizedCode: string) => void;
}) {
  const [input, setInput] = useState(initialCode);
  const [inputError, setInputError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = historyCodeSchema.safeParse(input);
    if (!parsed.success) {
      setInputError(
        parsed.error.issues[0]?.message ?? 'Enter a valid pallet code.',
      );
      return;
    }
    setInputError(null);
    onSearch(parsed.data);
  }

  return (
    <form
      onSubmit={submit}
      className="mt-5 rounded-xl border border-slate-300 bg-white p-4 sm:p-5"
    >
      <label
        htmlFor="history-code"
        className="block text-sm font-black text-slate-700"
      >
        Pallet code
      </label>
      <input
        id="history-code"
        type="search"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Enter pallet code"
        autoCapitalize="characters"
        autoComplete="off"
        className="mt-2 min-h-14 w-full min-w-0 rounded-xl border-2 border-slate-400 bg-white px-4 text-lg font-bold text-[#172033] focus-visible:outline-4 focus-visible:outline-amber-500"
      />
      {inputError && (
        <p role="alert" className="mt-2 text-sm font-bold text-red-800">
          {inputError}
        </p>
      )}
      <button
        type="submit"
        className="mt-3 min-h-14 w-full rounded-xl bg-[#111d2d] px-5 py-3 text-base font-black text-white focus-visible:outline-4 focus-visible:outline-amber-500"
      >
        LOOK UP PALLET
      </button>
    </form>
  );
}

function PalletOverview({
  pallet,
  shipment,
}: {
  pallet: HistoryPallet;
  shipment: { boxes: number; pieces: number } | null;
}) {
  return (
    <section
      aria-label="Pallet overview"
      className="mt-4 rounded-xl border border-slate-300 bg-white p-4 sm:p-6"
    >
      <h2 className="break-words text-2xl font-black text-[#172033]">
        {pallet.pallet_code}
      </h2>
      <p className="mt-1 break-words text-lg font-black text-amber-800">
        {pallet.part.part_number}
      </p>
      <p className="break-words text-sm font-semibold text-slate-600">
        {pallet.part.description}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <OverviewGroup title="CURRENT INVENTORY">
          <p className="text-xl font-black text-[#172033]">
            {formatQuantity(pallet.current_boxes)} boxes /{' '}
            {formatQuantity(pallet.current_pieces)} pieces
          </p>
          <p className="mt-1 font-bold text-slate-700">
            {pallet.lifecycle_status.replaceAll('_', ' ').toUpperCase()}
          </p>
          <p className="mt-1 break-words font-semibold text-slate-600">
            {pallet.location?.location_code ?? 'No current warehouse location'}
          </p>
          {pallet.lifecycle_status !== 'shipped' && (
            <p className="mt-1 font-bold text-slate-600">
              {getPalletFillStatus(
                pallet.current_boxes,
                pallet.boxes_per_full_pallet_snapshot,
              )}
            </p>
          )}
          {pallet.hold_reason && (
            <p className="mt-1 break-words text-sm text-amber-900">
              Hold: {pallet.hold_reason}
            </p>
          )}
        </OverviewGroup>
        <OverviewGroup title="ORIGINALLY PACKED">
          <p className="text-xl font-black text-[#172033]">
            {formatQuantity(pallet.original_boxes)} boxes /{' '}
            {formatQuantity(pallet.original_pieces)} pieces
          </p>
          <p className="mt-1 font-bold text-slate-600">
            {getPalletFillStatus(
              pallet.original_boxes,
              pallet.boxes_per_full_pallet_snapshot,
            )}{' '}
            at packing
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            Packed {formatHistoryTimestamp(pallet.packed_at)}
          </p>
        </OverviewGroup>
      </div>
      {pallet.lifecycle_status === 'shipped' && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-black text-amber-900 uppercase">
            PREVIOUSLY SHIPPED
          </p>
          <p className="mt-1 font-black text-amber-950">
            {shipment
              ? `${formatQuantity(shipment.boxes)} boxes / ${formatQuantity(shipment.pieces)} pieces`
              : 'Shipment quantity is in the saved event below.'}
          </p>
        </div>
      )}
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <Detail label="Heat" value={pallet.heat_number} />
        <Detail label="Lot" value={pallet.lot_number} />
        {pallet.machine_code && (
          <Detail label="Machine" value={pallet.machine_code} />
        )}
      </dl>
    </section>
  );
}

function OverviewGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <h3 className="text-xs font-black tracking-wide text-slate-600">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <dt className="font-black text-slate-600">{label}</dt>
      <dd className="break-words font-bold text-[#172033]">{value}</dd>
    </div>
  );
}

function Issue({ title, message }: { title: string; message: string }) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4"
    >
      <p className="font-black text-amber-950">{title}</p>
      <p className="mt-1 text-sm font-semibold text-amber-900">{message}</p>
    </div>
  );
}
