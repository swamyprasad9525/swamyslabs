import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Container, Section, SectionHeader } from '../ui/DesignPrimitives';

const applications = [
  { title: 'Flooring', image: '/tandur-yellow-limestone-french-opus.webp', position: 'center' },
  { title: 'Wall cladding', image: '/t-grey-sandstone.webp', position: 'center' },
  { title: 'Outdoor areas', image: '/kadappa-black-limestone-french-opus.webp', position: 'center' },
  { title: 'Landscaping', image: '/napa-slabs-tumbled.webp', position: 'center' },
  { title: 'Pool surrounds', image: '/tandur-yellow-pool-coping.webp', position: 'center' },
  { title: 'Commercial projects', image: '/ash-grey-machine-cut.webp', position: 'center' },
];

export default function ApplicationsSection() {
  return (
    <Section id="applications">
      <Container size="wide">
        <SectionHeader eyebrow="Applications" title="Stone for spaces that need substance" copy="Explore material directions for architectural, landscape and project environments." />
        <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-3 lg:mt-16 lg:gap-5">
          {applications.map((application, index) => (
            <Link key={application.title} to="/stones" className={`application-tile group relative overflow-hidden ${index === 0 || index === 5 ? 'md:col-span-2' : ''}`}>
              <img src={application.image} alt="" width="900" height="700" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.035]" style={{ objectPosition: application.position }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-5 text-white sm:p-7">
                <h3 className="font-serif text-xl sm:text-2xl">{application.title}</h3>
                <ArrowUpRight size={18} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </Section>
  );
}
