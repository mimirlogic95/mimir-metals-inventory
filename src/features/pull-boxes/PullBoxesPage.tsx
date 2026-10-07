import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { AppHeader } from '@/app/layout/AppHeader';
import {
  calculatePullPreview,
  getPullIssue,
  optionalReferenceSchema,
  pullPalletCodeSchema,
  type PullIssue,
  type PullPreview,
} from '@/domain/inventory/pullBoxes';
import {
  formatQuantity,
  getPalletFillStatus,
} from '@/domain/pallet/createPallet';
import {
  type PullContext,
  type PullRequest,
  type PullResult,
} from '@/features/pull-boxes/pullBoxes.api';
import {
  usePullBoxesMutation,
  usePullContext,
} from '@/features/pull-boxes/usePullBoxes';

type Step = 'identify' | 'entry' | 'review';
type ReviewedPull = {
  context: PullContext;
  preview: PullPreview;
  poReference: string | null;
  bolReference: string | null;
};

const primaryButton =
  'min-h-14 w-full rounded-xl bg-[#111d2d] px-5 py-3 text-base font-black text-white shadow-[0_3px_0_#d18a1a] disabled:bg-slate-400 disabled:shadow-none';
const secondaryButton =
  'min-h-12 w-full rounded-xl border border-slate-400 bg-white px-4 py-3 text-sm font-black text-[#172033]';
const inputClass =
  'mt-2 min-h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-lg font-bold text-[#172033] focus-visible:outline-4 focus-visible:outline-amber-500';

function pullEligibilityIssue(context: PullContext): PullIssue | null {
  const { pallet } = context;
  if (pallet.lifecycle_status === 'on_hold') {
    return getPullIssue(new Error('PALLET_ON_HOLD'));
  }
  if (pallet.lifecycle_status === 'shipped') {
    return getPullIssue(new Error('PALLET_SHIPPED'));
  }
  if (
    pallet.lifecycle_status !== 'stored' ||
    pallet.location?.location_type !== 'rack'
  ) {
    return getPullIssue(new Error('PALLET_NOT_READY_TO_PULL'));
  }
  if (pallet.current_boxes <= 0 || pallet.current_pieces <= 0) {
    return getPullIssue(new Error('NO_INVENTORY'));
  }
  return null;
}

export function PullBoxesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';
  const parsedInitialCode = pullPalletCodeSchema.safeParse(initialCode);
  const [codeInput, setCodeInput] = useState(initialCode);
  const [code, setCode] = useState<string | null>(
    parsedInitialCode.success ? parsedInitialCode.data : null,
  );
  const [step, setStep] = useState<Step>(
    parsedInitialCode.success ? 'entry' : 'identify',
  );
  const [boxesInput, setBoxesInput] = useState('');
  const [poInput, setPoInput] = useState('');
  const [bolInput, setBolInput] = useState('');
  const [localIssue, setLocalIssue] = useState<PullIssue | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedPull | null>(null);
  const [request, setRequest] = useState<PullRequest | null>(null);
  const contextQuery = usePullContext(code);
  const mutation = usePullBoxesMutation();
  const success = mutation.data;
  const context = contextQuery.data;
  const eligibilityIssue = context ? pullEligibilityIssue(context) : null;
  const currentPreview = context
    ? calculatePullPreview(
        context.pallet.current_boxes,
        context.pallet.current_pieces,
        context.pallet.pieces_per_box_snapshot,
        boxesInput,
      )
    : null;

  function lookUpPallet() {
    const parsed = pullPalletCodeSchema.safeParse(codeInput);
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
    setStep('entry');
    setReviewed(null);
    setRequest(null);
    mutation.reset();
    if (code === parsed.data) void contextQuery.refetch();
  }

  async function reviewPull() {
    if (!context || eligibilityIssue || !currentPreview?.preview) {
      setLocalIssue(currentPreview?.issue ?? eligibilityIssue);
      return;
    }
    const po = optionalReferenceSchema.safeParse(poInput);
    const bol = optionalReferenceSchema.safeParse(bolInput);
    if (!po.success || !bol.success) {
      setLocalIssue(getPullIssue(new Error('REFERENCE_TOO_LONG')));
      return;
    }
    setLocalIssue(null);
    const refreshed = await contextQuery.refetch();
    if (refreshed.status !== 'success' || !refreshed.data) {
      setLocalIssue({
        title: 'UNABLE TO LOAD PALLET',
        message: 'Check the connection and refresh before reviewing.',
      });
      return;
    }
    const latest = refreshed.data;
    if (
      latest.pallet.current_boxes !== context.pallet.current_boxes ||
      latest.pallet.current_pieces !== context.pallet.current_pieces ||
      latest.pallet.lifecycle_status !== context.pallet.lifecycle_status ||
      latest.pallet.location?.location_code !==
        context.pallet.location?.location_code
    ) {
      setLocalIssue(getPullIssue(new Error('INVENTORY_CHANGED')));
      return;
    }
    const latestIssue = pullEligibilityIssue(latest);
    if (latestIssue) {
      setLocalIssue(latestIssue);
      return;
    }
    setReviewed({
      context: latest,
      preview: currentPreview.preview,
      poReference: po.data,
      bolReference: bol.data,
    });
    setStep('review');
  }

  function confirmPull() {
    if (!reviewed || mutation.isPending) return;
    const sameRequest: PullRequest = request ?? {
      palletCode: reviewed.context.pallet.pallet_code,
      boxesToPull: reviewed.preview.boxesRemoved,
      expectedCurrentBoxes: reviewed.context.pallet.current_boxes,
      expectedCurrentPieces: reviewed.context.pallet.current_pieces,
      poReference: reviewed.poReference,
      bolReference: reviewed.bolReference,
      idempotencyKey: crypto.randomUUID(),
    };
    setRequest(sameRequest);
    mutation.mutate(sameRequest);
  }

  function refreshAfterConflict() {
    setRequest(null);
    setReviewed(null);
    mutation.reset();
    setLocalIssue(null);
    setStep('entry');
    void contextQuery.refetch();
  }

  function viewCurrentPallet() {
    mutation.reset();
    setRequest(null);
    setReviewed(null);
    setBoxesInput('');
    setStep('entry');
    void contextQuery.refetch();
  }

  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
          Pull Boxes
        </p>
        <h1 className="mt-1 text-2xl font-black text-[#172033] sm:text-3xl">
          {success
            ? 'Boxes Pulled'
            : step === 'identify'
              ? 'Find a Pallet'
              : step === 'entry'
                ? 'Choose Boxes'
                : 'Review Pull'}
        </h1>
        <section className="mt-5 rounded-xl border border-slate-300 bg-white p-4 shadow-[0_3px_0_rgba(15,23,42,0.08)] sm:p-6">
          {success ? (
            <SuccessPanel result={success} onView={viewCurrentPallet} />
          ) : step === 'identify' ? (
            <div>
              <p className="text-sm font-semibold text-slate-600">
                Enter the code on the pallet label. Camera scanning is deferred.
              </p>
              <label
                htmlFor="pull-pallet-code"
                className="mt-4 block text-sm font-black"
              >
                Pallet code
              </label>
              <input
                id="pull-pallet-code"
                value={codeInput}
                onChange={(event) => {
                  setCodeInput(event.target.value);
                  setLocalIssue(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') lookUpPallet();
                }}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="MM-P-0004821"
                className={inputClass}
              />
              <button
                type="button"
                onClick={lookUpPallet}
                className={`${primaryButton} mt-5`}
              >
                LOOK UP PALLET
              </button>
              {localIssue && <IssuePanel issue={localIssue} />}
            </div>
          ) : step === 'entry' ? (
            <div>
              <button
                type="button"
                onClick={() => setStep('identify')}
                className={secondaryButton}
              >
                CHANGE PALLET
              </button>
              {contextQuery.isFetching && (
                <p role="status" className="mt-4 font-bold">
                  Loading current pallet…
                </p>
              )}
              {contextQuery.isError && (
                <IssuePanel
                  issue={
                    contextQuery.error instanceof Error &&
                    contextQuery.error.message === 'PALLET_NOT_FOUND'
                      ? getPullIssue(contextQuery.error)
                      : {
                          title: 'UNABLE TO LOAD PALLET',
                          message: 'Check the connection and refresh.',
                        }
                  }
                />
              )}
              {!contextQuery.isFetching && !contextQuery.isError && context && (
                <>
                  <PalletPanel context={context} />
                  {eligibilityIssue ? (
                    <IssuePanel issue={eligibilityIssue} />
                  ) : (
                    <>
                      <label
                        htmlFor="pull-box-count"
                        className="mt-5 block text-base font-black text-[#172033]"
                      >
                        Boxes to pull
                      </label>
                      <input
                        id="pull-box-count"
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={boxesInput}
                        onChange={(event) => {
                          setBoxesInput(event.target.value);
                          setLocalIssue(null);
                        }}
                        className={`${inputClass} text-center text-2xl font-black`}
                      />
                      {boxesInput && currentPreview?.issue && (
                        <IssuePanel issue={currentPreview.issue} />
                      )}
                      {currentPreview?.preview && (
                        <PreviewPanel preview={currentPreview.preview} />
                      )}
                      <div className="mt-5 grid gap-4">
                        <ReferenceField
                          label="PO reference (optional)"
                          id="pull-po"
                          value={poInput}
                          onChange={setPoInput}
                        />
                        <ReferenceField
                          label="BOL reference (optional)"
                          id="pull-bol"
                          value={bolInput}
                          onChange={setBolInput}
                        />
                      </div>
                      {localIssue && <IssuePanel issue={localIssue} />}
                      <button
                        type="button"
                        onClick={() => void reviewPull()}
                        disabled={
                          !currentPreview?.preview || contextQuery.isFetching
                        }
                        className={`${primaryButton} mt-6`}
                      >
                        REVIEW PULL
                      </button>
                    </>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => void contextQuery.refetch()}
                className={`${secondaryButton} mt-3`}
              >
                REFRESH PALLET
              </button>
            </div>
          ) : reviewed ? (
            <div>
              <p className="text-sm font-semibold text-slate-600">
                Nothing changes until you confirm. The server will check the
                pallet again.
              </p>
              <PalletPanel context={reviewed.context} />
              <PreviewPanel preview={reviewed.preview} />
              <dl className="mt-4 divide-y divide-slate-200 rounded-xl bg-slate-50 px-4">
                <DetailRow label="PO" value={reviewed.poReference ?? 'None'} />
                <DetailRow
                  label="BOL"
                  value={reviewed.bolReference ?? 'None'}
                />
              </dl>
              {mutation.isError && (
                <IssuePanel issue={getPullIssue(mutation.error)} />
              )}
              {(!mutation.isError ||
                getPullIssue(mutation.error).title === 'NOT SAVED YET') && (
                <button
                  type="button"
                  onClick={confirmPull}
                  disabled={mutation.isPending}
                  className={`${primaryButton} mt-6`}
                >
                  {mutation.isPending
                    ? 'SAVING…'
                    : mutation.isError
                      ? 'RETRY SAME REQUEST'
                      : 'CONFIRM PULL'}
                </button>
              )}
              {mutation.isError &&
              getPullIssue(mutation.error).title !== 'NOT SAVED YET' ? (
                <button
                  type="button"
                  onClick={refreshAfterConflict}
                  className={`${secondaryButton} mt-3`}
                >
                  REFRESH AND REVIEW AGAIN
                </button>
              ) : !request ? (
                <button
                  type="button"
                  onClick={() => {
                    setReviewed(null);
                    setStep('entry');
                  }}
                  className={`${secondaryButton} mt-3`}
                >
                  EDIT PULL
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function PalletPanel({ context }: { context: PullContext }) {
  const { pallet, fifo } = context;
  return (
    <div className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
      <p className="break-words text-2xl font-black text-[#172033]">
        {pallet.pallet_code}
      </p>
      <p className="mt-1 font-black">{pallet.part.part_number}</p>
      <p className="text-sm font-semibold text-slate-600">
        {pallet.part.description}
      </p>
      <p className="mt-3 text-base font-black text-amber-800">
        {pallet.location?.location_code ?? 'NO RACK'}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-300 pt-3 text-center">
        <Quantity label="Current boxes" value={pallet.current_boxes} />
        <Quantity label="Current pieces" value={pallet.current_pieces} />
      </div>
      <p className="mt-3 text-center text-sm font-black text-slate-600">
        {pallet.current_boxes > 0
          ? getPalletFillStatus(
              pallet.current_boxes,
              pallet.boxes_per_full_pallet_snapshot,
            )
          : 'EMPTY'}{' '}
        · {pallet.lifecycle_status.toUpperCase().replaceAll('_', ' ')}
      </p>
      {fifo?.isFirst ? (
        <p className="mt-4 rounded-lg bg-amber-300 p-3 text-center text-sm font-black text-[#172033]">
          PULL FIRST
        </p>
      ) : fifo ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          <p className="font-black">NOT FIFO PALLET</p>
          <p>
            {pallet.pallet_code} is not currently the oldest eligible pallet.
            You may still proceed.
          </p>
          <p className="mt-1">
            Oldest eligible: {fifo.oldestPalletCode} · {fifo.oldestLocationCode}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PreviewPanel({ preview }: { preview: PullPreview }) {
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
        <p className="text-sm font-black tracking-wide text-red-800">
          REMOVING
        </p>
        <Quantity label="Boxes" value={preview.boxesRemoved} />
        <Quantity label="Pieces" value={preview.piecesRemoved} />
      </div>
      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
        <p className="text-sm font-black tracking-wide text-emerald-800">
          REMAINING
        </p>
        <Quantity label="Boxes" value={preview.remainingBoxes} />
        <Quantity label="Pieces" value={preview.remainingPieces} />
      </div>
    </div>
  );
}

function SuccessPanel({
  result,
  onView,
}: {
  result: PullResult;
  onView: () => void;
}) {
  return (
    <div aria-live="polite">
      <p className="text-sm font-black tracking-wide text-emerald-700">
        BOXES PULLED
      </p>
      <p className="mt-2 break-words text-3xl font-black text-[#172033]">
        {result.pallet_code}
      </p>
      <p className="mt-1 font-bold text-slate-600">
        {result.part_number} · {result.description}
      </p>
      <PreviewPanel
        preview={{
          boxesRemoved: result.boxes_removed,
          piecesRemoved: result.pieces_removed,
          remainingBoxes: result.current_boxes,
          remainingPieces: result.current_pieces,
        }}
      />
      <dl className="mt-4 rounded-xl bg-slate-100 px-4">
        <DetailRow label="Location" value={result.location_code} />
        <DetailRow
          label="Previous"
          value={`${formatQuantity(result.previous_boxes)} boxes · ${formatQuantity(result.previous_pieces)} pieces`}
        />
      </dl>
      <Link
        to="/"
        className={`${primaryButton} mt-6 flex items-center justify-center`}
      >
        DONE
      </Link>
      <button
        type="button"
        onClick={onView}
        className={`${secondaryButton} mt-3`}
      >
        VIEW PALLET
      </button>
    </div>
  );
}

function Quantity({ label, value }: { label: string; value: number }) {
  return (
    <p className="mt-2 text-lg font-black text-[#172033]">
      {formatQuantity(value)}{' '}
      <span className="text-sm font-bold text-slate-600">{label}</span>
    </p>
  );
}

function ReferenceField({
  label,
  id,
  value,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-black">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={101}
        autoComplete="off"
        className={inputClass}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 border-b border-slate-200 py-3 text-sm last:border-0">
      <dt className="font-bold text-slate-600">{label}</dt>
      <dd className="min-w-0 break-words text-right font-black text-[#172033]">
        {value}
      </dd>
    </div>
  );
}

function IssuePanel({ issue }: { issue: PullIssue }) {
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
