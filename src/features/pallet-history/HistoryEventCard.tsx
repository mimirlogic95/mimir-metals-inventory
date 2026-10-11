import { formatQuantity } from '@/domain/pallet/createPallet';
import {
  formatHistoryTimestamp,
  formatSignedQuantity,
  historyEventMeaning,
  historyEventTitle,
  matchedCount,
  shipmentQuantity,
  type HistoryEvent,
} from '@/domain/transaction/history';

export function HistoryEventCard({ event }: { event: HistoryEvent }) {
  const count = matchedCount(event);
  const shipment = shipmentQuantity(event);
  const hasQuantities =
    event.previousBoxes !== null &&
    event.boxChange !== null &&
    event.newBoxes !== null &&
    event.previousPieces !== null &&
    event.pieceChange !== null &&
    event.newPieces !== null;
  const hasLocation =
    event.previousLocationCode !== null || event.newLocationCode !== null;
  const visibleReasonNotes =
    event.transactionType.startsWith('adjustment_') && !event.adjustment
      ? null
      : event.reasonNotes;

  return (
    <article className="min-w-0 rounded-xl border border-slate-300 bg-white p-4 shadow-[0_3px_0_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-lg font-black text-[#172033]">
          {historyEventTitle(event.transactionType)}
        </h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
          {event.boxChange === null
            ? 'RECORDED EVENT'
            : event.boxChange === 0
              ? 'NO QUANTITY CHANGE'
              : 'INVENTORY CHANGE'}
        </span>
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-600">
        {historyEventMeaning(event.transactionType)}
      </p>
      <p className="mt-3 text-sm font-bold text-slate-700">
        {formatHistoryTimestamp(event.occurredAt)} ·{' '}
        {event.actorName?.trim() || 'Recorded user'}
      </p>
      <p className="text-xs font-medium text-slate-500">
        Time shown in your local time zone
      </p>

      {hasQuantities ? (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-black tracking-wide text-slate-600 uppercase">
            Saved quantities
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
            <Quantity
              value={formatQuantity(event.previousBoxes!)}
              label="Before boxes"
            />
            <Quantity
              value={formatSignedQuantity(event.boxChange!)}
              label="Box change"
            />
            <Quantity
              value={formatQuantity(event.newBoxes!)}
              label="After boxes"
            />
            <Quantity
              value={formatQuantity(event.previousPieces!)}
              label="Before pieces"
            />
            <Quantity
              value={formatSignedQuantity(event.pieceChange!)}
              label="Piece change"
            />
            <Quantity
              value={formatQuantity(event.newPieces!)}
              label="After pieces"
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm font-semibold text-slate-600">
          Quantity detail was not recorded for this event.
        </p>
      )}

      {hasLocation && (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Detail
            label="From"
            value={event.previousLocationCode ?? 'No location'}
          />
          <Detail
            label="To"
            value={event.newLocationCode ?? 'No current warehouse location'}
          />
        </dl>
      )}

      {count && (
        <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-950">
          Physically counted: {formatQuantity(count.counted_boxes)} boxes /{' '}
          {formatQuantity(count.counted_pieces)} pieces. No inventory change.
        </p>
      )}

      {event.transactionType === 'adjustment_requested' &&
        (event.adjustment ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-black">PROPOSED — NOT APPLIED</p>
            <p className="mt-1 font-semibold">
              Counted {formatQuantity(event.adjustment.countedBoxes)} boxes /{' '}
              {formatQuantity(event.adjustment.countedPieces)} pieces; proposed{' '}
              {formatSignedQuantity(event.adjustment.boxDifference)} boxes /{' '}
              {formatSignedQuantity(event.adjustment.pieceDifference)} pieces.
            </p>
            <p className="mt-1 font-semibold">
              Current request status: {event.adjustment.status.toUpperCase()}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-slate-600">
            Request details are limited by your access. The audit event remains
            visible.
          </p>
        ))}

      {shipment && (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-black text-amber-950">
          Dispatched: {formatQuantity(shipment.boxes)} boxes /{' '}
          {formatQuantity(shipment.pieces)} pieces from{' '}
          {event.previousLocationCode ?? 'recorded source'}.
        </p>
      )}

      {event.transactionType === 'shipped' && (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <Detail label="PO" value={event.poReference ?? 'Not supplied'} />
          <Detail label="BOL" value={event.bolReference ?? 'Not supplied'} />
        </dl>
      )}

      {visibleReasonNotes && (
        <p className="mt-3 break-words text-sm font-semibold text-slate-700">
          {event.transactionType === 'adjustment_rejected'
            ? 'Decision reason'
            : 'Note'}
          : {visibleReasonNotes}
        </p>
      )}
    </article>
  );
}

function Quantity({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <p className="break-words font-black text-[#172033]">{value}</p>
      <p className="text-[0.7rem] leading-tight font-bold text-slate-600">
        {label}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <dt className="text-xs font-black text-slate-600 uppercase">{label}</dt>
      <dd className="mt-1 break-words font-bold text-[#172033]">{value}</dd>
    </div>
  );
}
