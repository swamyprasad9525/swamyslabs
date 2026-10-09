import { ArrowRight, MessageCircle } from 'lucide-react';

const statusStyles = {
  calculated: 'border-emerald-700/25 bg-emerald-50 text-emerald-800',
  estimated: 'border-amber-700/25 bg-amber-50 text-amber-800',
  confirm: 'border-stone-300 bg-stone-100 text-stone-600',
};

function StatusLabel({ children, status }) {
  return (
    <span className={`inline-flex min-h-6 items-center border px-2 py-1 text-[9px] font-bold uppercase tracking-[.12em] ${statusStyles[status]}`}>
      {children}
    </span>
  );
}

function SummaryRow({ label, value, status, statusLabel, detail, prominent = false }) {
  return (
    <div className={`grid gap-2 border-b border-[var(--color-border)] py-4 last:border-0 ${prominent ? 'bg-stone-100/70 px-4' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <dt className="text-xs font-semibold uppercase tracking-[.12em] text-stone-500">{label}</dt>
        {status && <StatusLabel status={status}>{statusLabel}</StatusLabel>}
      </div>
      <dd className={`${prominent ? 'font-serif text-3xl text-stone-950' : 'text-sm font-semibold leading-6 text-stone-900'}`}>
        {value}
      </dd>
      {detail && <dd className="text-xs leading-5 text-stone-500">{detail}</dd>}
    </div>
  );
}

export default function PlannerSummary({
  stone,
  finish,
  thickness,
  application,
  projectArea,
  allowanceArea,
  wastePercent,
  requiredArea,
  estimatedSlabs,
  materialEstimate,
  onRequestQuote,
  whatsappUrl,
  canRequestQuote,
}) {
  const hasAllowance = allowanceArea !== null && allowanceArea !== undefined;
  const hasValidWaste = wastePercent !== null && wastePercent !== undefined;

  return (
    <section className="border border-[var(--color-border-strong)] bg-[var(--color-surface)]" aria-labelledby="project-summary-title">
      <header className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
        <p className="type-eyebrow text-[var(--color-brand)]">Your project</p>
        <h2 id="project-summary-title" className="mt-2 font-serif text-3xl text-stone-950">Planning summary</h2>
      </header>

      <div className="px-5 py-2 sm:px-6">
        <dl>
          <SummaryRow label="Stone" value={stone?.name || 'Select a material'} />
          <SummaryRow label="Finish" value={finish || 'Confirmed during quotation'} />
          <SummaryRow label="Thickness" value={thickness || 'Confirmed during quotation'} />
          <SummaryRow label="Application" value={application || 'Choose a recorded application'} />
        </dl>

        <div aria-live="polite">
          <dl>
            <SummaryRow
              label="Project area"
              value={projectArea || 'Enter project size to calculate'}
              status={projectArea ? 'calculated' : undefined}
              statusLabel="Calculated"
            />
            <SummaryRow
              label="Planning allowance"
              value={hasAllowance ? `${allowanceArea} sq.ft (${wastePercent}%)` : (hasValidWaste ? `${wastePercent}% assumption` : 'Enter a valid allowance')}
              status={hasAllowance ? 'calculated' : undefined}
              statusLabel="Calculated"
            />
            <SummaryRow
              label="Required material"
              value={requiredArea ? `${requiredArea} sq.ft` : 'Awaiting valid project area'}
              status={requiredArea ? 'calculated' : undefined}
              statusLabel="Calculated"
              prominent={Boolean(requiredArea)}
            />
            <SummaryRow
              label="Approximate slabs"
              value={estimatedSlabs ? `${estimatedSlabs} slabs` : 'Confirmed after slab / batch selection'}
              status={estimatedSlabs ? 'estimated' : 'confirm'}
              statusLabel={estimatedSlabs ? 'Estimated' : 'To be confirmed'}
              detail={estimatedSlabs ? 'Actual yield depends on cutting layout, usable dimensions, defects, matching and site conditions.' : 'Current catalog dimensions are not treated as verified inventory slab dimensions.'}
            />
            <SummaryRow
              label="Indicative material estimate"
              value={materialEstimate || (stone ? 'Pricing confirmed during quotation' : 'Select a material')}
              status={materialEstimate ? 'estimated' : 'confirm'}
              statusLabel={materialEstimate ? 'Estimated' : 'To be confirmed'}
              detail={materialEstimate ? 'Material-only planning estimate based on the catalog price per sq.ft; not a final commercial offer.' : undefined}
            />
          </dl>
        </div>

        <dl className="border-t border-[var(--color-border-strong)]">
          <SummaryRow label="Processing" value="Confirmed for the selected finish and requirements" status="confirm" statusLabel="To be confirmed" />
          <SummaryRow label="Freight" value="Calculated during quotation for the delivery destination" status="confirm" statusLabel="To be confirmed" />
          <SummaryRow label="Taxes" value="Confirmed during quotation" status="confirm" statusLabel="To be confirmed" />
          <SummaryRow label="Availability & batch" value="Confirmed during material selection" status="confirm" statusLabel="To be confirmed" />
        </dl>
      </div>

      <div className="border-t border-[var(--color-border)] bg-stone-100/70 px-5 py-6 sm:px-6">
        <p className="text-xs leading-6 text-stone-600">
          Project estimates are for planning only. Final material quantity, slab selection, finish, availability, processing, taxes, freight and pricing are confirmed by Swamy Slabs during quotation.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onRequestQuote}
            disabled={!canRequestQuote}
            className="action-link border-[var(--color-brand)] bg-[var(--color-brand)] text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Request Exact Quote <ArrowRight size={16} aria-hidden="true" />
          </button>
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="action-link border-stone-950 bg-transparent text-stone-950 hover:bg-stone-950 hover:text-white"
            >
              Discuss on WhatsApp <MessageCircle size={16} aria-hidden="true" />
            </a>
          ) : (
            <span className="action-link cursor-not-allowed border-stone-300 text-stone-400" aria-disabled="true">
              Discuss on WhatsApp <MessageCircle size={16} aria-hidden="true" />
            </span>
          )}
        </div>
        {!canRequestQuote && <p className="mt-3 text-xs text-stone-500">Select a stone and enter a valid project size to prepare the quote brief.</p>}
      </div>
    </section>
  );
}
