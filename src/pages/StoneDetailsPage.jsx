import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronRight,
  FolderCheck,
  FolderPlus,
  MessageCircle,
} from 'lucide-react';
import MaterialMediaViewer from '../components/stones/MaterialMediaViewer';
import StoneCard from '../components/stones/StoneCard';
import EnquiryForm from '../components/EnquiryForm';
import SEO from '../components/SEO';
import { ActionLink, Container, Eyebrow, Reveal, Section, SectionHeader } from '../components/ui/DesignPrimitives';
import { useCart } from '../context/CartContext';
import { getRelatedStones, getStoneBySlug } from '../lib/catalog';

const SITE_URL = 'https://swamyslabs.vercel.app';

const toArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value == null || value === '' ? [] : [value];
};

const toAbsoluteUrl = (path) => {
  if (!path) return null;
  try {
    return new URL(path, SITE_URL).toString();
  } catch {
    return null;
  }
};

const formatLabel = (value) => String(value)
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatValue = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null) return '';
  return String(value).trim();
};

function buildSpecifications(stone) {
  const baseSpecifications = [
    ['Material', stone.materialFamily || stone.materialType || stone.category],
    ['Color', stone.color],
    ['Finish', stone.finishes],
    ['Thickness', stone.thicknesses],
    ['Dimensions', stone.dimensions],
    ['Origin', stone.origin],
  ];

  const technicalSpecifications = Object.entries(stone.technicalSpecifications || {})
    .map(([label, value]) => [formatLabel(label), value]);

  return [...baseSpecifications, ...technicalSpecifications]
    .map(([label, value]) => ({ label, value: formatValue(value) }))
    .filter((specification) => specification.value);
}

function buildStructuredData(stone, canonicalUrl, specifications) {
  const image = stone.images.map(toAbsoluteUrl).filter(Boolean);
  const additionalProperty = specifications.map(({ label, value }) => ({
    '@type': 'PropertyValue',
    name: label,
    value,
  }));

  const product = {
    '@type': 'Product',
    '@id': `${canonicalUrl}#material`,
    name: stone.name,
    url: canonicalUrl,
    productID: stone.id || undefined,
    description: stone.shortDescription || stone.description || undefined,
    image: image.length ? image : undefined,
    category: stone.materialFamily || stone.materialType || stone.category || undefined,
    additionalProperty: additionalProperty.length ? additionalProperty : undefined,
  };

  const breadcrumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Stones',
        item: `${SITE_URL}/stones`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: stone.name,
        item: canonicalUrl,
      },
    ],
  };

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [product, breadcrumbs],
  }).replace(/</g, '\\u003c');
}

function MissingStone() {
  return (
    <main>
      <SEO
        title="Stone not found"
        description="The requested natural stone could not be found in the Swamy Slabs digital stone gallery."
        noIndex
      />
      <Section>
        <Container size="narrow" className="text-center">
          <Eyebrow>Material not found</Eyebrow>
          <h1 className="type-display-md mt-5">This stone is not in the current gallery.</h1>
          <p className="type-body-lg mx-auto mt-6 max-w-xl text-[var(--color-text-secondary)]">
            The link may be outdated, or the material may no longer be listed under this address.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <ActionLink to="/stones">Browse stones <ArrowRight size={16} aria-hidden="true" /></ActionLink>
            <ActionLink to="/contact?intent=quote" variant="secondary">Request assistance</ActionLink>
          </div>
        </Container>
      </Section>
    </main>
  );
}

export default function StoneDetailsPage() {
  const { slug } = useParams();
  const stone = getStoneBySlug(slug);
  const { addToCart, cartItems, setIsCartOpen } = useCart();
  const [isEnquiryOpen, setIsEnquiryOpen] = useState(false);

  const specifications = useMemo(() => stone ? buildSpecifications(stone) : [], [stone]);
  const relatedStones = useMemo(() => stone ? getRelatedStones(stone, 4) : [], [stone]);

  if (!stone) return <MissingStone />;

  const material = stone.materialFamily || stone.materialType || stone.category;
  const finishes = toArray(stone.finishes);
  const applications = toArray(stone.applications);
  const features = toArray(stone.features);
  const canonicalUrl = `${SITE_URL}/stones/${stone.slug}`;
  const description = stone.seo?.description || stone.shortDescription || stone.description
    || `Explore ${stone.name} in the Swamy Slabs digital stone gallery.`;
  const socialImage = toAbsoluteUrl(stone.images[0]);
  const isSelected = cartItems.some((item) => String(item.id ?? item.stoneId) === String(stone.id));
  const structuredData = buildStructuredData(stone, canonicalUrl, specifications);

  const enquiryProduct = {
    ...stone,
    stoneId: stone.id,
    canonicalPath: `/stones/${stone.slug}`,
    canonicalUrl,
    materialType: stone.materialFamily || stone.materialType || '',
    finish: finishes.length === 1 ? finishes[0] : stone.finish || '',
    thickness: stone.thicknesses.length === 1 ? stone.thicknesses[0] : stone.thickness || '',
    quantity: '',
    crmSource: 'STONE_ENQUIRY',
  };

  const whatsappLines = [
    'Hello Swamy Slabs,',
    '',
    "I'm interested in:",
    stone.name,
  ];
  if (finishes.length) whatsappLines.push('', `Known finish: ${finishes.join(', ')}`);
  whatsappLines.push('', `Product: ${canonicalUrl}`, '', 'Please share quotation and availability details.');
  const whatsappUrl = `https://wa.me/919381260584?text=${encodeURIComponent(whatsappLines.join('\n'))}`;

  const handleProjectSelection = () => {
    if (isSelected) {
      setIsCartOpen(true);
      return;
    }

    addToCart({
      id: stone.id,
      stoneId: stone.id,
      slug: stone.slug,
      name: stone.name,
      image: stone.images[0] || null,
      materialFamily: stone.materialFamily,
      category: material,
      finish: stone.finish || finishes[0] || null,
      thickness: stone.thickness || stone.thicknesses[0] || null,
      quantity: 1,
    });
  };

  return (
    <main className="bg-[var(--color-background)]">
      <SEO
        title={stone.seo?.title || `${stone.name} | Natural Stone`}
        description={description}
        canonicalUrl={canonicalUrl}
        ogImage={socialImage || undefined}
      />
      <Helmet>
        <meta property="og:type" content="product" />
        <script type="application/ld+json">{structuredData}</script>
      </Helmet>

      <Container size="wide" className="pt-7 sm:pt-9">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-stone-500">
            <li><Link to="/" className="inline-flex items-center hover:text-stone-950">Home</Link></li>
            <li aria-hidden="true"><ChevronRight size={14} /></li>
            <li><Link to="/stones" className="inline-flex items-center hover:text-stone-950">Stones</Link></li>
            <li aria-hidden="true"><ChevronRight size={14} /></li>
            <li className="max-w-full truncate text-stone-800" aria-current="page">{stone.name}</li>
          </ol>
        </nav>
      </Container>

      <Section className="!pt-8 sm:!pt-10">
        <Container size="wide">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,.72fr)] lg:gap-16 xl:gap-24">
            <Reveal>
              <MaterialMediaViewer images={stone.images} materialName={stone.name} />
            </Reveal>

            <div className="lg:sticky lg:top-28">
              {material && <Eyebrow>{material}</Eyebrow>}
              <h1 className="type-display-md mt-4 text-balance">{stone.name}</h1>
              {(stone.shortDescription || stone.description) && (
                <p className="type-body-lg mt-6 max-w-2xl text-[var(--color-text-secondary)]">
                  {stone.shortDescription || stone.description}
                </p>
              )}

              <div className="mt-8 border-y border-[var(--color-border)] py-6">
                <p className="text-sm leading-6 text-stone-600">
                  Final finish, dimensions, quantity and availability are confirmed for each project during quotation.
                </p>
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                <ActionLink to={`/project-planner?stone=${encodeURIComponent(stone.slug)}`}>
                  Plan This Stone <ArrowRight size={16} aria-hidden="true" />
                </ActionLink>
                <button
                  type="button"
                  onClick={handleProjectSelection}
                  className="action-link border-current bg-transparent text-current hover:bg-stone-900 hover:text-white"
                >
                  {isSelected ? <FolderCheck size={17} aria-hidden="true" /> : <FolderPlus size={17} aria-hidden="true" />}
                  {isSelected ? 'Review Project' : 'Add to Project'}
                </button>
              </div>

              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 border border-[var(--color-border-strong)] px-5 text-xs font-semibold uppercase tracking-[.12em] text-stone-800 transition-colors hover:border-stone-950 hover:bg-stone-950 hover:text-white"
              >
                <MessageCircle size={17} aria-hidden="true" /> Ask about this stone on WhatsApp
              </a>
            </div>
          </div>
        </Container>
      </Section>

      {specifications.length > 0 && (
        <Section tone="muted">
          <Container size="wide">
            <div className="grid gap-10 lg:grid-cols-[.65fr_1.35fr] lg:gap-20">
              <SectionHeader
                eyebrow="Material sheet"
                title="Known specifications"
                copy="Only information currently recorded for this material is shown. Project-specific requirements are confirmed during quotation."
              />
              <dl className="border-t border-[var(--color-border-strong)]">
                {specifications.map(({ label, value }) => (
                  <div key={label} className="grid gap-2 border-b border-[var(--color-border-strong)] py-5 sm:grid-cols-[minmax(120px,.7fr)_1.3fr] sm:gap-8">
                    <dt className="text-xs font-semibold uppercase tracking-[.14em] text-stone-500">{label}</dt>
                    <dd className="text-sm leading-7 text-stone-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Container>
        </Section>
      )}

      {(finishes.length > 0 || applications.length > 0 || features.length > 0) && (
        <Section>
          <Container size="wide">
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
              {finishes.length > 0 && (
                <Reveal>
                  <Eyebrow>Recorded finish</Eyebrow>
                  <h2 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">Surface presentation</h2>
                  <div className="mt-7 flex flex-wrap gap-3">
                    {finishes.map((finish) => (
                      <span key={finish} className="inline-flex min-h-11 items-center border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 text-sm text-stone-800">
                        {finish}
                      </span>
                    ))}
                  </div>
                  <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--color-text-secondary)]">
                    Finish availability and any additional processing requirements are confirmed during quotation.
                  </p>
                </Reveal>
              )}

              {applications.length > 0 && (
                <Reveal delay={0.08}>
                  <Eyebrow>Recorded applications</Eyebrow>
                  <h2 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">Project contexts</h2>
                  <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                    {applications.map((application) => (
                      <li key={application} className="flex min-h-14 items-center gap-3 border-b border-[var(--color-border)] py-3 text-sm text-stone-800">
                        <Check size={16} className="shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
                        {application}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}

              {features.length > 0 && (
                <Reveal>
                  <Eyebrow>Recorded characteristics</Eyebrow>
                  <h2 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">Material characteristics</h2>
                  <ul className="mt-7 space-y-3">
                    {features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm leading-7 text-stone-700">
                        <Check size={16} className="mt-1.5 shrink-0 text-[var(--color-brand)]" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}
            </div>
          </Container>
        </Section>
      )}

      {stone.description && stone.description !== stone.shortDescription && (
        <Section tone="muted">
          <Container size="narrow">
            <SectionHeader eyebrow="Material overview" title={`About ${stone.name}`} />
            <p className="type-body-lg mt-7 text-[var(--color-text-secondary)]">{stone.description}</p>
          </Container>
        </Section>
      )}

      <Section tone="dark">
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr] lg:items-start lg:gap-24">
            <div>
              <Eyebrow className="text-[#d4a578]">Natural material notice</Eyebrow>
              <h2 className="mt-4 font-serif text-4xl leading-tight text-white sm:text-5xl">Naturally unique.</h2>
            </div>
            <div>
              <p className="type-body-lg max-w-3xl text-stone-300">
                Natural stone can vary in tone, pattern, marking, veining and surface character. Differences can occur between individual pieces and material batches; current material should be reviewed as part of project confirmation.
              </p>
              <p className="mt-6 text-sm leading-7 text-stone-400">
                Final dimensions, finish and material availability are confirmed during quotation.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {relatedStones.length > 0 && (
        <Section>
          <Container size="wide">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeader
                eyebrow="Continue exploring"
                title="Related stones"
                copy="Materials selected deterministically by shared material family and recorded project applications."
              />
              <ActionLink to="/stones" variant="text">View all stones <ArrowRight size={16} aria-hidden="true" /></ActionLink>
            </div>
            <div className="mt-12 grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {relatedStones.map((relatedStone) => (
                <StoneCard key={relatedStone.id} stone={relatedStone} headingLevel={3} />
              ))}
            </div>
          </Container>
        </Section>
      )}

      <Section tone="muted">
        <Container size="narrow" className="text-center">
          <Eyebrow>Plan with the material</Eyebrow>
          <h2 className="type-display-md mt-5">Discuss {stone.name} for your project.</h2>
          <p className="type-body-lg mx-auto mt-6 max-w-2xl text-[var(--color-text-secondary)]">
            Share the application, destination, required area and any processing requirements. The team can then confirm the appropriate material details during quotation.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setIsEnquiryOpen(true)}
              className="action-link border-[var(--color-brand)] bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]"
            >
              Request Quote <ArrowRight size={16} aria-hidden="true" />
            </button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="action-link border-current bg-transparent text-current hover:bg-stone-900 hover:text-white"
            >
              WhatsApp Enquiry <MessageCircle size={16} aria-hidden="true" />
            </a>
          </div>
        </Container>
      </Section>

      <EnquiryForm
        isOpen={isEnquiryOpen}
        onClose={() => setIsEnquiryOpen(false)}
        product={enquiryProduct}
      />
    </main>
  );
}
