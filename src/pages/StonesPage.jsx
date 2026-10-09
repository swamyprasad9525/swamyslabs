import { useMemo, useState } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import StoneCard from '../components/stones/StoneCard';
import {
  EMPTY_FILTERS,
  FilterControls,
  MobileFilterDrawer,
  SortControl,
  countActiveFilters,
  toggleFilterValue,
} from '../components/stones/GalleryFilters';
import SEO from '../components/SEO';
import { ActionLink, Container, Eyebrow } from '../components/ui/DesignPrimitives';
import { filterStones, getAllStones, searchStones, sortStones } from '../lib/catalog';

const readValues = value => {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map(item => typeof item === 'string' ? item : item?.name || item?.label)
    .filter(Boolean);
};

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function getFilterOptions(stones) {
  return {
    materialFamily: uniqueSorted(stones.flatMap(stone => readValues(stone.materialFamily || stone.materialType))),
    color: uniqueSorted(stones.flatMap(stone => readValues(stone.color))),
    finishes: uniqueSorted(stones.flatMap(stone => readValues(stone.finishes || stone.finish))),
    applications: uniqueSorted(stones.flatMap(stone => readValues(stone.applications || stone.application))),
  };
}

const FILTER_LABELS = {
  materialFamily: 'Material',
  color: 'Color',
  finishes: 'Finish',
  applications: 'Application',
};

export default function StonesPage() {
  const stones = useMemo(() => getAllStones(), []);
  const options = useMemo(() => getFilterOptions(stones), [stones]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState('featured');

  const results = useMemo(() => {
    const searched = searchStones(stones, query);
    const filtered = filterStones(searched, filters);
    return sortStones(filtered, sortBy);
  }, [filters, query, sortBy, stones]);

  const activeFilters = Object.entries(filters).flatMap(([key, values]) => (
    values.map(value => ({ key, value, label: `${FILTER_LABELS[key]}: ${value}` }))
  ));
  const activeCount = countActiveFilters(filters);

  const clearAll = () => {
    setQuery('');
    setFilters(EMPTY_FILTERS);
    setSortBy('featured');
  };

  return (
    <main className="bg-[var(--color-background)]">
      <SEO
        title="Natural Stone Gallery"
        description="Explore Swamy Slabs natural stone materials for architectural, landscape, interior and exterior project applications."
        canonicalUrl="https://swamyslabs.vercel.app/stones"
      />

      <section className="border-b border-white/10 bg-[var(--color-ink)] py-16 text-white sm:py-20 lg:py-24">
        <Container size="wide">
          <Eyebrow className="text-[#c7935f]">Stone collection</Eyebrow>
          <h1 className="type-display-lg mt-5 max-w-5xl text-balance text-white">
            Natural Stone for Architecture and Landscape
          </h1>
          <p className="type-body-lg mt-7 max-w-2xl text-stone-300">
            Explore natural stone surfaces by material, finish and project application. Final dimensions, finish suitability and availability are confirmed during quotation.
          </p>
        </Container>
      </section>

      <section aria-labelledby="gallery-heading" className="py-12 sm:py-16 lg:py-20">
        <Container size="wide">
          <h2 id="gallery-heading" className="sr-only">Browse natural stone materials</h2>

          <div className="grid gap-4 border-b border-[var(--color-border)] pb-7 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
            <div className="relative max-w-2xl">
              <label htmlFor="stone-search" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-stone-600">
                Search materials
              </label>
              <Search size={19} className="pointer-events-none absolute bottom-3.5 left-4 text-stone-500" aria-hidden="true" />
              <input
                id="stone-search"
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search by stone, finish or application"
                className="h-12 w-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] py-3 pl-12 pr-12 text-base text-stone-950 placeholder:text-stone-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute bottom-0 right-0 grid h-12 w-12 place-items-center text-stone-600 hover:text-stone-950"
                  aria-label="Clear stone search"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="hidden lg:block">
              <SortControl value={sortBy} onChange={setSortBy} />
            </div>

            <div className="flex items-center justify-between gap-4 lg:hidden">
              <MobileFilterDrawer
                options={options}
                filters={filters}
                sortBy={sortBy}
                onApply={(nextFilters, nextSort) => {
                  setFilters(nextFilters);
                  setSortBy(nextSort);
                }}
              />
              <p className="text-sm text-stone-600" aria-live="polite">
                {results.length} {results.length === 1 ? 'stone' : 'stones'}
              </p>
            </div>
          </div>

          <div className="mt-9 grid gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[260px_minmax(0,1fr)] xl:gap-16">
            <aside className="hidden lg:block" aria-label="Filter stones">
              <div className="custom-scrollbar sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pr-3">
                <div className="mb-6 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-950">
                    Filter materials
                    {activeCount > 0 && <span className="ml-2 text-[var(--color-brand)]">({activeCount})</span>}
                  </p>
                  {activeCount > 0 && (
                    <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs font-semibold text-stone-600 underline underline-offset-4 hover:text-stone-950">
                      Clear all
                    </button>
                  )}
                </div>
                <FilterControls
                  options={options}
                  filters={filters}
                  onToggle={(key, value) => setFilters(current => toggleFilterValue(current, key, value))}
                />
              </div>
            </aside>

            <div className="min-w-0">
              <div className="hidden items-center justify-between gap-5 lg:flex">
                <p className="text-sm text-stone-600" aria-live="polite">
                  Showing <strong className="font-semibold text-stone-950">{results.length}</strong> of {stones.length} {stones.length === 1 ? 'stone' : 'stones'}
                </p>
              </div>

              {(query || activeFilters.length > 0) && (
                <div className="mt-5 flex flex-wrap items-center gap-2 lg:mt-6" aria-label="Active filters">
                  {query && (
                    <button type="button" onClick={() => setQuery('')} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-300 bg-[var(--color-surface)] px-3 text-xs text-stone-700 hover:border-stone-500">
                      Search: “{query.trim()}” <X size={14} aria-hidden="true" />
                    </button>
                  )}
                  {activeFilters.map(filter => (
                    <button
                      key={`${filter.key}-${filter.value}`}
                      type="button"
                      onClick={() => setFilters(current => toggleFilterValue(current, filter.key, filter.value))}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-300 bg-[var(--color-surface)] px-3 text-xs text-stone-700 hover:border-stone-500"
                      aria-label={`Remove ${filter.label} filter`}
                    >
                      {filter.label} <X size={14} aria-hidden="true" />
                    </button>
                  ))}
                  <button type="button" onClick={clearAll} className="min-h-10 px-2 text-xs font-semibold text-stone-700 underline underline-offset-4 hover:text-stone-950">
                    Clear all
                  </button>
                </div>
              )}

              {results.length > 0 ? (
                <div className="mt-8 grid grid-cols-1 gap-x-5 gap-y-12 sm:grid-cols-2 xl:grid-cols-3 xl:gap-x-7 xl:gap-y-16">
                  {results.map((stone, index) => (
                    <StoneCard key={stone.id} stone={stone} imageLoading={index === 0 ? 'eager' : 'lazy'} />
                  ))}
                </div>
              ) : (
                <div className="mt-8 border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center sm:px-12 sm:py-20" role="status">
                  <p className="type-eyebrow text-[var(--color-brand)]">No results</p>
                  <h3 className="mt-4 font-serif text-3xl text-stone-950 sm:text-4xl">No stones match your current selection.</h3>
                  <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-600">
                    Clear the current search and filters, or speak with us about a material for your project.
                  </p>
                  <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <button type="button" onClick={clearAll} className="action-link border-[var(--color-brand)] bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]">
                      Clear filters
                    </button>
                    <ActionLink to="/contact?intent=quote" variant="secondary">Talk to an expert</ActionLink>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Container>
      </section>

      <section className="bg-[var(--color-ink)] py-16 text-white sm:py-20">
        <Container size="wide" className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Eyebrow className="text-[#c7935f]">Project-specific selection</Eyebrow>
            <h2 className="type-display-md mt-4 text-white">Need help selecting the right stone?</h2>
            <p className="type-body-lg mt-5 max-w-2xl text-stone-300">
              Share your application, preferred finish and project location. Our team can help confirm suitable materials and quotation details.
            </p>
          </div>
          <ActionLink to="/contact?intent=quote" variant="inverse" className="shrink-0">
            Request a quote <ArrowRight size={16} aria-hidden="true" />
          </ActionLink>
        </Container>
      </section>
    </main>
  );
}
