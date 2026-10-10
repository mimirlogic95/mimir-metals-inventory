import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { AppHeader } from '@/app/layout/AppHeader';
import {
  getShippingIssue,
  sameReviewedShippingPallet,
  shippingCodeSchema,
  shippingNoteSchema,
  shippingReferenceSchema,
  type ShippingIssue,
} from '@/domain/inventory/shipping';
import {
  formatQuantity,
  getPalletFillStatus,
} from '@/domain/pallet/createPallet';
import type {
  ReviewedShippingState,
  ShipRequest,
  ShippingLocation,
  ShippingPallet,
  StageRequest,
} from '@/features/shipping/shipping.api';
import {
  useShipPalletMutation,
  useShippingLocations,
  useShippingPallet,
  useStagePalletMutation,
} from '@/features/shipping/useShipping';

type Step =
  'identify' | 'choose' | 'references' | 'review-stage' | 'review-ship';
type StageReview = { pallet: ShippingPallet; destination: ShippingLocation };
type ShipReview = {
  pallet: ShippingPallet;
  po: string | null;
  bol: string | null;
  note: string | null;
};

const primary =
  'min-h-14 w-full rounded-xl bg-[#111d2d] px-5 py-3 text-base font-black text-white shadow-[0_3px_0_#d18a1a] disabled:bg-slate-400 disabled:shadow-none';
const secondary =
  'min-h-12 w-full rounded-xl border-2 border-slate-400 bg-white px-4 py-3 text-sm font-black text-[#172033]';
const input =
  'mt-2 min-h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-lg font-bold text-[#172033] focus-visible:outline-4 focus-visible:outline-amber-500';

function eligibility(pallet: ShippingPallet): ShippingIssue | null {
  if (pallet.lifecycle_status === 'on_hold')
    return getShippingIssue(new Error('PALLET_ON_HOLD'));
  if (pallet.lifecycle_status === 'shipped')
    return getShippingIssue(new Error('ALREADY_SHIPPED'));
  if (pallet.current_boxes <= 0 || pallet.current_pieces <= 0)
    return getShippingIssue(new Error('INVALID_PALLET_QUANTITY'));
  if (
    pallet.lifecycle_status === 'created' &&
    (pallet.location === null || pallet.location.location_type === 'packing')
  )
    return null;
  if (
    pallet.lifecycle_status === 'stored' &&
    pallet.location?.location_type === 'rack'
  )
    return null;
  if (
    pallet.lifecycle_status === 'shipping_staging' &&
    pallet.location?.location_type === 'shipping_staging'
  )
    return null;
  return getShippingIssue(new Error('PALLET_NOT_ELIGIBLE'));
}

function reviewedState(
  pallet: ShippingPallet,
): Omit<ReviewedShippingState, 'idempotencyKey'> {
  return {
    palletCode: pallet.pallet_code,
    expectedCurrentLocationId: pallet.current_location_id,
    expectedLifecycleStatus: pallet.lifecycle_status,
    expectedCurrentBoxes: pallet.current_boxes,
    expectedCurrentPieces: pallet.current_pieces,
    expectedInventoryVersion: pallet.inventory_version,
  };
}

export function ShippingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('code') ?? '';
  const parsedInitial = shippingCodeSchema.safeParse(initial);
  const [codeInput, setCodeInput] = useState(initial);
  const [code, setCode] = useState<string | null>(
    parsedInitial.success ? parsedInitial.data : null,
  );
  const [step, setStep] = useState<Step>(
    parsedInitial.success ? 'choose' : 'identify',
  );
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [poInput, setPoInput] = useState('');
  const [bolInput, setBolInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [issue, setIssue] = useState<ShippingIssue | null>(null);
  const [stageReview, setStageReview] = useState<StageReview | null>(null);
  const [shipReview, setShipReview] = useState<ShipReview | null>(null);
  const [stageRequest, setStageRequest] = useState<StageRequest | null>(null);
  const [shipRequest, setShipRequest] = useState<ShipRequest | null>(null);
  const palletQuery = useShippingPallet(code);
  const locationsQuery = useShippingLocations();
  const stageMutation = useStagePalletMutation();
  const shipMutation = useShipPalletMutation();
  const pallet =
    !palletQuery.isFetching && !palletQuery.isError
      ? palletQuery.data
      : undefined;
  const blocked = pallet ? eligibility(pallet) : null;

  function lookUp() {
    const parsed = shippingCodeSchema.safeParse(codeInput);
    if (!parsed.success) {
      setIssue({
        title: 'PALLET CODE REQUIRED',
        message: parsed.error.issues[0]?.message ?? 'Enter a pallet code.',
      });
      return;
    }
    setIssue(null);
    setCodeInput(parsed.data);
    setCode(parsed.data);
    setSearchParams({ code: parsed.data });
    setStep('choose');
    setStageReview(null);
    setShipReview(null);
    setStageRequest(null);
    setShipRequest(null);
    stageMutation.reset();
    shipMutation.reset();
    if (code === parsed.data) void palletQuery.refetch();
  }

  async function refreshReviewedPallet(
    previous: ShippingPallet,
  ): Promise<ShippingPallet | null> {
    setIssue(null);
    const refreshed = await palletQuery.refetch();
    if (refreshed.status !== 'success' || !refreshed.data) {
      setIssue(getShippingIssue(new Error('PALLET_LOOKUP_FAILED'), 'lookup'));
      return null;
    }
    if (!sameReviewedShippingPallet(previous, refreshed.data)) {
      setIssue(getShippingIssue(new Error('INVENTORY_CHANGED')));
      return null;
    }
    const problem = eligibility(refreshed.data);
    if (problem) {
      setIssue(problem);
      return null;
    }
    return refreshed.data;
  }

  async function reviewStage() {
    if (
      !pallet ||
      blocked ||
      !destinationId ||
      pallet.lifecycle_status === 'shipping_staging'
    )
      return;
    const [fresh, locations] = await Promise.all([
      refreshReviewedPallet(pallet),
      locationsQuery.refetch(),
    ]);
    if (!fresh) return;
    if (locations.status !== 'success' || !locations.data) {
      setIssue(getShippingIssue(new Error('LOCATION_LOOKUP_FAILED'), 'lookup'));
      return;
    }
    const destination = locations.data.find(
      (location) => location.id === destinationId,
    );
    if (!destination) {
      setIssue(getShippingIssue(new Error('INVALID_SHIPPING_LOCATION')));
      return;
    }
    setStageReview({ pallet: fresh, destination });
    setStageRequest(null);
    setStep('review-stage');
  }

  async function reviewShip() {
    if (!pallet || blocked || pallet.lifecycle_status === 'created') return;
    const po = shippingReferenceSchema.safeParse(poInput);
    const bol = shippingReferenceSchema.safeParse(bolInput);
    const note = shippingNoteSchema.safeParse(noteInput);
    if (!po.success || !bol.success || !note.success) {
      setIssue({
        title: 'CHECK SHIPPING REFERENCES',
        message:
          po.error?.issues[0]?.message ??
          bol.error?.issues[0]?.message ??
          note.error?.issues[0]?.message ??
          'Check the reference fields.',
      });
      return;
    }
    const fresh = await refreshReviewedPallet(pallet);
    if (!fresh || fresh.lifecycle_status === 'created') return;
    setShipReview({
      pallet: fresh,
      po: po.data || null,
      bol: bol.data || null,
      note: note.data || null,
    });
    setShipRequest(null);
    setStep('review-ship');
  }

  function confirmStage() {
    if (!stageReview || stageMutation.isPending) return;
    const frozen: StageRequest = stageRequest ?? {
      ...reviewedState(stageReview.pallet),
      destinationLocationId: stageReview.destination.id,
      idempotencyKey: crypto.randomUUID(),
    };
    setStageRequest(frozen);
    stageMutation.mutate(frozen);
  }

  function confirmShip() {
    if (!shipReview || shipMutation.isPending) return;
    const frozen: ShipRequest = shipRequest ?? {
      ...reviewedState(shipReview.pallet),
      poReference: shipReview.po,
      bolReference: shipReview.bol,
      reasonNotes: shipReview.note,
      idempotencyKey: crypto.randomUUID(),
    };
    setShipRequest(frozen);
    shipMutation.mutate(frozen);
  }

  function restart() {
    setIssue(null);
    setStageReview(null);
    setShipReview(null);
    setStageRequest(null);
    setShipRequest(null);
    stageMutation.reset();
    shipMutation.reset();
    setStep('choose');
    void palletQuery.refetch();
  }

  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
          Shipping & Dispatch
        </p>
        <h1 className="mt-1 text-2xl leading-tight font-black text-[#172033] sm:text-3xl">
          {shipMutation.data
            ? 'Pallet Shipped'
            : stageMutation.data
              ? 'Pallet Staged'
              : step === 'identify'
                ? 'Identify Pallet'
                : step === 'choose'
                  ? 'Choose Shipping Action'
                  : step === 'references'
                    ? 'Shipment References'
                    : step === 'review-stage'
                      ? 'Review Staging'
                      : 'Review Shipment'}
        </h1>
        <section className="mt-4 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_3px_0_rgba(15,23,42,0.08)]">
          <div
            className={`h-1.5 ${shipMutation.data ? 'bg-emerald-500' : 'bg-amber-400'}`}
          />
          <div className="p-4 sm:p-6">
            {shipMutation.data ? (
              <div aria-live="polite">
                <p className="font-black text-emerald-800">
                  PALLET SHIPPED — NO LONGER IN WAREHOUSE INVENTORY
                </p>
                <ResultRows
                  rows={[
                    ['Pallet', shipMutation.data.pallet_code],
                    ['Part', shipMutation.data.part_number],
                    [
                      'Shipped boxes',
                      formatQuantity(shipMutation.data.shipped_boxes),
                    ],
                    [
                      'Shipped pieces',
                      formatQuantity(shipMutation.data.shipped_pieces),
                    ],
                    ['From', shipMutation.data.source_location_code],
                    ['PO', shipMutation.data.po_reference ?? 'Not supplied'],
                    ['BOL', shipMutation.data.bol_reference ?? 'Not supplied'],
                    ...(shipMutation.data.reason_notes
                      ? ([['Note', shipMutation.data.reason_notes]] as [
                          string,
                          string,
                        ][])
                      : []),
                    ['By', shipMutation.data.actor_name],
                    [
                      'When',
                      new Date(shipMutation.data.shipped_at).toLocaleString(),
                    ],
                  ]}
                />
                <Link
                  to="/"
                  className={`${primary} mt-5 flex items-center justify-center`}
                >
                  DONE
                </Link>
                <button
                  type="button"
                  onClick={restart}
                  className={`${secondary} mt-3`}
                >
                  VIEW PALLET
                </button>
              </div>
            ) : stageMutation.data ? (
              <div aria-live="polite">
                <p className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 font-black text-amber-900">
                  STAGED — NOT SHIPPED YET
                </p>
                <ResultRows
                  rows={[
                    ['Pallet', stageMutation.data.pallet_code],
                    ['Part', stageMutation.data.part_number],
                    [
                      'From',
                      stageMutation.data.previous_location_code ??
                        'Packing / unlocated',
                    ],
                    ['Now', stageMutation.data.staging_location_code],
                    ['Boxes', formatQuantity(stageMutation.data.current_boxes)],
                    [
                      'Pieces',
                      formatQuantity(stageMutation.data.current_pieces),
                    ],
                    ['By', stageMutation.data.actor_name],
                    [
                      'When',
                      new Date(stageMutation.data.staged_at).toLocaleString(),
                    ],
                  ]}
                />
                <button
                  type="button"
                  onClick={restart}
                  className={`${primary} mt-5`}
                >
                  CONTINUE TO DISPATCH
                </button>
                <Link
                  to="/"
                  className={`${secondary} mt-3 flex items-center justify-center`}
                >
                  DONE FOR NOW
                </Link>
              </div>
            ) : step === 'identify' ? (
              <div>
                <p className="text-sm font-semibold text-slate-600">
                  Enter the permanent pallet label code.
                </p>
                <label
                  htmlFor="shipping-pallet-code"
                  className="mt-5 block text-sm font-black"
                >
                  Pallet code
                </label>
                <input
                  id="shipping-pallet-code"
                  value={codeInput}
                  onChange={(event) => setCodeInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') lookUp();
                  }}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className={input}
                />
                <button
                  type="button"
                  onClick={lookUp}
                  className={`${primary} mt-4`}
                >
                  LOOK UP PALLET
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setStep('identify')}
                  className="min-h-11 text-sm font-black text-slate-700 underline"
                >
                  CHANGE PALLET
                </button>
                {palletQuery.isFetching && (
                  <p role="status" className="mt-4">
                    Loading current pallet…
                  </p>
                )}
                {palletQuery.isError && (
                  <Issue
                    issue={getShippingIssue(palletQuery.error, 'lookup')}
                  />
                )}
                {pallet && <PalletCard pallet={pallet} />}
                {blocked && <Issue issue={blocked} />}
                {pallet && !blocked && step === 'choose' && (
                  <div className="mt-5 space-y-3">
                    {pallet.lifecycle_status !== 'shipping_staging' && (
                      <div>
                        <p className="text-sm font-bold text-slate-700">
                          Move to a shared shipping-staging location. This does
                          not ship or reduce inventory.
                        </p>
                        {locationsQuery.isError && (
                          <Issue
                            issue={getShippingIssue(
                              locationsQuery.error,
                              'lookup',
                            )}
                          />
                        )}
                        {locationsQuery.isFetching && (
                          <p role="status">Loading shipping locations…</p>
                        )}
                        {locationsQuery.data?.map((location) => (
                          <button
                            key={location.id}
                            type="button"
                            onClick={() => setDestinationId(location.id)}
                            aria-pressed={destinationId === location.id}
                            className={`mt-2 min-h-14 w-full rounded-xl border-2 px-4 py-3 text-left font-black ${destinationId === location.id ? 'border-amber-600 bg-amber-50' : 'border-slate-300 bg-slate-50'}`}
                          >
                            {location.location_code}
                          </button>
                        ))}
                        {locationsQuery.data?.length === 0 && (
                          <Issue
                            issue={getShippingIssue(
                              new Error('INVALID_SHIPPING_LOCATION'),
                            )}
                          />
                        )}
                        <button
                          type="button"
                          disabled={!destinationId}
                          onClick={() => void reviewStage()}
                          className={`${primary} mt-3`}
                        >
                          REVIEW STAGING
                        </button>
                      </div>
                    )}
                    {pallet.lifecycle_status !== 'created' && (
                      <button
                        type="button"
                        onClick={() => setStep('references')}
                        className={secondary}
                      >
                        DISPATCH PALLET
                      </button>
                    )}
                    {pallet.lifecycle_status === 'created' && (
                      <p className="rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">
                        Hot jobs stage first; no warehouse rack is required.
                      </p>
                    )}
                    {pallet.lifecycle_status === 'shipping_staging' && (
                      <p className="rounded-lg bg-amber-50 p-3 font-black text-amber-900">
                        NOT SHIPPED YET
                      </p>
                    )}
                  </div>
                )}
                {pallet && !blocked && step === 'references' && (
                  <div className="mt-5">
                    <p className="text-sm font-bold text-slate-700">
                      PO and BOL are optional references in V1. Enter either or
                      both when provided by the paperwork.
                    </p>
                    <TextField
                      id="shipping-po"
                      label="PO NUMBER"
                      value={poInput}
                      onChange={setPoInput}
                    />
                    <TextField
                      id="shipping-bol"
                      label="BOL NUMBER"
                      value={bolInput}
                      onChange={setBolInput}
                    />
                    <TextField
                      id="shipping-note"
                      label="OPTIONAL NOTE"
                      value={noteInput}
                      onChange={setNoteInput}
                    />
                    <button
                      type="button"
                      onClick={() => void reviewShip()}
                      className={`${primary} mt-5`}
                    >
                      REVIEW SHIPMENT
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('choose')}
                      className={`${secondary} mt-3`}
                    >
                      BACK TO ACTIONS
                    </button>
                  </div>
                )}
                {step === 'review-stage' && stageReview && (
                  <div className="mt-5">
                    <p className="font-bold text-slate-700">
                      Nothing changes until you confirm. This pallet will remain
                      in the facility.
                    </p>
                    <ResultRows
                      rows={[
                        ['Pallet', stageReview.pallet.pallet_code],
                        [
                          'From',
                          stageReview.pallet.location?.location_code ??
                            'Packing / unlocated',
                        ],
                        ['To', stageReview.destination.location_code],
                        [
                          'Boxes',
                          formatQuantity(stageReview.pallet.current_boxes),
                        ],
                        [
                          'Pieces',
                          formatQuantity(stageReview.pallet.current_pieces),
                        ],
                        ['Action', 'STAGE — NOT SHIPPED'],
                      ]}
                    />
                    {stageMutation.isError && (
                      <Issue issue={getShippingIssue(stageMutation.error)} />
                    )}
                    {(!stageMutation.isError ||
                      getShippingIssue(stageMutation.error).title ===
                        'NOT SAVED YET') && (
                      <button
                        type="button"
                        disabled={stageMutation.isPending}
                        onClick={confirmStage}
                        className={`${primary} mt-5`}
                      >
                        {stageMutation.isPending
                          ? 'STAGING…'
                          : stageMutation.isError
                            ? 'RETRY SAME STAGING'
                            : 'CONFIRM STAGING'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={restart}
                      className={`${secondary} mt-3`}
                    >
                      REFRESH / CHANGE ACTION
                    </button>
                  </div>
                )}
                {step === 'review-ship' && shipReview && (
                  <div className="mt-5">
                    <p className="font-bold text-slate-700">
                      Nothing changes until you confirm dispatch.
                    </p>
                    <ResultRows
                      rows={[
                        ['Pallet', shipReview.pallet.pallet_code],
                        ['Part', shipReview.pallet.part.part_number],
                        [
                          'From',
                          shipReview.pallet.location?.location_code ?? '—',
                        ],
                        [
                          'Boxes shipping',
                          formatQuantity(shipReview.pallet.current_boxes),
                        ],
                        [
                          'Pieces shipping',
                          formatQuantity(shipReview.pallet.current_pieces),
                        ],
                        ['PO', shipReview.po ?? 'Not supplied'],
                        ['BOL', shipReview.bol ?? 'Not supplied'],
                        ['Action', 'DISPATCH PALLET'],
                      ]}
                    />
                    <p className="mt-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 font-black text-amber-900">
                      THIS PALLET WILL NO LONGER BE AVAILABLE IN WAREHOUSE
                      INVENTORY.
                    </p>
                    {shipMutation.isError && (
                      <Issue issue={getShippingIssue(shipMutation.error)} />
                    )}
                    {(!shipMutation.isError ||
                      getShippingIssue(shipMutation.error).title ===
                        'NOT SAVED YET') && (
                      <button
                        type="button"
                        disabled={shipMutation.isPending}
                        onClick={confirmShip}
                        className={`${primary} mt-5`}
                      >
                        {shipMutation.isPending
                          ? 'SHIPPING…'
                          : shipMutation.isError
                            ? 'RETRY SAME SHIPMENT'
                            : 'CONFIRM SHIPMENT'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={restart}
                      className={`${secondary} mt-3`}
                    >
                      REFRESH / CHANGE ACTION
                    </button>
                  </div>
                )}
              </div>
            )}
            {issue && <Issue issue={issue} />}
          </div>
        </section>
      </main>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <label htmlFor={id} className="block text-sm font-black text-slate-700">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        className={input}
      />
    </div>
  );
}

function PalletCard({ pallet }: { pallet: ShippingPallet }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
      <p className="break-words text-2xl font-black text-[#172033]">
        {pallet.pallet_code}
      </p>
      <p className="mt-1 font-black">{pallet.part.part_number}</p>
      <p className="text-sm font-semibold text-slate-600">
        {pallet.part.description}
      </p>
      <p className="mt-3 text-sm font-black text-amber-800">CURRENT LOCATION</p>
      <p className="break-words text-xl font-black">
        {pallet.location?.location_code ??
          (pallet.lifecycle_status === 'shipped'
            ? 'NO CURRENT LOCATION'
            : 'PACKING / UNLOCATED')}
      </p>
      <p className="mt-3 text-xl font-black">
        {formatQuantity(pallet.current_boxes)} boxes ·{' '}
        {formatQuantity(pallet.current_pieces)} pieces
      </p>
      <p className="mt-1 text-sm font-bold text-slate-600">
        CURRENT FACILITY QUANTITY ·{' '}
        {pallet.lifecycle_status === 'shipped'
          ? 'SHIPPED'
          : getPalletFillStatus(
              pallet.current_boxes,
              pallet.boxes_per_full_pallet_snapshot,
            )}{' '}
        · {pallet.lifecycle_status.toUpperCase().replaceAll('_', ' ')}
      </p>
    </div>
  );
}

function ResultRows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-300 bg-slate-50 px-4">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-2 py-3 text-sm"
        >
          <dt className="font-bold text-slate-600">{label}</dt>
          <dd className="min-w-0 break-words text-right font-black text-[#172033]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Issue({ issue }: { issue: ShippingIssue }) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4"
    >
      <p className="font-black text-red-800">{issue.title}</p>
      <p className="mt-1 text-sm font-bold text-red-700">{issue.message}</p>
    </div>
  );
}
