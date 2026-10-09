import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getAllStones } from '../../lib/catalog';
import { ActionLink, Container, Reveal, Section, SectionHeader } from '../ui/DesignPrimitives';

const featured = getAllStones().filter(stone => stone.featured).slice(0, 3);

export default function FeaturedStones() {
  return (
    <Section id="materials">
      <Container size="wide">
        <div className="flex flex-col gap-7 md:flex-row md:items-end md:justify-between">
          <SectionHeader eyebrow="Selected materials" title="Explore natural stone" copy="A considered selection of limestone and natural stone surfaces for indoor, outdoor and landscape applications." />
          <ActionLink to="/stones" variant="text">View full collection <ArrowUpRight size={16} /></ActionLink>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3 lg:mt-16">
          {featured.map((stone, index) => (
            <Reveal key={stone.id} delay={index * .08}>
              <Link to={`/stones/${stone.slug}`} className="stone-card group block">
                <div className="aspect-[4/5] overflow-hidden bg-stone-200">
                  <img src={stone.images[0]} alt={`${stone.name}, ${stone.finish} natural stone`} width="800" height="1000" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]" />
                </div>
                <div className="flex items-start justify-between gap-5 pt-5">
                  <div>
                    <p className="type-eyebrow text-stone-500">{stone.materialType}</p>
                    <h3 className="mt-2 font-serif text-2xl leading-tight text-stone-950">{stone.name}</h3>
                    <p className="mt-2 text-sm text-stone-500">{stone.finish} · {stone.thickness}</p>
                  </div>
                  <span className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-stone-300 transition-colors group-hover:border-stone-950 group-hover:bg-stone-950 group-hover:text-white" aria-hidden="true"><ArrowUpRight size={17} /></span>
                </div>
                <span className="sr-only">View {stone.name}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
