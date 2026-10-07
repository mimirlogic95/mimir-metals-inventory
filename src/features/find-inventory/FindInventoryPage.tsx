import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppHeader } from '@/app/layout/AppHeader';
import {
  formatQuantity,
  getPalletFillStatus,
} from '@/domain/pallet/createPallet';
import {
  availableInventoryTotals,
  matchingParts,
} from '@/domain/inventory/findInventory';
import type {
  FindPart,
  FindPallet,
} from '@/features/find-inventory/findInventory.api';
import {
  useFindInventory,
  useFindParts,
} from '@/features/find-inventory/useFindInventory';

const buttonClass =
  'min-h-12 rounded-xl border border-slate-400 bg-white px-4 py-2 text-sm font-black text-[#172033] focus-visible:outline-4 focus-visible:outline-amber-500';

export function FindInventoryPage() {
  const [search, setSearch] = useState('');
  const [part, setPart] = useState<FindPart | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const partsQuery = useFindParts();
  const inventoryQuery = useFindInventory(part?.id ?? null);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  const matching = matchingParts(partsQuery.data ?? [], search);
  const inventory = inventoryQuery.data;
  const showInventory =
    online && !inventoryQuery.isFetching && !inventoryQuery.isError
      ? inventory
      : null;
  const detail = showInventory?.pallets.find(
    (pallet) => pallet.id === detailId,
  );

  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
          Find Inventory
        </p>
        <h1 className="mt-1 text-2xl font-black text-[#172033] sm:text-3xl">
          {detail
            ? 'Pallet Details'
            : part
              ? 'Available Inventory'
              : 'Find a Part'}
        </h1>

        {!part ? (
          <section className="mt-5 rounded-xl border border-slate-300 bg-white p-4 shadow-[0_3px_0_rgba(15,23,42,0.08)] sm:p-6">
            <label
              htmlFor="find-part"
              className="block text-sm font-black text-slate-700"
            >
              Part number or description
            </label>
            <input
              id="find-part"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="MM-A3815 or headed anchor"
              autoComplete="off"
              className="mt-2 min-h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-lg font-bold text-[#172033] focus-visible:outline-4 focus-visible:outline-amber-500"
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-slate-600">
                Select a part to see current rack inventory.
              </p>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void partsQuery.refetch()}
                disabled={!online || partsQuery.isFetching}
              >
                REFRESH
              </button>
            </div>
            {!online || partsQuery.isError ? (
              <Notice
                title="UNABLE TO LOAD PARTS"
                message="Check the connection and try again."
              />
            ) : partsQuery.isFetching ? (
              <p role="status" className="mt-5 font-bold text-slate-600">
                Loading parts…
              </p>
            ) : matching.length === 0 ? (
              <Notice
                title="NO MATCHING PARTS"
                message="Try a part number or description."
              />
            ) : (
              <div className="mt-5 space-y-3">
                {matching.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setPart(item);
                      setDetailId(null);
                    }}
                    className="min-h-20 w-full rounded-xl border-2 border-slate-300 bg-slate-50 px-4 py-3 text-left focus-visible:outline-4 focus-visible:outline-amber-500"
                  >
                    <span className="block text-lg font-black text-[#172033]">
                      {item.part_number}
                    </span>
                    <span className="block text-sm font-semibold text-slate-600">
                      {item.description}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  if (detailId) setDetailId(null);
                  else setPart(null);
                }}
              >
                {detailId ? 'BACK TO LIST' : 'CHANGE PART'}
              </button>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void inventoryQuery.refetch()}
                disabled={!online || inventoryQuery.isFetching}
              >
                REFRESH INVENTORY
              </button>
            </div>
            <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4">
              <p className="break-words text-xl font-black text-[#172033]">
                {part.part_number}
              </p>
              <p className="mt-1 font-semibold text-slate-600">
                {part.description}
              </p>
            </div>

            {!online || inventoryQuery.isError ? (
              <Notice
                title={
                  inventory
                    ? 'INVENTORY MAY HAVE CHANGED'
                    : 'UNABLE TO LOAD INVENTORY'
                }
                message="Current inventory could not be loaded. Check the connection and refresh."
              />
            ) : inventoryQuery.isFetching || !inventory ? (
              <p role="status" className="mt-5 font-bold text-slate-600">
                Loading current inventory…
              </p>
            ) : detail ? (
              <PalletDetail
                pallet={detail}
                part={part}
                pullFirst={inventory.pallets[0]?.id === detail.id}
              />
            ) : (
              <InventoryList inventory={inventory} onOpen={setDetailId} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function InventoryList({
  inventory,
  onOpen,
}: {
  inventory: NonNullable<ReturnType<typeof useFindInventory>['data']>;
  onOpen: (id: string) => void;
}) {
  const totals = availableInventoryTotals(inventory.pallets);
  return (
    <>
      <section
        className="mt-4 rounded-xl border border-slate-300 bg-white p-4"
        aria-label="Available inventory summary"
      >
        <p className="text-xs font-black tracking-[0.16em] text-slate-600 uppercase">
          Available rack inventory
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Quantity value={totals.pallets} label="Pallets" />
          <Quantity value={totals.boxes} label="Boxes" />
          <Quantity value={totals.pieces} label="Pieces" />
        </div>
      </section>
      {inventory.heldPalletCount > 0 && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          Held inventory exists and is not included in available totals or FIFO.
        </p>
      )}
      {inventory.pallets.length === 0 ? (
        <Notice
          title="NO AVAILABLE INVENTORY"
          message="No pullable pallets are stored in a rack for this part."
        />
      ) : (
        <section className="mt-5 space-y-3" aria-label="Pallets in FIFO order">
          {inventory.pallets.map((pallet, index) => (
            <button
              key={pallet.id}
              type="button"
              onClick={() => onOpen(pallet.id)}
              className="min-h-36 w-full rounded-xl border-2 border-slate-300 bg-white p-4 text-left shadow-[0_3px_0_rgba(15,23,42,0.08)] focus-visible:outline-4 focus-visible:outline-amber-500"
            >
              {index === 0 && <PullFirstBadge />}
              <span className="mt-2 block break-words text-xl font-black text-[#172033]">
                {pallet.pallet_code}
              </span>
              <span className="mt-1 block text-lg font-black text-amber-800">
                {pallet.location.location_code}
              </span>
              <span className="mt-3 block text-base font-black text-[#172033]">
                {formatQuantity(pallet.current_boxes)} boxes ·{' '}
                {formatQuantity(pallet.current_pieces)} pieces
              </span>
              <span className="mt-1 block text-sm font-bold text-slate-600">
                {getPalletFillStatus(
                  pallet.current_boxes,
                  pallet.boxes_per_full_pallet_snapshot,
                )}{' '}
                · Packed {formatPackedDate(pallet.packed_at)}
              </span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}

function PalletDetail({
  pallet,
  part,
  pullFirst,
}: {
  pallet: FindPallet;
  part: FindPart;
  pullFirst: boolean;
}) {
  return (
    <section
      className="mt-4 rounded-xl border border-slate-300 bg-white p-4 sm:p-6"
      aria-label="Pallet details"
    >
      {pullFirst && <PullFirstBadge />}
      <h2 className="mt-2 break-words text-2xl font-black text-[#172033]">
        {pallet.pallet_code}
      </h2>
      <p className="mt-1 text-lg font-black text-amber-800">
        {pallet.location.location_code}
      </p>
      <dl className="mt-4 divide-y divide-slate-200">
        <DetailRow label="Part" value={part.part_number} />
        <DetailRow label="Description" value={part.description} />
        <DetailRow label="Boxes" value={formatQuantity(pallet.current_boxes)} />
        <DetailRow
          label="Pieces"
          value={formatQuantity(pallet.current_pieces)}
        />
        <DetailRow
          label="Fill"
          value={getPalletFillStatus(
            pallet.current_boxes,
            pallet.boxes_per_full_pallet_snapshot,
          )}
        />
        <DetailRow label="Heat" value={pallet.heat_number} />
        <DetailRow label="Lot" value={pallet.lot_number} />
        {pallet.machine_code && (
          <DetailRow label="Machine" value={pallet.machine_code} />
        )}
        <DetailRow label="Packed" value={formatPackedDate(pallet.packed_at)} />
        <DetailRow label="Status" value="STORED" />
      </dl>
      <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm font-bold text-slate-600">
        Read-only view. Inventory may change; refresh before taking action.
      </p>
      <Link
        to={`/pull?code=${encodeURIComponent(pallet.pallet_code)}`}
        className="mt-4 flex min-h-14 items-center justify-center rounded-xl bg-[#111d2d] px-5 py-3 text-base font-black text-white focus-visible:outline-4 focus-visible:outline-amber-500"
      >
        PULL BOXES
      </Link>
    </section>
  );
}

function formatPackedDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function PullFirstBadge() {
  return (
    <span className="inline-block rounded-md bg-amber-400 px-3 py-1 text-sm font-black tracking-[0.08em] text-[#111d2d]">
      PULL FIRST
    </span>
  );
}

function Quantity({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-xl font-black text-[#172033] sm:text-2xl">
        {formatQuantity(value)}
      </p>
      <p className="text-xs font-black text-slate-600 uppercase">{label}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-3 text-sm">
      <dt className="font-bold text-slate-600">{label}</dt>
      <dd className="min-w-0 break-words text-right font-black text-[#172033]">
        {value}
      </dd>
    </div>
  );
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4"
    >
      <p className="font-black tracking-wide text-amber-900">{title}</p>
      <p className="mt-1 text-sm font-semibold text-amber-900">{message}</p>
    </div>
  );
}
