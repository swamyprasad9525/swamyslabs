import { Container } from '../ui/DesignPrimitives';

const processes = [
  ['Shaping', 'Stone preparation for project dimensions'],
  ['Polishing', 'A refined, smooth surface treatment'],
  ['Honing', 'A controlled low-sheen finish'],
  ['Tumbling', 'Softened edges and aged character'],
  ['Calibration', 'Consistent thickness preparation'],
];

export default function CapabilityStrip() {
  return (
    <section aria-label="Stone processing capabilities" className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <Container size="wide" className="grid sm:grid-cols-2 lg:grid-cols-5">
        {processes.map(([name, description], index) => (
          <div key={name} className="border-b border-[var(--color-border)] px-0 py-7 sm:px-6 lg:border-b-0 lg:border-r lg:last:border-r-0">
            <p className="text-[10px] font-semibold tracking-[.22em] text-[var(--color-brand)]">0{index + 1}</p>
            <h2 className="mt-2 font-serif text-xl text-stone-950">{name}</h2>
            <p className="mt-2 text-xs leading-5 text-stone-500">{description}</p>
          </div>
        ))}
      </Container>
    </section>
  );
}
