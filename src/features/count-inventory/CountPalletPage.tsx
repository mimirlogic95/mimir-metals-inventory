import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { AppHeader } from '@/app/layout/AppHeader';
import {
  calculateCountPreview,
  countPalletCodeSchema,
  formatSignedQuantity,
  getCountIssue,
  reasonCodes,
  type CountIssue,
  type CountPreview,
} from '@/domain/inventory/countPallet';
import {
  formatQuantity,
  getPalletFillStatus,
} from '@/domain/pallet/createPallet';
import {
  type CountPallet,
  type CountRequest,
  type CountResult,
} from '@/features/count-inventory/countPallet.api';
import {
  useCountPalletMutation,
  usePalletForCount,
} from '@/features/count-inventory/useCountPallet';

type Step = 'identify' | 'count' | 'review';
type Reviewed = {
  pallet: CountPallet;
  preview: CountPreview;
  reasonCode: string | null;
  reasonNotes: string | null;
};

const primary =
  'min-h-14 w-full rounded-xl bg-[#111d2d] px-5 py-3 text-base font-black text-white shadow-[0_3px_0_#d18a1a] disabled:bg-slate-400 disabled:shadow-none';
const secondary =
  'min-h-12 w-full rounded-xl border-2 border-slate-400 bg-white px-4 py-3 text-sm font-black text-[#172033]';
const input =
  'mt-2 min-h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-lg font-bold text-[#172033] focus-visible:outline-4 focus-visible:outline-amber-500';

function eligibilityIssue(pallet: CountPallet): CountIssue | null {
  if (pallet.lifecycle_status === 'shipped')
    return getCountIssue(new Error('PALLET_SHIPPED'));
  if (
    !(
      pallet.lifecycle_status === 'stored' ||
      (pallet.lifecycle_status === 'on_hold' &&
        pallet.lifecycle_status_before_hold === 'stored')
    ) ||
    pallet.location?.location_type !== 'rack' ||
    !pallet.current_location_id ||
    pallet.current_boxes <= 0 ||
    pallet.current_pieces <= 0
  )
    return getCountIssue(new Error('PALLET_NOT_COUNTABLE'));
  return null;
}

export function CountPalletPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('code') ?? '';
  const parsedInitial = countPalletCodeSchema.safeParse(initial);
  const [codeInput, setCodeInput] = useState(initial);
  const [code, setCode] = useState<string | null>(
    parsedInitial.success ? parsedInitial.data : null,
  );
  const [step, setStep] = useState<Step>(
    parsedInitial.success ? 'count' : 'identify',
  );
  const [boxesInput, setBoxesInput] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  const [issue, setIssue] = useState<CountIssue | null>(null);
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [request, setRequest] = useState<CountRequest | null>(null);
  const query = usePalletForCount(code);
  const mutation = useCountPalletMutation();
  const pallet = !query.isFetching && !query.isError ? query.data : undefined;
  const blocked = pallet ? eligibilityIssue(pallet) : null;
  const preview = pallet
    ? calculateCountPreview(
        pallet.current_boxes,
        pallet.current_pieces,
        pallet.pieces_per_box_snapshot,
        boxesInput,
      )
    : null;

  function lookUp() {
    const parsed = countPalletCodeSchema.safeParse(codeInput);
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
    setStep('count');
    setBoxesInput('');
    setReviewed(null);
    setRequest(null);
    mutation.reset();
    if (code === parsed.data) void query.refetch();
  }

  async function review() {
    if (!pallet || blocked || !preview?.preview) {
      setIssue(
        blocked ?? preview?.issue ?? getCountIssue(new Error('INVALID_COUNT')),
      );
      return;
    }
    if (
      !preview.preview.matches &&
      !reasonCodes.some((reason) => reason === reasonCode)
    ) {
      setIssue(getCountIssue(new Error('REASON_REQUIRED')));
      return;
    }
    if (reasonNotes.trim().length > 200) {
      setIssue(getCountIssue(new Error('NOTE_TOO_LONG')));
      return;
    }
    setIssue(null);
    const refreshed = await query.refetch();
    if (refreshed.status !== 'success' || !refreshed.data) {
      setIssue(getCountIssue(new Error('PALLET_LOOKUP_FAILED'), 'lookup'));
      return;
    }
    const fresh = refreshed.data;
    if (
      fresh.current_boxes !== pallet.current_boxes ||
      fresh.current_pieces !== pallet.current_pieces ||
      fresh.current_location_id !== pallet.current_location_id ||
      fresh.lifecycle_status !== pallet.lifecycle_status
    ) {
      setIssue(getCountIssue(new Error('INVENTORY_CHANGED')));
      return;
    }
    const freshIssue = eligibilityIssue(fresh);
    if (freshIssue) {
      setIssue(freshIssue);
      return;
    }
    setReviewed({
      pallet: fresh,
      preview: preview.preview,
      reasonCode: preview.preview.matches ? null : reasonCode,
      reasonNotes: preview.preview.matches ? null : reasonNotes.trim() || null,
    });
    setStep('review');
  }

  function confirm() {
    if (!reviewed?.pallet.current_location_id || mutation.isPending) return;
    const frozen: CountRequest = request ?? {
      palletCode: reviewed.pallet.pallet_code,
      countedBoxes: reviewed.preview.countedBoxes,
      expectedCurrentBoxes: reviewed.pallet.current_boxes,
      expectedCurrentPieces: reviewed.pallet.current_pieces,
      expectedCurrentLocationId: reviewed.pallet.current_location_id,
      reasonCode: reviewed.reasonCode,
      reasonNotes: reviewed.reasonNotes,
      idempotencyKey: crypto.randomUUID(),
    };
    setRequest(frozen);
    mutation.mutate(frozen);
  }

  function refreshAfterConflict() {
    setRequest(null);
    setReviewed(null);
    mutation.reset();
    setIssue(null);
    setStep('count');
    void query.refetch();
  }

  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
          Count Inventory
        </p>
        <h1 className="mt-1 text-2xl font-black text-[#172033] sm:text-3xl">
          {mutation.data
            ? mutation.data.outcome === 'matched'
              ? 'Count Complete'
              : 'Adjustment Requested'
            : step === 'identify'
              ? 'Identify Pallet'
              : step === 'count'
                ? 'Physical Count'
                : 'Review Count'}
        </h1>
        <section className="mt-5 rounded-xl border border-slate-300 bg-white p-4 shadow-[0_3px_0_rgba(15,23,42,0.08)] sm:p-6">
          {mutation.data ? (
            <Success result={mutation.data} />
          ) : step === 'identify' ? (
            <div>
              <p className="text-sm font-semibold text-slate-600">
                Enter the pallet label code. Camera scanning is deferred.
              </p>
              <label
                htmlFor="count-pallet-code"
                className="mt-5 block font-black"
              >
                Pallet code
              </label>
              <input
                id="count-pallet-code"
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
                className={`${primary} mt-5`}
              >
                LOOK UP PALLET
              </button>
            </div>
          ) : step === 'count' ? (
            <div>
              <button
                type="button"
                onClick={() => setStep('identify')}
                className={secondary}
              >
                CHANGE PALLET
              </button>
              {query.isFetching && (
                <p role="status" className="mt-4 font-bold">
                  Loading current pallet…
                </p>
              )}
              {query.isError && (
                <Issue issue={getCountIssue(query.error, 'lookup')} />
              )}
              {pallet && <PalletCard pallet={pallet} />}
              {blocked && <Issue issue={blocked} />}
              {pallet && !blocked && (
                <>
                  <label
                    htmlFor="count-boxes"
                    className="mt-6 block text-lg font-black"
                  >
                    HOW MANY BOXES ARE PHYSICALLY HERE?
                  </label>
                  <input
                    id="count-boxes"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={boxesInput}
                    onChange={(event) => {
                      setBoxesInput(event.target.value);
                      setIssue(null);
                    }}
                    className={`${input} text-center text-3xl font-black`}
                  />
                  {boxesInput !== '' && preview?.issue && (
                    <Issue issue={preview.issue} />
                  )}
                  {preview?.preview && (
                    <Comparison pallet={pallet} preview={preview.preview} />
                  )}
                  {preview?.preview && !preview.preview.matches && (
                    <div className="mt-5">
                      <label
                        htmlFor="count-reason"
                        className="block font-black"
                      >
                        Reason for difference
                      </label>
                      <select
                        id="count-reason"
                        value={reasonCode}
                        onChange={(event) => setReasonCode(event.target.value)}
                        className={input}
                      >
                        <option value="">Choose a reason</option>
                        <option value="unrecorded_shipping_pull">
                          Unrecorded shipping pull
                        </option>
                        <option value="damaged_product">Damaged product</option>
                        <option value="packing_correction">
                          Packing correction
                        </option>
                        <option value="count_error">Count error</option>
                        <option value="other">Other / unknown</option>
                      </select>
                      <label
                        htmlFor="count-note"
                        className="mt-4 block font-black"
                      >
                        Note (optional)
                      </label>
                      <textarea
                        id="count-note"
                        value={reasonNotes}
                        onChange={(event) => setReasonNotes(event.target.value)}
                        maxLength={201}
                        rows={2}
                        className={input}
                      />
                      <p className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 font-black text-amber-950">
                        INVENTORY WILL NOT CHANGE YET. A supervisor must review
                        the adjustment.
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void review()}
                    disabled={!preview?.preview || query.isFetching}
                    className={`${primary} mt-6`}
                  >
                    REVIEW COUNT
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => void query.refetch()}
                className={`${secondary} mt-3`}
              >
                REFRESH PALLET
              </button>
            </div>
          ) : reviewed ? (
            <div>
              <p className="font-semibold text-slate-600">
                Nothing is recorded until you confirm. The server checks the
                pallet again.
              </p>
              <PalletCard pallet={reviewed.pallet} />
              <Comparison pallet={reviewed.pallet} preview={reviewed.preview} />
              {!reviewed.preview.matches && (
                <>
                  <p className="mt-4 font-bold">
                    Reason: {reviewed.reasonCode?.replaceAll('_', ' ')}
                  </p>
                  {reviewed.reasonNotes && (
                    <p className="mt-1 break-words">
                      Note: {reviewed.reasonNotes}
                    </p>
                  )}
                  <p className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 font-black text-amber-950">
                    INVENTORY WILL NOT CHANGE YET. Supervisor approval is
                    required.
                  </p>
                </>
              )}
              {mutation.isError && (
                <Issue issue={getCountIssue(mutation.error)} />
              )}
              {(!mutation.isError ||
                getCountIssue(mutation.error).title === 'NOT SAVED YET') && (
                <button
                  type="button"
                  onClick={confirm}
                  disabled={mutation.isPending}
                  className={`${primary} mt-6`}
                >
                  {mutation.isPending
                    ? 'SAVING…'
                    : mutation.isError
                      ? 'RETRY SAME REQUEST'
                      : reviewed.preview.matches
                        ? 'CONFIRM COUNT'
                        : 'SUBMIT ADJUSTMENT REQUEST'}
                </button>
              )}
              {mutation.isError &&
              getCountIssue(mutation.error).title !== 'NOT SAVED YET' ? (
                <button
                  type="button"
                  onClick={refreshAfterConflict}
                  className={`${secondary} mt-3`}
                >
                  REFRESH AND REVIEW AGAIN
                </button>
              ) : !request ? (
                <button
                  type="button"
                  onClick={() => {
                    setReviewed(null);
                    setStep('count');
                  }}
                  className={`${secondary} mt-3`}
                >
                  EDIT COUNT
                </button>
              ) : null}
            </div>
          ) : null}
          {issue && <Issue issue={issue} />}
        </section>
      </main>
    </div>
  );
}

function PalletCard({ pallet }: { pallet: CountPallet }) {
  return (
    <div className="mt-4 min-w-0 rounded-xl border border-slate-300 bg-slate-50 p-4">
      <p className="break-words text-2xl font-black">{pallet.pallet_code}</p>
      <p className="font-black">{pallet.part.part_number}</p>
      <p className="break-words text-sm font-semibold text-slate-600">
        {pallet.part.description}
      </p>
      <p className="mt-2 font-black text-amber-800">
        {pallet.location?.location_code ?? 'NO LOCATION'}
      </p>
      <p className="mt-2 text-sm font-black">
        {getPalletFillStatus(
          pallet.current_boxes,
          pallet.boxes_per_full_pallet_snapshot,
        )}{' '}
        · {pallet.lifecycle_status.toUpperCase().replaceAll('_', ' ')}
      </p>
      <div className="mt-4 rounded-lg border-2 border-slate-400 bg-white p-4">
        <p className="text-sm font-black tracking-wide text-slate-700">
          SYSTEM QUANTITY
        </p>
        <p className="mt-1 text-xl font-black">
          {formatQuantity(pallet.current_boxes)} boxes
        </p>
        <p className="font-black">
          {formatQuantity(pallet.current_pieces)} pieces
        </p>
      </div>
    </div>
  );
}

function Comparison({
  pallet,
  preview,
}: {
  pallet: CountPallet;
  preview: CountPreview;
}) {
  return (
    <div className="mt-4 grid gap-3">
      <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
        <p className="text-sm font-black text-blue-950">COUNTED PHYSICALLY</p>
        <p className="mt-1 text-xl font-black">
          {formatQuantity(preview.countedBoxes)} boxes
        </p>
        <p className="font-black">
          {formatQuantity(preview.countedPieces)} pieces
        </p>
      </div>
      <div
        className={`rounded-xl border-2 p-4 ${preview.matches ? 'border-emerald-400 bg-emerald-50' : 'border-amber-400 bg-amber-50'}`}
      >
        <p className="text-sm font-black">
          {preview.matches ? 'COUNT MATCHES' : 'COUNT DIFFERENCE'}
        </p>
        <p className="mt-1 text-xl font-black">
          {formatSignedQuantity(preview.boxDifference)} boxes
        </p>
        <p className="font-black">
          {formatSignedQuantity(preview.pieceDifference)} pieces
        </p>
        {!preview.matches && (
          <p className="mt-2 text-sm font-semibold">
            Compared with {formatQuantity(pallet.current_boxes)} system boxes.
          </p>
        )}
      </div>
    </div>
  );
}

function Success({ result }: { result: CountResult }) {
  return (
    <div aria-live="polite">
      <p className="text-sm font-black tracking-wide text-emerald-800">
        {result.outcome === 'matched'
          ? 'COUNT COMPLETE'
          : 'ADJUSTMENT REQUESTED'}
      </p>
      <p className="mt-2 break-words text-3xl font-black">
        {result.pallet_code}
      </p>
      <p className="font-bold text-slate-600">
        {result.part_number} · {result.location_code}
      </p>
      <dl className="mt-5 divide-y divide-slate-200 rounded-xl bg-slate-100 px-4">
        <ResultRow
          label="SYSTEM"
          value={`${formatQuantity(result.system_boxes)} boxes · ${formatQuantity(result.system_pieces)} pieces`}
        />
        <ResultRow
          label="COUNTED"
          value={`${formatQuantity(result.counted_boxes)} boxes · ${formatQuantity(result.counted_pieces)} pieces`}
        />
        <ResultRow
          label="DIFFERENCE"
          value={`${formatSignedQuantity(result.box_difference)} boxes · ${formatSignedQuantity(result.piece_difference)} pieces`}
        />
      </dl>
      <p className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 font-black text-amber-950">
        {result.outcome === 'matched'
          ? 'Inventory matches the physical count. No quantities changed.'
          : 'Inventory has NOT been changed. Supervisor review is required.'}
      </p>
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

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-3 text-sm">
      <dt className="font-black">{label}</dt>
      <dd className="min-w-0 break-words text-right font-bold">{value}</dd>
    </div>
  );
}

function Issue({ issue }: { issue: CountIssue }) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4"
    >
      <p className="font-black text-red-800">{issue.title}</p>
      <p className="mt-1 text-sm font-semibold text-red-700">{issue.message}</p>
    </div>
  );
}
