import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { AppHeader } from '@/app/layout/AppHeader';
import {
  formatQuantity,
  getPalletFillStatus,
} from '@/domain/pallet/createPallet';
import {
  getMoveIssue,
  moveCodeSchema,
  type MoveIssue,
} from '@/domain/pallet/movePallet';
import {
  type MovePallet,
  type MoveRack,
  type MoveRequest,
  type MoveResult,
} from '@/features/move-pallet/movePallet.api';
import {
  useMovePalletMutation,
  useMoveRack,
  usePalletForMove,
} from '@/features/move-pallet/useMovePallet';

type Step = 'identify' | 'destination' | 'review';
type ReviewedMove = { pallet: MovePallet; rack: MoveRack };

const primary =
  'min-h-14 w-full rounded-xl bg-[#111d2d] px-5 py-3 text-base font-black text-white shadow-[0_3px_0_#d18a1a] disabled:bg-slate-400 disabled:shadow-none';
const secondary =
  'min-h-12 w-full rounded-xl border border-slate-400 bg-white px-4 py-3 text-sm font-black text-[#172033]';
const inputClass =
  'mt-2 min-h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-lg font-bold text-[#172033] focus-visible:outline-4 focus-visible:outline-amber-500';

function eligibilityIssue(pallet: MovePallet): MoveIssue | null {
  if (pallet.lifecycle_status === 'on_hold')
    return getMoveIssue(new Error('PALLET_ON_HOLD'));
  if (pallet.lifecycle_status === 'shipped')
    return getMoveIssue(new Error('PALLET_SHIPPED'));
  if (
    pallet.lifecycle_status !== 'stored' ||
    !pallet.current_location_id ||
    pallet.location?.location_type !== 'rack'
  ) {
    return getMoveIssue(new Error('PALLET_NOT_STORED'));
  }
  return null;
}

export function MovePalletPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';
  const parsedInitialCode = moveCodeSchema.safeParse(initialCode);
  const [codeInput, setCodeInput] = useState(initialCode);
  const [code, setCode] = useState<string | null>(
    parsedInitialCode.success ? parsedInitialCode.data : null,
  );
  const [rackInput, setRackInput] = useState('');
  const [rackCode, setRackCode] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(
    parsedInitialCode.success ? 'destination' : 'identify',
  );
  const [localIssue, setLocalIssue] = useState<MoveIssue | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedMove | null>(null);
  const [request, setRequest] = useState<MoveRequest | null>(null);
  const palletQuery = usePalletForMove(code);
  const rackQuery = useMoveRack(rackCode);
  const mutation = useMovePalletMutation();
  const pallet = palletQuery.data;
  const rack = rackQuery.data;
  const success = mutation.data;
  const blocked = pallet ? eligibilityIssue(pallet) : null;

  function lookUpPallet() {
    const parsed = moveCodeSchema.safeParse(codeInput);
    if (!parsed.success) {
      setLocalIssue({
        title: 'PALLET CODE REQUIRED',
        message: parsed.error.issues[0]?.message ?? 'Enter a pallet code.',
      });
      return;
    }
    setLocalIssue(null);
    setCodeInput(parsed.data);
    setCode(parsed.data);
    setSearchParams({ code: parsed.data });
    setStep('destination');
    setRackCode(null);
    setReviewed(null);
    setRequest(null);
    mutation.reset();
    if (code === parsed.data) void palletQuery.refetch();
  }

  function checkRack() {
    const parsed = moveCodeSchema.safeParse(rackInput);
    if (!parsed.success) {
      setLocalIssue({
        title: 'RACK CODE REQUIRED',
        message: parsed.error.issues[0]?.message ?? 'Enter a rack code.',
      });
      return;
    }
    setLocalIssue(null);
    setRackInput(parsed.data);
    setRackCode(parsed.data);
    setReviewed(null);
    setRequest(null);
    mutation.reset();
    if (rackCode === parsed.data) void rackQuery.refetch();
  }

  async function reviewMove() {
    if (
      !pallet ||
      !rack ||
      blocked ||
      rack.occupied ||
      !pallet.current_location_id
    )
      return;
    setLocalIssue(null);
    const [freshPallet, freshRack] = await Promise.all([
      palletQuery.refetch(),
      rackQuery.refetch(),
    ]);
    if (
      freshPallet.status !== 'success' ||
      !freshPallet.data ||
      freshRack.status !== 'success' ||
      !freshRack.data
    ) {
      setLocalIssue({
        title: 'UNABLE TO REFRESH',
        message: 'Check the connection and try again.',
      });
      return;
    }
    if (
      freshPallet.data.current_location_id !== pallet.current_location_id ||
      freshPallet.data.lifecycle_status !== pallet.lifecycle_status
    ) {
      setLocalIssue(getMoveIssue(new Error('LOCATION_CHANGED')));
      return;
    }
    if (eligibilityIssue(freshPallet.data)) {
      setLocalIssue(eligibilityIssue(freshPallet.data));
      return;
    }
    if (freshRack.data.occupied) {
      setLocalIssue({
        title: 'LOCATION OCCUPIED',
        message: `${freshRack.data.location_code} already contains a pallet. Choose another location.`,
      });
      return;
    }
    if (freshPallet.data.current_location_id === freshRack.data.id) {
      setLocalIssue(getMoveIssue(new Error('SAME_LOCATION')));
      return;
    }
    setReviewed({ pallet: freshPallet.data, rack: freshRack.data });
    setRequest(null);
    setStep('review');
  }

  function confirmMove() {
    if (!reviewed?.pallet.current_location_id || mutation.isPending) return;
    const frozenRequest = request ?? {
      palletCode: reviewed.pallet.pallet_code,
      expectedCurrentLocationId: reviewed.pallet.current_location_id,
      destinationLocationId: reviewed.rack.id,
      idempotencyKey: crypto.randomUUID(),
    };
    setRequest(frozenRequest);
    mutation.mutate(frozenRequest);
  }

  function changeRack() {
    setStep('destination');
    setRackCode(null);
    setRackInput('');
    setReviewed(null);
    setRequest(null);
    setLocalIssue(null);
    mutation.reset();
  }

  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
          Move Pallet
        </p>
        <h1 className="mt-1 text-2xl leading-tight font-black text-[#172033] sm:text-3xl">
          {success
            ? 'Pallet Moved'
            : step === 'identify'
              ? 'Identify Pallet'
              : step === 'destination'
                ? 'Choose Destination'
                : 'Review Move'}
        </h1>
        {!success && (
          <p className="mt-1 text-sm font-bold text-slate-600">
            {step === 'identify' ? '1' : step === 'destination' ? '2' : '3'} of
            3
          </p>
        )}
        <section className="mt-4 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_3px_0_rgba(15,23,42,0.08)]">
          <div
            className={`h-1.5 ${success ? 'bg-emerald-500' : 'bg-amber-400'}`}
          />
          <div className="p-4 sm:p-6">
            {success ? (
              <Success result={success} />
            ) : step === 'identify' ? (
              <div>
                <p className="text-sm font-semibold text-slate-600">
                  Enter the pallet label code. Camera scanning can be added
                  later.
                </p>
                <CodeField
                  id="move-pallet-code"
                  label="Pallet code"
                  value={codeInput}
                  onChange={setCodeInput}
                  onEnter={lookUpPallet}
                />
                <button
                  type="button"
                  onClick={lookUpPallet}
                  className={`${primary} mt-4`}
                >
                  LOOK UP PALLET
                </button>
              </div>
            ) : step === 'destination' ? (
              <div>
                <button
                  type="button"
                  className="text-sm font-black text-slate-700 underline"
                  onClick={() => setStep('identify')}
                >
                  CHANGE PALLET
                </button>
                {palletQuery.isFetching && (
                  <p role="status" className="mt-4">
                    Loading current pallet…
                  </p>
                )}
                {palletQuery.isError && (
                  <Issue issue={getMoveIssue(palletQuery.error, 'lookup')} />
                )}
                {pallet && <PalletCard pallet={pallet} />}
                {blocked && <Issue issue={blocked} />}
                {pallet && !blocked && (
                  <div>
                    <p className="mt-5 text-sm font-semibold text-slate-600">
                      Enter an active destination rack. Occupancy is checked
                      again at confirmation.
                    </p>
                    <CodeField
                      id="move-rack-code"
                      label="Destination rack code"
                      value={rackInput}
                      onChange={(value) => {
                        setRackInput(value);
                        setRackCode(null);
                      }}
                      onEnter={checkRack}
                    />
                    <button
                      type="button"
                      onClick={checkRack}
                      className={`${primary} mt-4`}
                    >
                      CHECK RACK
                    </button>
                    {rackQuery.isFetching && (
                      <p role="status" className="mt-4">
                        Checking destination…
                      </p>
                    )}
                    {rackQuery.isError && (
                      <Issue issue={getMoveIssue(rackQuery.error, 'lookup')} />
                    )}
                    {rack && (
                      <div className="mt-4">
                        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
                          <p className="break-words text-xl font-black">
                            {rack.location_code}
                          </p>
                          <p
                            className={`mt-2 text-sm font-black ${rack.occupied ? 'text-red-800' : 'text-emerald-800'}`}
                          >
                            {rack.occupied ? 'LOCATION OCCUPIED' : 'OPEN'}
                          </p>
                        </div>
                        {rack.occupied ? (
                          <Issue
                            issue={{
                              title: 'LOCATION OCCUPIED',
                              message: `${rack.location_code} already contains a pallet. Choose another location.`,
                            }}
                          />
                        ) : rack.id === pallet.current_location_id ? (
                          <Issue
                            issue={getMoveIssue(new Error('SAME_LOCATION'))}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => void reviewMove()}
                            className={`${primary} mt-4`}
                          >
                            REVIEW MOVE
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : reviewed ? (
              <div>
                <p className="text-sm font-semibold text-slate-600">
                  Nothing changes until you confirm this Move.
                </p>
                <dl className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-300 bg-slate-50 px-4">
                  <Row label="Pallet" value={reviewed.pallet.pallet_code} />
                  <Row label="Part" value={reviewed.pallet.part.part_number} />
                  <Row
                    label="FROM"
                    value={reviewed.pallet.location?.location_code ?? '—'}
                  />
                  <Row label="TO" value={reviewed.rack.location_code} />
                  <Row
                    label="Boxes"
                    value={formatQuantity(reviewed.pallet.current_boxes)}
                  />
                  <Row
                    label="Pieces"
                    value={formatQuantity(reviewed.pallet.current_pieces)}
                  />
                </dl>
                {mutation.isError && (
                  <Issue issue={getMoveIssue(mutation.error)} />
                )}
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={confirmMove}
                  className={`${primary} mt-5`}
                >
                  {mutation.isPending
                    ? 'MOVING…'
                    : mutation.isError
                      ? 'RETRY SAME MOVE'
                      : 'CONFIRM MOVE'}
                </button>
                {(request === null ||
                  (mutation.error instanceof Error &&
                    ['LOCATION_OCCUPIED', 'LOCATION_CHANGED'].includes(
                      mutation.error.message,
                    ))) && (
                  <button
                    type="button"
                    onClick={changeRack}
                    className={`${secondary} mt-3`}
                  >
                    CHANGE RACK / REFRESH
                  </button>
                )}
              </div>
            ) : null}
            {localIssue && <Issue issue={localIssue} />}
          </div>
        </section>
      </main>
    </div>
  );
}

function CodeField({
  id,
  label,
  value,
  onChange,
  onEnter,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-sm font-black text-slate-700">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter();
        }}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className={inputClass}
      />
    </div>
  );
}

function PalletCard({ pallet }: { pallet: MovePallet }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
      <p className="break-words text-xl font-black text-[#172033]">
        {pallet.pallet_code}
      </p>
      <p className="mt-1 font-black">{pallet.part.part_number}</p>
      <p className="text-sm font-semibold text-slate-600">
        {pallet.part.description}
      </p>
      <p className="mt-3 text-sm font-black text-amber-800">CURRENT RACK</p>
      <p className="break-words text-xl font-black">
        {pallet.location?.location_code ?? 'NO RACK'}
      </p>
      <p className="mt-3 font-black">
        {formatQuantity(pallet.current_boxes)} boxes ·{' '}
        {formatQuantity(pallet.current_pieces)} pieces
      </p>
      <p className="mt-1 text-sm font-bold text-slate-600">
        {getPalletFillStatus(
          pallet.current_boxes,
          pallet.boxes_per_full_pallet_snapshot,
        )}{' '}
        · {pallet.lifecycle_status.toUpperCase().replaceAll('_', ' ')}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-3 text-sm">
      <dt className="font-bold text-slate-600">{label}</dt>
      <dd className="min-w-0 break-words text-right font-black text-[#172033]">
        {value}
      </dd>
    </div>
  );
}

function Issue({ issue }: { issue: MoveIssue }) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4"
    >
      <p className="font-black tracking-wide text-red-800">{issue.title}</p>
      <p className="mt-1 text-sm font-bold text-red-700">{issue.message}</p>
    </div>
  );
}

function Success({ result }: { result: MoveResult }) {
  return (
    <div aria-live="polite" className="text-center">
      <div
        aria-hidden="true"
        className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700"
      >
        ✓
      </div>
      <p className="mt-4 text-xs font-black tracking-[0.18em] text-emerald-700 uppercase">
        Pallet Moved
      </p>
      <p className="mt-2 break-words text-3xl font-black text-[#172033]">
        {result.pallet_code}
      </p>
      <dl className="mt-5 divide-y divide-slate-200 rounded-xl bg-slate-100 px-4 text-left">
        <Row label="FROM" value={result.previous_location_code} />
        <Row label="TO" value={result.destination_location_code} />
        <Row label="Boxes" value={formatQuantity(result.current_boxes)} />
        <Row label="Pieces" value={formatQuantity(result.current_pieces)} />
      </dl>
      <Link
        to="/"
        className={`${primary} mt-6 flex items-center justify-center`}
      >
        DONE
      </Link>
      <Link
        to="/find"
        className={`${secondary} mt-3 flex items-center justify-center`}
      >
        VIEW INVENTORY
      </Link>
    </div>
  );
}
