import { ArrowUpRight, MessageCircle } from 'lucide-react';
import { ActionLink, Container, Eyebrow } from '../ui/DesignPrimitives';

export default function FinalQuoteCTA() {
  return (
    <section className="relative overflow-hidden bg-stone-950 py-20 text-white sm:py-24 lg:py-32">
      <img src="/kadappa-stone-slab.webp" alt="" width="1200" height="800" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-25" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(12,11,10,.96),rgba(12,11,10,.62))]" />
      <Container size="wide" className="relative">
        <Eyebrow className="text-[#d6a873]">Start a project conversation</Eyebrow>
        <h2 className="type-display-lg mt-5 max-w-3xl text-white">Planning your next stone project?</h2>
        <p className="mt-6 max-w-2xl text-base leading-8 text-stone-300">Let Swamy Slabs help identify a suitable material, finish and quantity for your requirements.</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <ActionLink to="/contact?intent=quote" className="gap-2">Request Quote <ArrowUpRight size={17} /></ActionLink>
          <ActionLink href="https://wa.me/919381260584?text=Hi%2C%20I%20would%20like%20to%20discuss%20a%20stone%20project." variant="inverse" target="_blank" rel="noopener noreferrer" className="gap-2"><MessageCircle size={17} /> WhatsApp</ActionLink>
        </div>
      </Container>
    </section>
  );
}
