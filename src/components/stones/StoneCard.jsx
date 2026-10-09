import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

function firstLabel(value) {
  const item = Array.isArray(value) ? value[0] : value;
  if (typeof item === 'string') return item;
  return item?.name || item?.label || '';
}

export default function StoneCard({ stone, imageLoading = 'lazy', headingLevel = 2 }) {
  const image = stone.images?.[0];
  const material = stone.materialFamily || stone.materialType || stone.category;
  const finish = firstLabel(stone.finishes) || firstLabel(stone.finish);
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <article className="group min-w-0 border-b border-[var(--color-border)] pb-6">
      <Link
        to={`/stones/${stone.slug}`}
        className="block min-w-0"
        aria-label={`Explore ${stone.name}`}
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-stone-200">
          {image ? (
            <img
              src={image}
              alt={`${stone.name}${material ? `, ${material}` : ''} natural stone surface`}
              width="800"
              height="1000"
              loading={imageLoading}
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 ease-out motion-reduce:transition-none group-hover:scale-[1.035]"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-stone-500">
              Material photography pending
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-stone-950/15 via-transparent to-transparent opacity-0 transition-opacity duration-300 motion-reduce:transition-none group-hover:opacity-100" />
        </div>

        <div className="flex min-w-0 items-start justify-between gap-4 pt-5">
          <div className="min-w-0">
            {material && <p className="type-eyebrow text-[var(--color-brand)]">{material}</p>}
            <Heading className="mt-2 text-balance font-serif text-2xl leading-tight text-[var(--color-text-primary)]">
              {stone.name}
            </Heading>
            {finish && <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">{finish}</p>}
          </div>
          <span
            className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-stone-700 transition-colors duration-200 group-hover:border-stone-950 group-hover:bg-stone-950 group-hover:text-white"
            aria-hidden="true"
          >
            <ArrowUpRight size={17} />
          </span>
        </div>
        <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-700">
          Explore stone
          <ArrowUpRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </span>
      </Link>
    </article>
  );
}
