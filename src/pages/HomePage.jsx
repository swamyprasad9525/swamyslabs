import SEO from '../components/SEO';
import SchemaMarkup from '../components/SchemaMarkup';
import ApplicationsSection from '../components/home/ApplicationsSection';
import CapabilitiesSection from '../components/home/CapabilitiesSection';
import CapabilityStrip from '../components/home/CapabilityStrip';
import FeaturedStones from '../components/home/FeaturedStones';
import FinalQuoteCTA from '../components/home/FinalQuoteCTA';
import HomeHero from '../components/home/HomeHero';
import MaterialStory from '../components/home/MaterialStory';
import ProjectPlanning from '../components/home/ProjectPlanning';
import TrustAndNotice from '../components/home/TrustAndNotice';

export default function HomePage() {
  return (
    <main>
      <SEO
        title="Swamy Slabs | Natural Stone Processing & Project Supply"
        description="Explore natural stone from Swamy Slabs, with shaping, cutting, polishing, honing, tumbling and calibration for architectural and project requirements."
        keywords="natural stone slabs, stone processing, stone polishing, stone honing, stone tumbling, stone calibration, limestone supplier"
      />
      <SchemaMarkup />
      <HomeHero />
      <CapabilityStrip />
      <FeaturedStones />
      <MaterialStory />
      <CapabilitiesSection />
      <ApplicationsSection />
      <ProjectPlanning />
      <TrustAndNotice />
      <FinalQuoteCTA />
    </main>
  );
}
