import { ArrowDown, MessageCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { ActionLink, Container, Eyebrow } from '../ui/DesignPrimitives';

export default function HomeHero() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { opacity: 0, y: 16 };

  return (
    <section className="relative min-h-[760px] overflow-hidden bg-stone-950 text-white md:min-h-[820px]" aria-labelledby="home-hero-title">
      <img src="/main.webp" alt="Dark natural stone slabs with textured finished surfaces" width="1536" height="2048" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover object-[64%_50%] opacity-80" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(13,12,10,.92)_0%,rgba(13,12,10,.72)_42%,rgba(13,12,10,.15)_78%),linear-gradient(0deg,rgba(13,12,10,.72)_0%,transparent_42%)]" />
      <div className="absolute inset-0 opacity-[.12] [background-image:linear-gradient(rgba(255,255,255,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.14)_1px,transparent_1px)] [background-size:80px_80px]" aria-hidden="true" />

      <Container size="wide" className="relative flex min-h-[760px] items-end pb-16 pt-32 md:min-h-[820px] md:items-center md:pb-20 md:pt-36">
        <div className="min-w-0 w-full max-w-4xl">
          <motion.div initial={initial} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
            <Eyebrow className="text-[#d6a873]">Natural stone · Precision processed</Eyebrow>
          </motion.div>
          <motion.h1 id="home-hero-title" initial={initial} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, delay: .08 }} className="type-display-xl mt-6 max-w-[12ch] text-white">
            Stone, finished with precision.
          </motion.h1>
          <motion.p initial={initial} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, delay: .16 }} className="mt-7 max-w-2xl text-base leading-8 text-stone-200 sm:text-lg">
            Natural stone selection, shaping and surface finishing for architectural spaces, landscape applications and project material supply.
          </motion.p>
          <motion.div initial={initial} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, delay: .24 }} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ActionLink to="/contact?intent=quote">Request Quote</ActionLink>
            <ActionLink to="/stones" variant="inverse">Explore Stones</ActionLink>
            <a href="https://wa.me/919381260584?text=Hi%2C%20I%20would%20like%20to%20discuss%20a%20stone%20project." target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold text-stone-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
              <MessageCircle size={17} /> Talk on WhatsApp
            </a>
          </motion.div>
        </div>

        <a href="#materials" className="absolute bottom-8 right-5 hidden items-center gap-3 text-xs font-semibold uppercase tracking-[.2em] text-stone-300 hover:text-white md:flex lg:right-8">
          Discover materials <ArrowDown size={16} />
        </a>
      </Container>
    </section>
  );
}
