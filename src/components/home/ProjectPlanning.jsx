import { Check, ClipboardList, Ruler, SwatchBook } from 'lucide-react';
import { ActionLink, Container, Eyebrow, Section } from '../ui/DesignPrimitives';

const inputs = [
  { icon: Ruler, label: 'Project area' },
  { icon: SwatchBook, label: 'Stone & finish' },
  { icon: ClipboardList, label: 'Thickness & quantity' },
];

export default function ProjectPlanning() {
  return (
    <Section tone="muted">
      <Container size="wide">
        <div className="grid overflow-hidden border border-[var(--color-border-strong)] bg-[var(--color-surface)] lg:grid-cols-[.9fr_1.1fr]">
          <div className="p-7 sm:p-10 lg:p-14">
            <Eyebrow>Project planning</Eyebrow>
            <h2 className="type-display-md mt-5">Planning a stone project?</h2>
            <p className="mt-5 max-w-xl text-base leading-8 text-stone-600">Share the material, finish, thickness and approximate area you are considering. The team can help turn that brief into a project-specific discussion.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ActionLink to="/project-planner">Calculate Your Project</ActionLink>
              <ActionLink to="/stones" variant="secondary">Browse Materials</ActionLink>
            </div>
            <p className="mt-6 text-xs leading-5 text-stone-500">Planning estimates are indicative. Final material requirements and pricing are confirmed during quotation.</p>
          </div>
          <div className="bg-[#24221e] p-7 text-white sm:p-10 lg:p-14">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-[#d6a873]">A useful starting brief</p>
            <div className="mt-8 grid gap-4">
              {inputs.map(({ icon: Icon, label }, index) => (
                <div key={label} className="flex items-center gap-4 border border-white/10 bg-white/[.035] p-5">
                  <span className="grid h-10 w-10 place-items-center border border-white/15 text-[#d6a873]"><Icon size={19} strokeWidth={1.5} /></span>
                  <div className="flex-1"><p className="text-[10px] uppercase tracking-[.18em] text-stone-500">Step 0{index + 1}</p><p className="mt-1 font-medium">{label}</p></div>
                  <Check size={17} className="text-stone-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
