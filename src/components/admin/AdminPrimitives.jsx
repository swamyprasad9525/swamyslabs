import { AlertCircle, CheckCircle2, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

const METRIC_TONES = {
  amber: 'border-amber-100 bg-amber-50 text-amber-800',
  blue: 'border-sky-100 bg-sky-50 text-sky-700',
  emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  rose: 'border-rose-100 bg-rose-50 text-rose-700',
  stone: 'border-stone-200 bg-stone-100 text-stone-700',
  violet: 'border-violet-100 bg-violet-50 text-violet-700',
};

export function AdminPage({ size = 'wide', className, children, ...props }) {
  const widths = {
    standard: 'max-w-7xl',
    wide: 'max-w-[1480px]',
    full: 'max-w-[1600px]',
  };

  return (
    <div className={cn('mx-auto w-full', widths[size] || widths.wide, className)} {...props}>
      {children}
    </div>
  );
}

export function AdminPageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-stone-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function AdminMetricCard({ label, value, detail, icon, tone = 'amber', to, className }) {
  const Icon = icon;
  const Component = to ? Link : 'article';

  return (
    <Component
      {...(to ? { to } : {})}
      className={cn(
        'group rounded-xl border border-stone-200 bg-white p-4 text-left no-underline shadow-sm',
        to && 'transition hover:border-stone-300 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">{label}</p>
          <p className="mt-2 break-words text-xl font-bold leading-tight tabular-nums text-stone-950 2xl:text-2xl">{value}</p>
          {detail && <p className="mt-1 text-xs leading-5 text-stone-500">{detail}</p>}
        </div>
        {Icon && (
          <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg border', METRIC_TONES[tone] || METRIC_TONES.amber)} aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </Component>
  );
}

export function AdminPanel({ title, description, icon, action, children, className, bodyClassName }) {
  const Icon = icon;
  return (
    <section className={cn('overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm', className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-600" aria-hidden="true">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-base font-bold text-stone-950">{title}</h2>}
              {description && <p className="mt-0.5 text-xs leading-5 text-stone-500">{description}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function AdminFeedback({ tone = 'error', title, children, onRetry, className }) {
  const isError = tone === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
        isError ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800',
        className,
      )}
      role={isError ? 'alert' : 'status'}
    >
      <div className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          {title && <p className="font-bold">{title}</p>}
          {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        </div>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-rose-800 px-4 text-xs font-bold text-white hover:bg-rose-900">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
        </button>
      )}
    </div>
  );
}

export function AdminLoadingState({ label = 'Loading data…', rows = 3, compact = false, className }) {
  return (
    <div className={cn(compact ? 'p-4' : 'p-5', className)} role="status" aria-live="polite">
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className={cn('animate-pulse rounded-lg bg-stone-100 motion-reduce:animate-none', compact ? 'h-12' : 'h-16')} />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function AdminEmptyState({ icon: Icon = Inbox, title, description, action, className }) {
  return (
    <div className={cn('px-5 py-10 text-center', className)}>
      {Icon && (
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-stone-100 text-stone-400" aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <h3 className="mt-3 text-sm font-bold text-stone-800">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-stone-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function AdminTextLink({ to, children, className }) {
  return (
    <Link to={to} className={cn('inline-flex min-h-10 items-center gap-1 text-xs font-bold text-stone-600 no-underline hover:text-stone-950', className)}>
      {children} <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}
