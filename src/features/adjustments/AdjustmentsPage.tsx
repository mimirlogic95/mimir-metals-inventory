import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';

import { AppHeader } from '@/app/layout/AppHeader';
import {
  getAdjustmentIssue,
  type AdjustmentIssue,
} from '@/domain/inventory/adjustments';
import { formatSignedQuantity } from '@/domain/inventory/countPallet';
import { formatQuantity } from '@/domain/pallet/createPallet';
import {
  type AdjustmentRequest,
  type AdjustmentResult,
  type DecisionInput,
} from '@/features/adjustments/adjustments.api';
import {
  useAdjustmentDecision,
  useAdjustmentRequest,
  usePendingAdjustments,
  useSupervisor,
} from '@/features/adjustments/useAdjustments';

const primary =
  'min-h-14 w-full rounded-xl bg-[#111d2d] px-5 py-3 text-base font-black text-white shadow-[0_3px_0_#d18a1a] disabled:bg-slate-400 disabled:shadow-none';
const danger =
  'min-h-14 w-full rounded-xl bg-red-800 px-5 py-3 text-base font-black text-white disabled:bg-slate-400';
const secondary =
  'min-h-12 w-full rounded-xl border-2 border-slate-400 bg-white px-4 py-3 text-sm font-black text-[#172033]';

function Shell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
          Supervisor review
        </p>
        <h1 className="mt-1 text-2xl font-black text-[#172033] sm:text-3xl">
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}

function Issue({ issue }: { issue: AdjustmentIssue }) {
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

function Time({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString()}</time>;
}

function Amount({ boxes, pieces }: { boxes: number; pieces: number }) {
  return (
    <span className="font-black">
      {formatQuantity(boxes)} boxes · {formatQuantity(pieces)} pieces
    </span>
  );
}

function Change({ request }: { request: AdjustmentRequest }) {
  return (
    <span
      className={`font-black ${request.box_difference < 0 ? 'text-red-800' : 'text-blue-800'}`}
    >
      {formatSignedQuantity(request.box_difference)} boxes ·{' '}
      {formatSignedQuantity(request.piece_difference)} pieces
    </span>
  );
}

export function AdjustmentsPage() {
  const supervisor = useSupervisor();
  const queue = usePendingAdjustments(supervisor.isSuccess);
  return (
    <Shell title="Pending Adjustments">
      {supervisor.isPending && (
        <p role="status" className="mt-5 font-bold">
          Checking supervisor access…
        </p>
      )}
      {supervisor.isError && (
        <Issue issue={getAdjustmentIssue(supervisor.error, 'read')} />
      )}
      {supervisor.isSuccess && (
        <>
          <p className="mt-3 text-sm font-semibold text-slate-600">
            Signed in as {supervisor.data}. Only a supervisor decision can
            change inventory.
          </p>
          <button
            type="button"
            onClick={() => void queue.refetch()}
            className={`${secondary} mt-5`}
          >
            REFRESH REQUESTS
          </button>
          {queue.isPending && (
            <p role="status" className="mt-5 font-bold">
              Loading pending requests…
            </p>
          )}
          {queue.isError && (
            <Issue issue={getAdjustmentIssue(queue.error, 'read')} />
          )}
          {queue.data?.length === 0 && (
            <p className="mt-5 rounded-xl bg-white p-5 font-bold">
              No pending adjustments.
            </p>
          )}
          <div className="mt-5 grid gap-3">
            {queue.data?.map((request) => (
              <Link
                key={request.id}
                to={`/adjustments/${request.id}`}
                className="block min-w-0 rounded-xl border border-slate-300 bg-white p-4 shadow-[0_3px_0_rgba(15,23,42,0.08)]"
              >
                <p className="break-words text-xl font-black">
                  {request.pallet.pallet_code}
                </p>
                <p className="font-bold">
                  {request.pallet.part.part_number} ·{' '}
                  {request.count_location?.location_code ?? 'NO COUNT RACK'}
                </p>
                <p className="mt-3 text-sm font-semibold text-slate-600">
                  Counted by {request.requester.display_name} ·{' '}
                  <Time value={request.created_at} />
                </p>
                <p className="mt-3">
                  SYSTEM AT COUNT:{' '}
                  <Amount
                    boxes={request.system_boxes}
                    pieces={request.system_pieces}
                  />
                </p>
                <p className="mt-1">
                  PHYSICAL COUNT:{' '}
                  <Amount
                    boxes={request.counted_boxes}
                    pieces={request.counted_pieces}
                  />
                </p>
                <p className="mt-1">
                  PROPOSED: <Change request={request} />
                </p>
                <p className="mt-3 text-sm font-black text-amber-800">
                  PENDING · REVIEW REQUEST →
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}

function RequestFacts({ request }: { request: AdjustmentRequest }) {
  const changed =
    request.count_inventory_version === null ||
    request.count_inventory_version !== request.pallet.inventory_version ||
    request.system_boxes !== request.pallet.current_boxes ||
    request.system_pieces !== request.pallet.current_pieces ||
    request.count_location_id !== request.pallet.current_location_id ||
    request.count_lifecycle_status !== request.pallet.lifecycle_status ||
    request.count_lifecycle_status_before_hold !==
      request.pallet.lifecycle_status_before_hold;
  return (
    <div className="mt-5 grid min-w-0 gap-3">
      <section className="min-w-0 rounded-xl border border-slate-300 bg-white p-4">
        <h2 className="break-words text-2xl font-black">
          {request.pallet.pallet_code}
        </h2>
        <p className="font-bold">{request.pallet.part.part_number}</p>
        <p className="break-words text-sm text-slate-600">
          {request.pallet.part.description}
        </p>
        <p className="mt-3 text-sm font-semibold">
          Counted by {request.requester.display_name}
        </p>
        <p className="text-sm font-semibold">
          <Time value={request.created_at} />
        </p>
        <p className="mt-2 text-sm font-semibold">
          Count-time rack: {request.count_location?.location_code ?? 'UNKNOWN'}
        </p>
        <p className="text-sm font-semibold">
          Worker reason: {request.reason_code.replaceAll('_', ' ')}
        </p>
        {request.reason_notes && (
          <p className="mt-1 break-words text-sm font-semibold">
            Worker note: {request.reason_notes}
          </p>
        )}
        <p className="mt-2 text-sm font-black">
          STATUS: {request.status.toUpperCase()}
        </p>
      </section>
      <section className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
        <h3 className="text-sm font-black">SYSTEM AT COUNT TIME</h3>
        <p className="mt-1 text-xl">
          <Amount boxes={request.system_boxes} pieces={request.system_pieces} />
        </p>
      </section>
      <section className="rounded-xl border-2 border-slate-300 bg-white p-4">
        <h3 className="text-sm font-black">PHYSICAL COUNT</h3>
        <p className="mt-1 text-xl">
          <Amount
            boxes={request.counted_boxes}
            pieces={request.counted_pieces}
          />
        </p>
      </section>
      <section className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
        <h3 className="text-sm font-black">PROPOSED CORRECTION</h3>
        <p className="mt-1 text-xl">
          <Change request={request} />
        </p>
      </section>
      <section className="rounded-xl border border-slate-300 bg-white p-4">
        <h3 className="text-sm font-black">CURRENT AUTHORITATIVE PALLET</h3>
        <p className="mt-1 text-xl">
          <Amount
            boxes={request.pallet.current_boxes}
            pieces={request.pallet.current_pieces}
          />
        </p>
        <p className="mt-2 font-bold">
          {request.pallet.location?.location_code ?? 'NO LOCATION'} ·{' '}
          {request.pallet.lifecycle_status.toUpperCase().replaceAll('_', ' ')}
        </p>
        {request.pallet.hold_reason && (
          <p className="mt-1 break-words text-sm font-semibold">
            Hold: {request.pallet.hold_reason}
          </p>
        )}
      </section>
      {changed && (
        <Issue issue={getAdjustmentIssue(new Error('INVENTORY_CHANGED'))} />
      )}
      {request.counted_boxes === 0 && (
        <Issue
          issue={getAdjustmentIssue(new Error('ZERO_BALANCE_NOT_SUPPORTED'))}
        />
      )}
    </div>
  );
}

function Success({ result }: { result: AdjustmentResult }) {
  return (
    <div
      aria-live="polite"
      className="mt-5 rounded-xl border border-slate-300 bg-white p-4"
    >
      <p className="text-sm font-black text-emerald-800">
        {result.decision_status === 'approved'
          ? 'ADJUSTMENT APPROVED'
          : 'REQUEST REJECTED'}
      </p>
      <p className="mt-2 break-words text-2xl font-black">
        {result.pallet_code}
      </p>
      <p className="font-bold">
        {result.part_number} · {result.location_code ?? 'NO LOCATION'}
      </p>
      <div className="mt-4 grid gap-2 rounded-xl bg-slate-100 p-4">
        <p>
          BEFORE:{' '}
          <Amount boxes={result.before_boxes} pieces={result.before_pieces} />
        </p>
        <p>
          CHANGE:{' '}
          <span className="font-black">
            {formatSignedQuantity(result.box_change)} boxes ·{' '}
            {formatSignedQuantity(result.piece_change)} pieces
          </span>
        </p>
        <p>
          AFTER:{' '}
          <Amount boxes={result.after_boxes} pieces={result.after_pieces} />
        </p>
      </div>
      <p className="mt-4 font-bold">
        {result.decision_status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
        {result.reviewer_name}
      </p>
      <p className="text-sm font-semibold">
        <Time value={result.reviewed_at} />
      </p>
      {result.decision_status === 'rejected' && (
        <p className="mt-3 font-black">Inventory unchanged.</p>
      )}
      <Link
        to="/adjustments"
        className={`${secondary} mt-5 flex items-center justify-center`}
      >
        BACK TO REQUESTS
      </Link>
    </div>
  );
}

export function AdjustmentReviewPage() {
  const { requestId } = useParams();
  const supervisor = useSupervisor();
  const query = useAdjustmentRequest(requestId, supervisor.isSuccess);
  const mutation = useAdjustmentDecision();
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [frozen, setFrozen] = useState<DecisionInput | null>(null);
  const [issue, setIssue] = useState<AdjustmentIssue | null>(null);
  const request = query.data;

  async function startDecision(choice: 'approve' | 'reject') {
    setIssue(null);
    const refreshed = await query.refetch();
    if (refreshed.status !== 'success' || !refreshed.data) {
      setIssue(getAdjustmentIssue(refreshed.error, 'read'));
      return;
    }
    if (refreshed.data.status !== 'pending') {
      setIssue(getAdjustmentIssue(new Error('REQUEST_ALREADY_RESOLVED')));
      return;
    }
    setDecision(choice);
    mutation.reset();
  }

  function confirm() {
    if (!requestId || !decision || mutation.isPending) return;
    const trimmed = notes.trim();
    if (decision === 'reject' && !trimmed) {
      setIssue(getAdjustmentIssue(new Error('REJECTION_REASON_REQUIRED')));
      return;
    }
    if (trimmed.length > 200) {
      setIssue(getAdjustmentIssue(new Error('INVALID_ADJUSTMENT')));
      return;
    }
    setIssue(null);
    const input: DecisionInput = frozen ?? {
      requestId,
      decision,
      reviewNotes: trimmed || null,
      idempotencyKey: crypto.randomUUID(),
    };
    setFrozen(input);
    mutation.mutate(input);
  }

  function resetAfterKnownError() {
    setFrozen(null);
    setDecision(null);
    setIssue(null);
    mutation.reset();
    void query.refetch();
  }

  const mutationIssue = mutation.isError
    ? getAdjustmentIssue(mutation.error)
    : null;
  return (
    <Shell
      title={
        mutation.data
          ? 'Decision Recorded'
          : decision
            ? 'Confirm Decision'
            : 'Review Adjustment'
      }
    >
      <Link
        to="/adjustments"
        className="mt-4 inline-flex min-h-11 items-center font-black underline"
      >
        ← PENDING REQUESTS
      </Link>
      {supervisor.isPending && (
        <p role="status" className="mt-4 font-bold">
          Checking supervisor access…
        </p>
      )}
      {supervisor.isError && (
        <Issue issue={getAdjustmentIssue(supervisor.error, 'read')} />
      )}
      {supervisor.isSuccess && (
        <>
          {query.isPending && (
            <p role="status" className="mt-4 font-bold">
              Loading request…
            </p>
          )}
          {query.isError && (
            <Issue issue={getAdjustmentIssue(query.error, 'read')} />
          )}
          {query.isError && (
            <button
              type="button"
              className={`${secondary} mt-4`}
              onClick={() => void query.refetch()}
            >
              TRY AGAIN
            </button>
          )}
          {mutation.data ? (
            <Success result={mutation.data} />
          ) : (
            request && (
              <>
                <RequestFacts request={request} />
                {request.status !== 'pending' ? (
                  <p className="mt-5 rounded-xl bg-white p-4 font-black">
                    This request has already been {request.status}. Inventory
                    cannot be changed from this review.
                  </p>
                ) : decision ? (
                  <section className="mt-5 rounded-xl border-2 border-slate-400 bg-white p-4">
                    <h2 className="text-xl font-black">
                      {decision === 'approve'
                        ? 'APPROVE INVENTORY CORRECTION?'
                        : 'REJECT ADJUSTMENT REQUEST?'}
                    </h2>
                    <p className="mt-2 font-bold">
                      {request.pallet.pallet_code}
                    </p>
                    <p className="mt-3">
                      CURRENT SYSTEM:{' '}
                      <Amount
                        boxes={request.pallet.current_boxes}
                        pieces={request.pallet.current_pieces}
                      />
                    </p>
                    {decision === 'approve' ? (
                      <>
                        <p className="mt-2">
                          APPROVED RESULT:{' '}
                          <Amount
                            boxes={request.counted_boxes}
                            pieces={request.counted_pieces}
                          />
                        </p>
                        <p className="mt-2">
                          CHANGE: <Change request={request} />
                        </p>
                        <p className="mt-4 font-black text-amber-800">
                          This will change recorded inventory only after the
                          server rechecks this request.
                        </p>
                      </>
                    ) : (
                      <p className="mt-4 font-black text-red-800">
                        Inventory will remain unchanged. The original Count
                        evidence will remain.
                      </p>
                    )}
                    <label
                      htmlFor="decision-note"
                      className="mt-5 block font-black"
                    >
                      Supervisor reason{' '}
                      {decision === 'reject' ? '(required)' : '(optional)'}
                    </label>
                    <textarea
                      id="decision-note"
                      value={notes}
                      onChange={(event) => {
                        setNotes(event.target.value);
                        setIssue(null);
                      }}
                      disabled={Boolean(frozen)}
                      rows={2}
                      maxLength={201}
                      className="mt-2 min-h-14 w-full rounded-xl border-2 border-slate-400 bg-white px-4 py-3 text-lg font-bold"
                    />
                    {mutationIssue && <Issue issue={mutationIssue} />}
                    {issue && <Issue issue={issue} />}
                    {(!mutationIssue ||
                      mutationIssue.title === 'NOT SAVED YET') && (
                      <button
                        type="button"
                        onClick={confirm}
                        disabled={mutation.isPending}
                        className={`${decision === 'approve' ? primary : danger} mt-5`}
                      >
                        {mutation.isPending
                          ? 'SAVING…'
                          : mutationIssue
                            ? 'RETRY SAME DECISION'
                            : decision === 'approve'
                              ? 'CONFIRM APPROVAL'
                              : 'CONFIRM REJECTION'}
                      </button>
                    )}
                    {!frozen ||
                    (mutationIssue &&
                      mutationIssue.title !== 'NOT SAVED YET') ? (
                      <button
                        type="button"
                        onClick={resetAfterKnownError}
                        className={`${secondary} mt-3`}
                      >
                        BACK TO REVIEW / REFRESH
                      </button>
                    ) : null}
                  </section>
                ) : (
                  <div className="mt-5 grid gap-3">
                    <button
                      type="button"
                      onClick={() => void startDecision('approve')}
                      disabled={query.isFetching || request.counted_boxes === 0}
                      className={primary}
                    >
                      APPROVE ADJUSTMENT
                    </button>
                    <button
                      type="button"
                      onClick={() => void startDecision('reject')}
                      disabled={query.isFetching}
                      className={danger}
                    >
                      REJECT REQUEST
                    </button>
                    <button
                      type="button"
                      onClick={() => void query.refetch()}
                      className={secondary}
                    >
                      REFRESH CURRENT STATE
                    </button>
                  </div>
                )}
                {!decision && issue && <Issue issue={issue} />}
              </>
            )
          )}
        </>
      )}
    </Shell>
  );
}
