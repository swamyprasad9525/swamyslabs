import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, SlidersHorizontal, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export const EMPTY_FILTERS = Object.freeze({
  materialFamily: [],
  color: [],
  finishes: [],
  applications: [],
});

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
];

export function countActiveFilters(filters) {
  return Object.values(filters).reduce((total, values) => total + values.length, 0);
}

export function toggleFilterValue(filters, key, value) {
  const current = filters[key] || [];
  const values = current.includes(value)
    ? current.filter(item => item !== value)
    : [...current, value];
  return { ...filters, [key]: values };
}

const GROUP_LABELS = {
  materialFamily: 'Material type',
  color: 'Color',
  finishes: 'Finish',
  applications: 'Application',
};

function FilterGroup({ groupKey, options, selected, onToggle, idPrefix }) {
  if (options.length < 2) return null;

  return (
    <fieldset className="border-t border-[var(--color-border)] py-6 first:border-t-0 first:pt-0">
      <legend className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-stone-950">
        {GROUP_LABELS[groupKey]}
      </legend>
      <div className="grid gap-2.5">
        {options.map((option, index) => {
          const checked = selected.includes(option);
          const id = `${idPrefix}-${groupKey}-${index}-${option.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          return (
            <label key={option} htmlFor={id} className="group flex min-h-11 cursor-pointer items-center gap-3 text-sm text-stone-700">
              <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(groupKey, option)}
                className="peer sr-only"
              />
              <span className={cn(
                'grid h-5 w-5 shrink-0 place-items-center border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-brand)]',
                checked
                  ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white'
                  : 'border-stone-400 bg-transparent group-hover:border-stone-700',
              )} aria-hidden="true">
                {checked && <Check size={13} strokeWidth={2.5} />}
              </span>
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FilterControls({ options, filters, onToggle, idPrefix = 'filter' }) {
  return (
    <div>
      {Object.keys(GROUP_LABELS).map(groupKey => (
        <FilterGroup
          key={groupKey}
          groupKey={groupKey}
          options={options[groupKey] || []}
          selected={filters[groupKey] || []}
          onToggle={onToggle}
          idPrefix={idPrefix}
        />
      ))}
    </div>
  );
}

export function SortControl({ value, onChange, id = 'gallery-sort' }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">
        Sort by
      </label>
      <select
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-12 w-full min-w-0 border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm text-stone-900"
      >
        {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

export function MobileFilterDrawer({ options, filters, sortBy, onApply }) {
  const [open, setOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(filters);
  const [draftSort, setDraftSort] = useState(sortBy);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const activeCount = countActiveFilters(filters);

  const openDrawer = () => {
    setDraftFilters(filters);
    setDraftSort(sortBy);
    setOpen(true);
  };

  const closeDrawer = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const applyFilters = () => {
    onApply(draftFilters, draftSort);
    closeDrawer();
  };

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDrawer, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDrawer}
        aria-haspopup="dialog"
        className="inline-flex h-12 items-center justify-center gap-2 border border-stone-950 px-4 text-xs font-semibold uppercase tracking-[0.13em] text-stone-950 lg:hidden"
      >
        <SlidersHorizontal size={17} aria-hidden="true" />
        Filter &amp; Sort
        {activeCount > 0 && (
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-stone-950 px-1.5 text-[11px] text-white" aria-label={`${activeCount} active filters`}>
            {activeCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default bg-stone-950/55 backdrop-blur-[2px]"
            onClick={closeDrawer}
            aria-label="Close filter and sort drawer"
          />
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-filter-title"
            className="absolute inset-y-0 right-0 flex w-[min(92vw,420px)] flex-col bg-[var(--color-background)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <p className="type-eyebrow text-[var(--color-brand)]">Refine gallery</p>
                <h2 id="mobile-filter-title" className="mt-1 font-serif text-2xl text-stone-950">Filter &amp; Sort</h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={closeDrawer}
                className="grid h-11 w-11 place-items-center rounded-full border border-stone-300 text-stone-800"
                aria-label="Close filter and sort drawer"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-6">
              <SortControl id="mobile-gallery-sort" value={draftSort} onChange={setDraftSort} />
              <div className="mt-7">
                <FilterControls
                  options={options}
                  filters={draftFilters}
                  onToggle={(key, value) => setDraftFilters(current => toggleFilterValue(current, key, value))}
                  idPrefix="mobile-filter"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <button
                type="button"
                onClick={() => {
                  setDraftFilters(EMPTY_FILTERS);
                  setDraftSort('featured');
                }}
                className="h-12 border border-stone-400 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-stone-900"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="h-12 bg-[var(--color-brand)] px-3 text-xs font-semibold uppercase tracking-[0.12em] text-white hover:bg-[var(--color-brand-hover)]"
              >
                Apply filters
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
