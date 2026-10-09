import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { ActionLink, Container } from '../ui/DesignPrimitives';

const capabilities = ['Shaping', 'Cutting', 'Polishing', 'Honing', 'Tumbling', 'Calibration'];

export default function PublicFooter() {
  return (
    <footer className="bg-[#171613] text-stone-300">
      <Container size="wide" className="py-16 lg:py-20">
        <div className="grid gap-12 border-b border-white/10 pb-14 lg:grid-cols-[1.35fr_.7fr_.8fr_1fr]">
          <div>
            <Link to="/" className="font-serif text-2xl font-semibold tracking-tight text-white">SWAMY SLABS</Link>
            <p className="mt-5 max-w-sm text-sm leading-7 text-stone-400">Natural stone selection, surface finishing and project-focused material preparation for architectural applications.</p>
            <ActionLink to="/contact?intent=quote" variant="inverse" className="mt-7">Request Quote <ArrowUpRight size={16} /></ActionLink>
          </div>
          <div>
            <h2 className="footer-heading">Explore</h2>
            <ul className="footer-links">
              <li><Link to="/">Home</Link></li>
              <li><Link to="/stones">Stones</Link></li>
              <li><Link to="/about">About</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="footer-heading">Capabilities</h2>
            <ul className="footer-links">
              {capabilities.map(item => <li key={item}><Link to="/#capabilities">{item}</Link></li>)}
            </ul>
          </div>
          <div>
            <h2 className="footer-heading">Start a conversation</h2>
            <ul className="footer-links">
              <li><a href="tel:+919381260584">+91 93812 60584</a></li>
              <li><a href="mailto:kolliswami784@gmail.com">kolliswami784@gmail.com</a></li>
              <li><a href="https://wa.me/919381260584?text=Hi%2C%20I%20would%20like%20to%20discuss%20a%20stone%20project." target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
            </ul>
          </div>
        </div>
        <div className="flex flex-col gap-3 pt-7 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Swamy Slabs. All rights reserved.</p>
          <p>Natural stone · Surface finishing · Project supply</p>
        </div>
      </Container>
    </footer>
  );
}
