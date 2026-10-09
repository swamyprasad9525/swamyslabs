import { CircleCheck, MessageSquareText, ScanLine, Shapes } from 'lucide-react';
import { Container, Section, SectionHeader } from '../ui/DesignPrimitives';

const principles = [
  { icon: Shapes, title: 'Material-focused selection', text: 'Stone is considered by surface, thickness, application and natural character.' },
  { icon: ScanLine, title: 'Finishing capability', text: 'Multiple processing options support different architectural and landscape uses.' },
  { icon: MessageSquareText, title: 'Project-led enquiries', text: 'Requirements can be discussed around area, finish, quantity and intended use.' },
  { icon: CircleCheck, title: 'Specification awareness', text: 'Natural variation and project requirements are considered before final quotation.' },
];

export default function TrustAndNotice() {
  return (
    <>
      <Section>
        <Container size="wide">
          <SectionHeader eyebrow="Why Swamy Slabs" title="A practical approach to natural material" copy="Clear material conversations, relevant processing options and project-focused support—without treating natural stone like a standardised commodity." />
          <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
            {principles.map(({ icon: Icon, title, text }) => (
              <article key={title} className="border-t border-stone-300 pt-6">
                <Icon size={22} strokeWidth={1.4} className="text-[var(--color-brand)]" aria-hidden="true" />
                <h3 className="mt-6 font-serif text-xl text-stone-950">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-stone-600">{text}</p>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      <section className="border-y border-[var(--color-border)] bg-[#d6c6ad] py-12 sm:py-16">
        <Container className="grid gap-8 md:grid-cols-[.8fr_1.2fr] md:items-center">
          <h2 className="type-display-md max-w-[12ch] text-stone-950">Every slab is naturally unique.</h2>
          <p className="text-base leading-8 text-stone-700">Variation in shade, texture, veining, fossil markings and surface character is inherent to natural stone. Samples and photographs are a guide; final material should be reviewed with its natural variation in mind.</p>
        </Container>
      </section>
    </>
  );
}
