import { Container, Eyebrow, Reveal, Section } from '../ui/DesignPrimitives';

export default function MaterialStory() {
  return (
    <Section tone="dark" className="overflow-hidden">
      <Container size="wide" className="grid items-center gap-12 lg:grid-cols-[1.15fr_.85fr] lg:gap-20">
        <Reveal className="relative">
          <div className="aspect-[4/3] overflow-hidden bg-stone-800 lg:aspect-[6/5]">
            <img src="/about.webp" alt="Natural stone prepared at the Swamy Slabs facility" width="1536" height="2048" loading="lazy" decoding="async" className="h-full w-full object-cover grayscale-[15%]" />
          </div>
          <div className="absolute -bottom-5 right-0 max-w-[240px] bg-[var(--color-brand)] p-5 text-sm leading-6 text-white sm:right-[-18px]">Material character is preserved while dimensions and surface finish are prepared for use.</div>
        </Reveal>
        <Reveal>
          <Eyebrow className="text-[#d6a873]">Material experience</Eyebrow>
          <h2 className="type-display-lg mt-5 max-w-[10ch] text-white">From raw stone to refined surface.</h2>
          <p className="mt-7 text-base leading-8 text-stone-300">Natural stone begins with variation. Careful shaping, finishing and calibration help prepare that material for the practical demands of an architectural project—without losing the texture and character that make it distinct.</p>
          <p className="mt-5 text-base leading-8 text-stone-400">Swamy Slabs supports material selection and project enquiries across a range of finishes, thicknesses and applications.</p>
        </Reveal>
      </Container>
    </Section>
  );
}
