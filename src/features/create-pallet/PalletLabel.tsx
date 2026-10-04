import { QRCodeSVG } from 'qrcode.react';

import {
  formatQuantity,
  getPalletFillStatus,
} from '@/domain/pallet/createPallet';
import type { CreatedPallet } from '@/features/create-pallet/createPallet.api';

type PalletLabelProps = {
  pallet: CreatedPallet;
  onClose: () => void;
};

export function PalletLabel({ pallet, onClose }: PalletLabelProps) {
  const fillStatus = getPalletFillStatus(
    pallet.current_boxes,
    pallet.boxes_per_full_pallet_snapshot,
  );
  const packedDate = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(pallet.packed_at));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
      <div className="print:hidden">
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 rounded-lg border border-slate-400 bg-white px-4 font-extrabold text-slate-700"
        >
          ← BACK TO SUCCESS
        </button>
      </div>

      <section
        aria-label={`Printable label for ${pallet.pallet_code}`}
        className="pallet-label mx-auto mt-4 min-h-[35rem] w-full max-w-[28rem] overflow-hidden border-[3px] border-slate-950 bg-white p-5 text-slate-950 shadow-lg min-[360px]:aspect-[2/3] min-[360px]:min-h-0 print:mt-0 print:shadow-none"
      >
        <div className="border-b-[3px] border-slate-950 pb-3 text-center">
          <p className="text-xl font-black tracking-[0.14em] sm:text-2xl">
            MIMIR METALS
          </p>
          <p className="mt-1 text-xs font-bold tracking-[0.2em] uppercase">
            Finished Goods Pallet
          </p>
        </div>

        <div className="py-3 text-center">
          <p className="text-xs font-black tracking-[0.18em] uppercase">
            Pallet ID
          </p>
          <p className="mt-1 text-[1.75rem] leading-none font-black tracking-tight whitespace-nowrap sm:text-4xl">
            {pallet.pallet_code}
          </p>
        </div>

        <div className="border-y-2 border-slate-950 py-3 text-center">
          <p className="text-2xl font-black">{pallet.part_number}</p>
          <p className="mt-1 text-lg leading-tight font-bold">
            {pallet.description}
          </p>
        </div>

        <div className="grid grid-cols-2 border-b-2 border-slate-950 text-center">
          <div className="border-r-2 border-slate-950 py-3">
            <p className="text-4xl font-black">{pallet.current_boxes}</p>
            <p className="text-sm font-black tracking-wide">BOXES</p>
          </div>
          <div className="py-3">
            <p className="text-4xl font-black">
              {formatQuantity(pallet.current_pieces)}
            </p>
            <p className="text-sm font-black tracking-wide">PIECES</p>
          </div>
        </div>

        <p className="border-b-2 border-slate-950 py-2 text-center text-2xl font-black tracking-[0.12em]">
          {fillStatus}
        </p>

        <div className="grid grid-cols-[1fr_auto] gap-4 pt-4">
          <dl className="min-w-0 space-y-2 text-sm font-bold">
            <div>
              <dt className="text-[0.65rem] tracking-[0.14em] uppercase">
                Heat
              </dt>
              <dd className="break-words text-base">{pallet.heat_number}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] tracking-[0.14em] uppercase">
                Lot
              </dt>
              <dd className="break-words text-base">{pallet.lot_number}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] tracking-[0.14em] uppercase">
                Packed
              </dt>
              <dd className="text-base">{packedDate}</dd>
            </div>
          </dl>

          <div className="shrink-0 text-center">
            <QRCodeSVG
              value={pallet.pallet_code}
              size={150}
              level="M"
              marginSize={1}
              title={`QR code containing ${pallet.pallet_code}`}
              className="size-[130px] sm:size-[150px] print:size-[1.35in]"
            />
            <p className="mt-1 text-xs font-black">{pallet.pallet_code}</p>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-4 w-full max-w-[28rem] print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-14 w-full rounded-xl bg-[#111d2d] px-5 text-base font-black tracking-[0.08em] text-white shadow-[0_3px_0_#d18a1a]"
        >
          PRINT LABEL
        </button>
      </div>
    </main>
  );
}
