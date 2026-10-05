import { useState } from 'react';
import { Link } from 'react-router-dom';

import { AppHeader } from '@/app/layout/AppHeader';
import {
  formatQuantity,
  getPalletFillStatus,
} from '@/domain/pallet/createPallet';
import {
  getStoreIssue,
  locationCodeSchema,
  palletCodeSchema,
  type StoreIssue,
} from '@/domain/pallet/storePallet';
import {
  type RackLocation,
  type StorePallet,
  type StoredPallet,
} from '@/features/store-pallet/storePallet.api';
import {
  usePalletForStore,
  useRackLocation,
  useStorePalletMutation,
} from '@/features/store-pallet/useStorePallet';

type Step = 'pallet' | 'location' | 'review';

const primaryButton =
  'min-h-14 w-full rounded-xl bg-[#111d2d] px-5 py-3 text-base font-black tracking-[0.06em] text-white shadow-[0_3px_0_#d18a1a] enabled:hover:bg-[#1d2d43] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none';
const secondaryButton =
  'min-h-12 rounded-lg border border-slate-400 bg-white px-4 py-3 font-extrabold text-slate-700 hover:bg-slate-50';

export function StorePalletPage() {
  const [step, setStep] = useState<Step>('pallet');
  const [palletInput, setPalletInput] = useState('');
  const [palletCode, setPalletCode] = useState<string | null>(null);
  const [palletInputError, setPalletInputError] = useState<string | null>(null);
  const [locationInput, setLocationInput] = useState('');
  const [locationCode, setLocationCode] = useState<string | null>(null);
  const [locationInputError, setLocationInputError] = useState<string | null>(
    null,
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const palletQuery = usePalletForStore(palletCode);
  const locationQuery = useRackLocation(locationCode);
  const storeMutation = useStorePalletMutation();
  const pallet = palletQuery.data ?? null;
  const location = locationQuery.data ?? null;
  const stored = storeMutation.data ?? null;

  function lookUpPallet() {
    const parsed = palletCodeSchema.safeParse(palletInput);
    if (!parsed.success) {
      setPalletInputError(
        parsed.error.issues[0]?.message ?? 'Enter a pallet code.',
      );
      return;
    }
    setPalletInputError(null);
    setPalletInput(parsed.data);
    if (palletCode === parsed.data) {
      void palletQuery.refetch();
    }
    setPalletCode(parsed.data);
  }

  function lookUpLocation() {
    const parsed = locationCodeSchema.safeParse(locationInput);
    if (!parsed.success) {
      setLocationInputError(
        parsed.error.issues[0]?.message ?? 'Enter a rack location code.',
      );
      return;
    }
    setLocationInputError(null);
    setLocationInput(parsed.data);
    if (locationCode === parsed.data) {
      void locationQuery.refetch();
    }
    setLocationCode(parsed.data);
  }

  function confirmStorage() {
    if (!pallet || !location || location.occupied) {
      return;
    }
    const requestKey = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(requestKey);
    storeMutation.mutate({
      palletCode: pallet.pallet_code,
      destinationLocationId: location.id,
      idempotencyKey: requestKey,
    });
  }

  function changeLocation() {
    setLocationCode(null);
    setLocationInput('');
    setIdempotencyKey(null);
    storeMutation.reset();
    setStep('location');
  }

  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />
      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
              Store Pallet
            </p>
            <h1 className="mt-1 text-2xl leading-tight font-black text-[#172033] sm:text-3xl">
              {stored
                ? 'Pallet Stored'
                : step === 'pallet'
                  ? 'Select Pallet'
                  : step === 'location'
                    ? 'Select Location'
                    : 'Review Storage'}
            </h1>
          </div>
          {!stored && (
            <p className="shrink-0 text-xs font-extrabold text-slate-500">
              {step === 'pallet' ? '1' : step === 'location' ? '2' : '3'} of 3
            </p>
          )}
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_3px_0_rgba(15,23,42,0.08)]">
          <div
            className={`h-1.5 ${stored ? 'bg-emerald-500' : 'bg-amber-400'}`}
          />
          <div className="p-4 sm:p-6">
            {stored ? (
              <SuccessStep stored={stored} />
            ) : step === 'pallet' ? (
              <div>
                <p className="text-sm font-semibold text-slate-600">
                  Enter the code on the pallet label. Camera scanning is not yet
                  required.
                </p>
                <CodeField
                  id="pallet-code"
                  label="Pallet code"
                  placeholder="MM-P-0004821"
                  value={palletInput}
                  error={palletInputError}
                  onChange={(value) => {
                    setPalletInput(value);
                    setPalletCode(null);
                    setPalletInputError(null);
                  }}
                  onEnter={lookUpPallet}
                />
                <button
                  type="button"
                  onClick={lookUpPallet}
                  className={`${primaryButton} mt-4`}
                >
                  LOOK UP PALLET
                </button>
                {palletQuery.isLoading && (
                  <LoadingMessage text="Loading pallet…" />
                )}
                {palletQuery.isError && (
                  <IssuePanel
                    issue={
                      getStoreIssue(palletQuery.error) ?? {
                        title: 'UNABLE TO LOAD PALLET',
                        message: 'Check the connection and try again.',
                      }
                    }
                  />
                )}
                {pallet && (
                  <div className="mt-5 space-y-4">
                    <PalletSummary pallet={pallet} />
                    {pallet.lifecycle_status !== 'created' ? (
                      <IssuePanel
                        issue={getStoreIssue(
                          new Error(
                            pallet.lifecycle_status === 'stored'
                              ? 'PALLET_ALREADY_STORED'
                              : pallet.lifecycle_status === 'shipped'
                                ? 'PALLET_SHIPPED'
                                : pallet.lifecycle_status === 'on_hold'
                                  ? 'PALLET_ON_HOLD'
                                  : 'PALLET_NOT_READY_TO_STORE',
                          ),
                        )!}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStep('location')}
                        className={primaryButton}
                      >
                        CONTINUE TO LOCATION
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : step === 'location' && pallet ? (
              <div>
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">
                  {pallet.pallet_code} · {pallet.part.part_number}
                </p>
                <p className="mt-4 text-sm font-semibold text-slate-600">
                  Enter an active rack code. Occupancy is checked again when you
                  confirm.
                </p>
                <CodeField
                  id="location-code"
                  label="Rack location code"
                  placeholder="B-003-AC"
                  value={locationInput}
                  error={locationInputError}
                  onChange={(value) => {
                    setLocationInput(value);
                    setLocationCode(null);
                    setLocationInputError(null);
                  }}
                  onEnter={lookUpLocation}
                />
                <button
                  type="button"
                  onClick={lookUpLocation}
                  className={`${primaryButton} mt-4`}
                >
                  CHECK LOCATION
                </button>
                {locationQuery.isLoading && (
                  <LoadingMessage text="Checking rack…" />
                )}
                {locationQuery.isError && (
                  <IssuePanel
                    issue={
                      getStoreIssue(locationQuery.error) ?? {
                        title: 'UNABLE TO CHECK LOCATION',
                        message: 'Check the connection and try again.',
                      }
                    }
                  />
                )}
                {location && (
                  <div className="mt-5 space-y-4">
                    <LocationSummary location={location} />
                    {location.occupied ? (
                      <IssuePanel
                        issue={{
                          title: 'LOCATION OCCUPIED',
                          message: `${location.location_code} already contains a pallet. Scan another location.`,
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStep('review')}
                        className={primaryButton}
                      >
                        REVIEW STORAGE
                      </button>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setStep('pallet')}
                  className={`${secondaryButton} mt-4 w-full`}
                >
                  BACK TO PALLET
                </button>
              </div>
            ) : step === 'review' && pallet && location ? (
              <div>
                <p className="text-sm font-semibold text-slate-600">
                  Confirm this rack assignment. Nothing is saved until you tap
                  STORE PALLET.
                </p>
                <dl className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-300 bg-slate-50 px-4">
                  <ReviewRow label="Pallet" value={pallet.pallet_code} />
                  <ReviewRow label="Part" value={pallet.part.part_number} />
                  <ReviewRow
                    label="Boxes"
                    value={String(pallet.current_boxes)}
                  />
                  <ReviewRow
                    label="Pieces"
                    value={formatQuantity(pallet.current_pieces)}
                  />
                  <ReviewRow
                    label="Destination"
                    value={location.location_code}
                  />
                </dl>
                {storeMutation.isError && (
                  <IssuePanel
                    issue={
                      storeMutation.error instanceof Error &&
                      storeMutation.error.message === 'LOCATION_OCCUPIED'
                        ? {
                            title: 'LOCATION OCCUPIED',
                            message: `${location.location_code} already contains a pallet. Scan another location.`,
                          }
                        : (getStoreIssue(storeMutation.error) ?? {
                            title: 'NOT SAVED YET',
                            message:
                              'Check the connection and retry this same storage request.',
                          })
                    }
                  />
                )}
                <button
                  type="button"
                  onClick={confirmStorage}
                  disabled={storeMutation.isPending}
                  className={`${primaryButton} mt-5`}
                >
                  {storeMutation.isPending
                    ? 'STORING…'
                    : storeMutation.isError
                      ? 'RETRY STORE'
                      : 'STORE PALLET'}
                </button>
                {(idempotencyKey === null ||
                  (storeMutation.error instanceof Error &&
                    storeMutation.error.message === 'LOCATION_OCCUPIED')) && (
                  <button
                    type="button"
                    onClick={changeLocation}
                    className={`${secondaryButton} mt-3 w-full`}
                  >
                    CHANGE LOCATION
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function CodeField({
  id,
  label,
  placeholder,
  value,
  error,
  onChange,
  onEnter,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  error: string | null;
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
        placeholder={placeholder}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="mt-2 min-h-16 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-center text-xl font-black tracking-wide text-[#172033] uppercase"
      />
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function PalletSummary({ pallet }: { pallet: StorePallet }) {
  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
      <p className="text-xl font-black text-[#172033]">{pallet.pallet_code}</p>
      <p className="mt-2 text-base font-black">{pallet.part.part_number}</p>
      <p className="text-sm font-semibold text-slate-600">
        {pallet.part.description}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-300 pt-3 text-center">
        <Quantity value={String(pallet.current_boxes)} label="Boxes" />
        <Quantity
          value={formatQuantity(pallet.current_pieces)}
          label="Pieces"
        />
      </div>
      <p className="mt-3 text-center text-sm font-black tracking-wide text-amber-800">
        {getPalletFillStatus(
          pallet.current_boxes,
          pallet.boxes_per_full_pallet_snapshot,
        )}{' '}
        · {pallet.lifecycle_status.toUpperCase().replaceAll('_', ' ')}
      </p>
    </div>
  );
}

function LocationSummary({ location }: { location: RackLocation }) {
  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xl font-black text-[#172033]">
          {location.location_code}
        </p>
        <span
          className={`rounded-full px-3 py-1 text-sm font-black ${
            location.occupied
              ? 'bg-red-100 text-red-800'
              : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {location.occupied ? 'OCCUPIED' : 'OPEN'}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-600">
        Rack{location.zone ? ` · Zone ${location.zone}` : ''}
        {location.rack ? ` · ${location.rack}` : ''}
        {location.position ? ` · ${location.position}` : ''}
      </p>
    </div>
  );
}

function SuccessStep({ stored }: { stored: StoredPallet }) {
  return (
    <div aria-live="polite" className="text-center">
      <div
        aria-hidden="true"
        className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700"
      >
        ✓
      </div>
      <p className="mt-4 text-xs font-black tracking-[0.18em] text-emerald-700 uppercase">
        Pallet Stored
      </p>
      <p className="mt-2 break-words text-3xl font-black text-[#172033] sm:text-4xl">
        {stored.pallet_code}
      </p>
      <dl className="mt-5 divide-y divide-slate-200 rounded-xl bg-slate-100 px-4 text-left">
        <ReviewRow label="Location" value={stored.destination_location_code} />
        <ReviewRow label="Part" value={stored.part_number} />
        <ReviewRow label="Boxes" value={String(stored.current_boxes)} />
        <ReviewRow
          label="Pieces"
          value={formatQuantity(stored.current_pieces)}
        />
      </dl>
      <Link
        to="/"
        className={`${primaryButton} mt-6 flex items-center justify-center`}
      >
        DONE
      </Link>
    </div>
  );
}

function Quantity({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs font-black tracking-wide text-slate-500 uppercase">
        {label}
      </p>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 py-3 text-sm">
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-black text-[#172033]">
        {value}
      </dd>
    </div>
  );
}

function LoadingMessage({ text }: { text: string }) {
  return (
    <p role="status" className="mt-4 text-center font-bold text-slate-600">
      {text}
    </p>
  );
}

function IssuePanel({ issue }: { issue: StoreIssue }) {
  return (
    <div
      role="alert"
      className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4"
    >
      <p className="font-black tracking-[0.08em] text-red-800">{issue.title}</p>
      <p className="mt-1 text-sm font-bold text-red-700">{issue.message}</p>
    </div>
  );
}
