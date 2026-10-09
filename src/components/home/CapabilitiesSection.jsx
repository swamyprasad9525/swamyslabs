import { Gem, Layers3, Maximize2, ScanLine, Sparkles, Waves } from 'lucide-react';
import { Container, Reveal, Section, SectionHeader } from '../ui/DesignPrimitives';

const capabilities = [
  { icon: Maximize2, name: 'Shaping', description: 'Stone preparation for required forms, edges and project dimensions.' },
  { icon: ScanLine, name: 'Cutting', description: 'Material cutting and sizing for planned architectural applications.' },
  { icon: Sparkles, name: 'Polishing', description: 'Surface refinement that brings out colour, depth and a smooth sheen.' },
  { icon: Layers3, name: 'Honing', description: 'A controlled, lower-sheen surface with a clean architectural character.' },
  { icon: Waves, name: 'Tumbling', description: 'A softened finish that adds aged texture and gently worked edges.' },
  { icon: Gem, name: 'Calibration', description: 'Thickness preparation for more consistent installation and handling.' },
];

export default function CapabilitiesSection() {
  return (
    <Section id="capabilities" tone="muted">
      <Container size="wide">
        <SectionHeader eyebrow="Processing capabilities" title="Surface, shape and consistency" copy="A practical finishing range for turning natural material into stone prepared for project use." />
        <div className="mt-12 grid border-l border-t border-[var(--color-border-strong)] sm:grid-cols-2 lg:mt-16 lg:grid-cols-3">
          {capabilities.map(({ icon: Icon, name, description }, index) => (
            <Reveal key={name} delay={(index % 3) * .05} className="border-b border-r border-[var(--color-border-strong)] bg-[var(--color-surface)] p-7 sm:p-8 lg:p-10">
              <div className="flex items-center justify-between">
                <Icon size={23} strokeWidth={1.4} className="text-[var(--color-brand)]" aria-hidden="true" />
                <span className="text-xs tracking-[.18em] text-stone-400">0{index + 1}</span>
              </div>
              <h3 className="mt-10 font-serif text-2xl text-stone-950">{name}</h3>
              <p className="mt-3 text-sm leading-7 text-stone-600">{description}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
