import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppHeader } from '@/app/layout/AppHeader';
import {
  boxCountSchema,
  calculatePieces,
  formatQuantity,
  getPalletFillStatus,
  palletDetailsSchema,
  type PalletDetails,
} from '@/domain/pallet/createPallet';
import { PalletLabel } from '@/features/create-pallet/PalletLabel';
import {
  useActiveParts,
  useCreatePalletMutation,
  usePackingSpec,
} from '@/features/create-pallet/useCreatePallet';

type CreatePalletStep = 'part' | 'boxes' | 'details' | 'review';

const primaryButtonClass =
  'min-h-14 w-full rounded-xl bg-[#111d2d] px-5 text-base font-black tracking-[0.06em] text-white shadow-[0_3px_0_#d18a1a] transition-colors enabled:hover:bg-[#1d2d43] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none';
const secondaryButtonClass =
  'min-h-12 rounded-lg border border-slate-400 bg-white px-4 font-extrabold text-slate-700 transition-colors hover:bg-slate-50';

export function CreatePalletPage() {
  const partsQuery = useActiveParts();
  const [step, setStep] = useState<CreatePalletStep>('part');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [boxInput, setBoxInput] = useState('');
  const [boxError, setBoxError] = useState<string | null>(null);
  const [details, setDetails] = useState<PalletDetails>({
    heatNumber: '',
    lotNumber: '',
    machineCode: undefined,
  });
  const [detailErrors, setDetailErrors] = useState<
    Partial<Record<keyof PalletDetails, string>>
  >({});
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [isLabelVisible, setIsLabelVisible] = useState(false);
  const packingQuery = usePackingSpec(selectedPartId);
  const createMutation = useCreatePalletMutation();

  const selectedPart = useMemo(
    () => partsQuery.data?.find((part) => part.id === selectedPartId) ?? null,
    [partsQuery.data, selectedPartId],
  );
  const parsedBoxes = boxCountSchema.safeParse(boxInput);
  const boxes = parsedBoxes.success ? parsedBoxes.data : null;
  const pieces =
    boxes !== null && packingQuery.data
      ? calculatePieces(boxes, packingQuery.data.pieces_per_box)
      : null;
  const fillStatus =
    boxes !== null && packingQuery.data
      ? getPalletFillStatus(boxes, packingQuery.data.boxes_per_full_pallet)
      : null;

  function choosePart(partId: string) {
    setSelectedPartId(partId);
    setBoxInput('');
    setBoxError(null);
    setStep('boxes');
  }

  function continueFromBoxes() {
    const result = boxCountSchema.safeParse(boxInput);

    if (!result.success) {
      setBoxError(
        result.error.issues[0]?.message ?? 'Enter a valid box count.',
      );
      return;
    }

    setBoxError(null);
    setStep('details');
  }

  function updateDetail(field: keyof PalletDetails, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
    setDetailErrors((current) => ({ ...current, [field]: undefined }));
  }

  function continueFromDetails() {
    const result = palletDetailsSchema.safeParse(details);

    if (!result.success) {
      const errors: Partial<Record<keyof PalletDetails, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof PalletDetails | undefined;
        if (field && !errors[field]) {
          errors[field] = issue.message;
        }
      }
      setDetailErrors(errors);
      return;
    }

    setDetails(result.data);
    setDetailErrors({});
    setStep('review');
  }

  function submitCreatePallet() {
    if (!selectedPart || !packingQuery.data || boxes === null) {
      return;
    }

    const requestKey = idempotencyKey ?? crypto.randomUUID();
    setIdempotencyKey(requestKey);

    createMutation.mutate({
      partId: selectedPart.id,
      boxes,
      heatNumber: details.heatNumber,
      lotNumber: details.lotNumber,
      idempotencyKey: requestKey,
      ...(details.machineCode ? { machineCode: details.machineCode } : {}),
    });
  }

  if (createMutation.data && isLabelVisible) {
    return (
      <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))] print:bg-white print:pb-0">
        <div className="print:hidden">
          <AppHeader backTo="/" />
        </div>
        <PalletLabel
          pallet={createMutation.data}
          onClose={() => setIsLabelVisible(false)}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-[max(6rem,env(safe-area-inset-bottom))]">
      <AppHeader backTo="/" />

      <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black tracking-[0.18em] text-amber-700 uppercase">
              Create Pallet
            </p>
            <h1 className="mt-1 text-2xl leading-tight font-black text-[#172033] sm:text-3xl">
              {createMutation.data ? 'Pallet Created' : getStepTitle(step)}
            </h1>
          </div>
          {!createMutation.data && (
            <p className="shrink-0 text-xs font-extrabold text-slate-500">
              {getStepNumber(step)} of 4
            </p>
          )}
        </div>

        {createMutation.data ? (
          <SuccessPanel
            pallet={createMutation.data}
            onPrintLabel={() => setIsLabelVisible(true)}
          />
        ) : (
          <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_3px_0_rgba(15,23,42,0.08)]">
            <div className="h-1.5 bg-amber-400" />
            <div className="p-4 sm:p-6">
              {step === 'part' && (
                <PartStep
                  parts={partsQuery.data ?? []}
                  isLoading={partsQuery.isLoading}
                  isError={partsQuery.isError}
                  onRetry={() => void partsQuery.refetch()}
                  onChoose={choosePart}
                />
              )}

              {step === 'boxes' && selectedPart && (
                <BoxesStep
                  partNumber={selectedPart.part_number}
                  description={selectedPart.description}
                  boxInput={boxInput}
                  boxError={boxError}
                  pieces={pieces}
                  fillStatus={fillStatus}
                  isPackingLoading={packingQuery.isLoading}
                  isPackingError={packingQuery.isError}
                  piecesPerBox={packingQuery.data?.pieces_per_box}
                  boxesPerFullPallet={packingQuery.data?.boxes_per_full_pallet}
                  onBoxInput={(value) => {
                    setBoxInput(value);
                    setBoxError(null);
                  }}
                  onBack={() => setStep('part')}
                  onContinue={continueFromBoxes}
                  onRetryPacking={() => void packingQuery.refetch()}
                />
              )}

              {step === 'details' && selectedPart && (
                <DetailsStep
                  partNumber={selectedPart.part_number}
                  details={details}
                  errors={detailErrors}
                  onUpdate={updateDetail}
                  onBack={() => setStep('boxes')}
                  onContinue={continueFromDetails}
                />
              )}

              {step === 'review' &&
                selectedPart &&
                packingQuery.data &&
                boxes !== null &&
                pieces !== null &&
                fillStatus && (
                  <ReviewStep
                    partNumber={selectedPart.part_number}
                    description={selectedPart.description}
                    boxes={boxes}
                    pieces={pieces}
                    fillStatus={fillStatus}
                    details={details}
                    isCreating={createMutation.isPending}
                    didFail={createMutation.isError}
                    hasSubmissionKey={idempotencyKey !== null}
                    onBack={() => {
                      setIdempotencyKey(null);
                      createMutation.reset();
                      setStep('details');
                    }}
                    onSubmit={submitCreatePallet}
                  />
                )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function getStepTitle(step: CreatePalletStep) {
  const titles: Record<CreatePalletStep, string> = {
    part: 'Select Part',
    boxes: 'Enter Boxes',
    details: 'Pallet Details',
    review: 'Review Pallet',
  };
  return titles[step];
}

function getStepNumber(step: CreatePalletStep) {
  return ['part', 'boxes', 'details', 'review'].indexOf(step) + 1;
}

type PartStepProps = {
  parts: Array<{
    id: string;
    part_number: string;
    description: string;
    product_family: string;
  }>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onChoose: (partId: string) => void;
};

function PartStep({
  parts,
  isLoading,
  isError,
  onRetry,
  onChoose,
}: PartStepProps) {
  if (isLoading) {
    return <StatusMessage title="Loading parts…" />;
  }

  if (isError) {
    return (
      <StatusMessage
        title="Unable to load parts"
        message="Check the connection and try again."
        actionLabel="TRY AGAIN"
        onAction={onRetry}
      />
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm font-bold text-slate-600">
        Choose the finished part on this pallet.
      </p>
      <div className="space-y-3">
        {parts.map((part) => (
          <button
            key={part.id}
            type="button"
            onClick={() => onChoose(part.id)}
            className="flex min-h-20 w-full items-center gap-3 rounded-xl border-2 border-slate-300 bg-slate-50 px-4 py-3 text-left transition-colors hover:border-amber-500 hover:bg-amber-50"
          >
            <span className="min-w-0">
              <span className="block text-lg font-black text-[#172033]">
                {part.part_number}
              </span>
              <span className="mt-0.5 block text-sm leading-5 font-semibold text-slate-600">
                {part.description}
              </span>
              <span className="mt-1 block text-xs font-bold tracking-wide text-slate-500 uppercase">
                {part.product_family}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="ml-auto text-2xl text-slate-400"
            >
              →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

type BoxesStepProps = {
  partNumber: string;
  description: string;
  boxInput: string;
  boxError: string | null;
  pieces: number | null;
  fillStatus: string | null;
  isPackingLoading: boolean;
  isPackingError: boolean;
  piecesPerBox: number | undefined;
  boxesPerFullPallet: number | undefined;
  onBoxInput: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onRetryPacking: () => void;
};

function BoxesStep(props: BoxesStepProps) {
  if (props.isPackingLoading) {
    return <StatusMessage title="Loading packing information…" />;
  }

  if (props.isPackingError) {
    return (
      <StatusMessage
        title="Unable to load packing information"
        message="This pallet cannot be calculated until the server responds."
        actionLabel="TRY AGAIN"
        onAction={props.onRetryPacking}
      />
    );
  }

  return (
    <div>
      <SelectedPart
        partNumber={props.partNumber}
        description={props.description}
      />
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-100 p-3 text-center">
        <div>
          <p className="text-xl font-black">{props.piecesPerBox}</p>
          <p className="text-[0.65rem] font-black tracking-wide text-slate-500 uppercase">
            Pieces / box
          </p>
        </div>
        <div className="border-l border-slate-300">
          <p className="text-xl font-black">{props.boxesPerFullPallet}</p>
          <p className="text-[0.65rem] font-black tracking-wide text-slate-500 uppercase">
            Full pallet boxes
          </p>
        </div>
      </div>

      <label
        htmlFor="box-count"
        className="mt-5 block text-sm font-black text-slate-700"
      >
        Number of boxes
      </label>
      <input
        id="box-count"
        inputMode="numeric"
        pattern="[0-9]*"
        min="1"
        value={props.boxInput}
        onChange={(event) => props.onBoxInput(event.target.value)}
        aria-invalid={props.boxError !== null}
        aria-describedby={props.boxError ? 'box-error' : undefined}
        className="mt-2 min-h-16 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-center text-3xl font-black text-[#172033]"
        placeholder="0"
      />
      {props.boxError && (
        <p id="box-error" className="mt-2 text-sm font-bold text-red-700">
          {props.boxError}
        </p>
      )}

      {props.pieces !== null && props.fillStatus && (
        <div
          aria-live="polite"
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center"
        >
          <p className="text-3xl font-black text-[#172033]">
            {formatQuantity(props.pieces)} pieces
          </p>
          <p className="mt-1 text-sm font-black tracking-[0.16em] text-amber-800">
            {props.fillStatus}
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-600">
            Preview only. The server calculates the saved quantity.
          </p>
        </div>
      )}

      <StepActions
        onBack={props.onBack}
        onContinue={props.onContinue}
        continueLabel="CONTINUE"
      />
    </div>
  );
}

type DetailsStepProps = {
  partNumber: string;
  details: PalletDetails;
  errors: Partial<Record<keyof PalletDetails, string>>;
  onUpdate: (field: keyof PalletDetails, value: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

function DetailsStep(props: DetailsStepProps) {
  return (
    <div>
      <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-black text-slate-700">
        {props.partNumber}
      </p>
      <div className="mt-4 space-y-4">
        <TextField
          id="heat-number"
          label="Heat number"
          value={props.details.heatNumber}
          error={props.errors.heatNumber}
          onChange={(value) => props.onUpdate('heatNumber', value)}
          required
        />
        <TextField
          id="lot-number"
          label="Lot number"
          value={props.details.lotNumber}
          error={props.errors.lotNumber}
          onChange={(value) => props.onUpdate('lotNumber', value)}
          required
        />
        <TextField
          id="machine-code"
          label="Machine code"
          value={props.details.machineCode ?? ''}
          error={props.errors.machineCode}
          onChange={(value) => props.onUpdate('machineCode', value)}
          hint="Optional"
        />
      </div>
      <StepActions
        onBack={props.onBack}
        onContinue={props.onContinue}
        continueLabel="REVIEW PALLET"
      />
    </div>
  );
}

type ReviewStepProps = {
  partNumber: string;
  description: string;
  boxes: number;
  pieces: number;
  fillStatus: string;
  details: PalletDetails;
  isCreating: boolean;
  didFail: boolean;
  hasSubmissionKey: boolean;
  onBack: () => void;
  onSubmit: () => void;
};

function ReviewStep(props: ReviewStepProps) {
  return (
    <div>
      <p className="text-sm font-bold text-slate-600">
        Confirm these details before creating permanent inventory.
      </p>
      <dl className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-300 bg-slate-50 px-4">
        <ReviewRow label="Part" value={props.partNumber} />
        <ReviewRow label="Description" value={props.description} />
        <ReviewRow label="Boxes" value={String(props.boxes)} strong />
        <ReviewRow label="Pieces" value={formatQuantity(props.pieces)} strong />
        <ReviewRow label="Pallet" value={props.fillStatus} />
        <ReviewRow label="Heat" value={props.details.heatNumber} />
        <ReviewRow label="Lot" value={props.details.lotNumber} />
        <ReviewRow
          label="Machine"
          value={props.details.machineCode || 'Not entered'}
        />
      </dl>

      {props.didFail && (
        <div
          role="alert"
          className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4"
        >
          <p className="font-black tracking-[0.08em] text-red-800">
            NOT SAVED YET
          </p>
          <p className="mt-1 text-sm font-bold text-red-700">
            This request was not saved. Check the connection and try again.
          </p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={props.isCreating}
          className={primaryButtonClass}
        >
          {props.isCreating
            ? 'CREATING…'
            : props.didFail
              ? 'RETRY CREATE'
              : 'CREATE PALLET'}
        </button>
        {!props.hasSubmissionKey && (
          <button
            type="button"
            onClick={props.onBack}
            className={`${secondaryButtonClass} w-full`}
          >
            BACK
          </button>
        )}
      </div>
    </div>
  );
}

function SuccessPanel({
  pallet,
  onPrintLabel,
}: {
  pallet: NonNullable<ReturnType<typeof useCreatePalletMutation>['data']>;
  onPrintLabel: () => void;
}) {
  const fillStatus = getPalletFillStatus(
    pallet.current_boxes,
    pallet.boxes_per_full_pallet_snapshot,
  );

  return (
    <section
      aria-live="polite"
      className="overflow-hidden rounded-xl border border-emerald-300 bg-white shadow-[0_3px_0_rgba(15,23,42,0.08)]"
    >
      <div className="h-2 bg-emerald-500" />
      <div className="p-5 text-center sm:p-7">
        <div
          aria-hidden="true"
          className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700"
        >
          ✓
        </div>
        <p className="mt-4 text-xs font-black tracking-[0.18em] text-emerald-700 uppercase">
          Pallet Created
        </p>
        <p className="mt-2 text-4xl font-black tracking-tight text-[#172033]">
          {pallet.pallet_code}
        </p>
        <p className="mt-5 text-xl font-black">{pallet.part_number}</p>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {pallet.description}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-slate-100 p-4">
          <div>
            <p className="text-3xl font-black">{pallet.current_boxes}</p>
            <p className="text-xs font-black text-slate-500 uppercase">Boxes</p>
          </div>
          <div className="border-l border-slate-300">
            <p className="text-3xl font-black">
              {formatQuantity(pallet.current_pieces)}
            </p>
            <p className="text-xs font-black text-slate-500 uppercase">
              Pieces
            </p>
          </div>
        </div>
        <p className="mt-4 text-base font-black tracking-[0.16em] text-amber-800">
          {fillStatus}
        </p>
        <p className="mt-4 text-sm font-bold text-slate-600">
          Next: print the label, then store this pallet.
        </p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={onPrintLabel}
            className={primaryButtonClass}
          >
            PRINT LABEL
          </button>
          <Link
            to="/"
            className={`${secondaryButtonClass} flex w-full items-center justify-center`}
          >
            DONE
          </Link>
        </div>
      </div>
    </section>
  );
}

function SelectedPart({
  partNumber,
  description,
}: {
  partNumber: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border-l-4 border-amber-400 bg-slate-100 px-4 py-3">
      <p className="text-lg font-black">{partNumber}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-600">
        {description}
      </p>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  error,
  hint,
  required,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error: string | undefined;
  hint?: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-center text-sm font-black text-slate-700"
      >
        {label}
        {hint && <span className="ml-auto text-xs text-slate-500">{hint}</span>}
      </label>
      <input
        id={id}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        autoComplete="off"
        className="mt-2 min-h-13 w-full rounded-xl border-2 border-slate-400 bg-white px-4 text-lg font-bold text-[#172033]"
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function ReviewRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-3 py-3 text-sm">
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd
        className={`min-w-0 break-words text-right ${strong ? 'text-lg font-black' : 'font-bold'}`}
      >
        {value}
      </dd>
    </div>
  );
}

function StepActions({
  onBack,
  onContinue,
  continueLabel,
}: {
  onBack: () => void;
  onContinue: () => void;
  continueLabel: string;
}) {
  return (
    <div className="mt-6 grid grid-cols-[auto_1fr] gap-3">
      <button type="button" onClick={onBack} className={secondaryButtonClass}>
        BACK
      </button>
      <button type="button" onClick={onContinue} className={primaryButtonClass}>
        {continueLabel}
      </button>
    </div>
  );
}

function StatusMessage({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div role="status" className="py-8 text-center">
      <p className="text-lg font-black text-[#172033]">{title}</p>
      {message && (
        <p className="mt-2 text-sm font-semibold text-slate-600">{message}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={`${secondaryButtonClass} mt-5`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
