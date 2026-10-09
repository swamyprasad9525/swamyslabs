import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Info, Ruler, SwatchBook } from 'lucide-react';
import EnquiryForm from '../components/EnquiryForm';
import MaterialPreview from '../components/planner/MaterialPreview';
import PlannerSummary from '../components/planner/PlannerSummary';
import SEO from '../components/SEO';
import { Container, Eyebrow, Section } from '../components/ui/DesignPrimitives';
import { getAllStones, getStoneBySlug } from '../lib/catalog';
import {
  MAX_PLANNING_ALLOWANCE_PERCENT,
  MAX_PROJECT_AREA_SQ_FT,
  calculateEstimatedSlabCount,
  calculateMaterialEstimate,
  calculatePlanningAllowance,
  calculateRequiredArea,
  calculateSlabArea,
  normalizePlannerState,
  roundForDisplay,
  validateEstimatorInput,
} from '../lib/projectEstimator';

const STORAGE_KEY = 'swamy-slabs:project-planner:v1';
const WHATSAPP_NUMBER = '919381260584';
const catalog = getAllStones();

const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const hasInput = (value) => String(value ?? '').trim() !== '';

const formatNumber = (value) => {
  const rounded = roundForDisplay(value, 2);
  return rounded === null ? null : numberFormatter.format(rounded);
};

const formatCurrency = (value) => (
  Number.isFinite(value) ? currencyFormatter.format(value) : null
);

const supportsSquareFootPrice = (stone) => {
  const unit = String(stone?.priceUnit || '').toLowerCase().replace(/[.\s_-]/g, '');
  return unit === 'sqft' || unit === 'squarefoot' || unit === 'squarefeet';
};

const inferPreviewMode = (application = '') => {
  const value = application.toLowerCase();
  if (/wall|cladding|panel|accent/.test(value)) return 'wall';
  if (/landscap|garden|step|entrance|structural|feature/.test(value)) return 'landscape';
  if (/outdoor|patio|terrace|pav|parking|path|driveway|pool|edging|walkway/.test(value)) return 'outdoor';
  return 'floor';
};

const editableState = (state) => ({
  ...state,
  stoneSlug: state.stoneSlug || '',
  finish: state.finish || '',
  thickness: state.thickness || '',
  application: state.application || '',
  projectArea: state.projectArea == null ? '' : String(state.projectArea),
  length: state.length == null ? '' : String(state.length),
  width: state.width == null ? '' : String(state.width),
  wastePercent: String(state.wastePercent),
  previewMode: state.previewMode || 'floor',
});

const reconcileStoneFields = (state, stone, reset = false) => {
  const choose = (current, values) => (
    !reset && values.includes(current) ? current : (values[0] || '')
  );
  const application = choose(state.application, stone?.applications || []);

  return {
    ...state,
    stoneSlug: stone?.slug || '',
    finish: choose(state.finish, stone?.finishes || []),
    thickness: choose(state.thickness, stone?.thicknesses || []),
    application,
    previewMode: reset ? inferPreviewMode(application) : (state.previewMode || inferPreviewMode(application)),
  };
};

const readStoredState = () => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return normalizePlannerState(stored ? JSON.parse(stored) : {});
  } catch {
    return normalizePlannerState({});
  }
};

const getVerifiedSlabArea = (stone) => {
  const dimensions = stone?.slabDimensions;
  if (!dimensions || dimensions.verified !== true) return null;

  if (Number.isFinite(dimensions.usableAreaSqFt) && dimensions.usableAreaSqFt > 0) {
    return dimensions.usableAreaSqFt;
  }

  return calculateSlabArea(dimensions.length, dimensions.width, dimensions.unit);
};

function StepHeading({ number, title, icon, description }) {
  const StepIcon = icon;

  return (
    <div className="flex gap-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center border border-[var(--color-border-strong)] bg-stone-100 text-[var(--color-brand)]">
        <StepIcon size={18} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-stone-500">Step {number}</p>
        <h2 className="mt-1 font-serif text-2xl text-stone-950">{title}</h2>
        {description && <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>}
      </div>
    </div>
  );
}

function ChoiceGroup({ legend, values, selected, onChange, emptyMessage }) {
  if (!values.length) {
    return (
      <div className="border border-dashed border-stone-300 bg-stone-100/70 p-4 text-sm leading-6 text-stone-600">
        {emptyMessage}
      </div>
    );
  }

  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {values.map((value) => (
          <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-3 text-sm transition-colors ${selected === value ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-300 bg-white text-stone-800 hover:border-stone-600'}`}>
            <input
              type="radio"
              name={legend}
              value={value}
              checked={selected === value}
              onChange={() => onChange(value)}
              className="h-4 w-4 shrink-0 accent-[var(--color-brand)]"
            />
            <span>{value}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function buildPlannerContext({
  stone,
  finish,
  thickness,
  application,
  enteredArea,
  projectAreaSqFt,
  wastePercent,
  requiredAreaSqFt,
  estimatedSlabs,
  materialEstimate,
  sourcePath,
}) {
  if (!stone || !requiredAreaSqFt) return '';

  const lines = [
    'Stone project planner summary',
    `Stone: ${stone.name}`,
    `Stone ID: ${stone.id}`,
    `Stone slug: ${stone.slug}`,
  ];
  if (finish) lines.push(`Finish: ${finish}`);
  if (thickness) lines.push(`Thickness: ${thickness}`);
  if (application) lines.push(`Application: ${application}`);
  if (enteredArea) lines.push(`Entered project size: ${enteredArea}`);
  lines.push(`Normalized project area: ${formatNumber(projectAreaSqFt)} sq.ft`);
  lines.push(`Planning allowance: ${formatNumber(wastePercent)}%`);
  lines.push(`Required material area: ${formatNumber(requiredAreaSqFt)} sq.ft`);
  if (estimatedSlabs) lines.push(`Approximate slabs: ${estimatedSlabs}`);
  if (materialEstimate) lines.push(`Indicative material estimate: ${formatCurrency(materialEstimate)} (material only)`);
  lines.push(`Source: ${sourcePath}`);
  lines.push('Processing, freight, taxes, availability and final quantity: confirm during quotation.');
  return lines.join('\n');
}

function buildWhatsAppUrl(context) {
  if (!context.stone || !context.requiredAreaSqFt) return null;

  const lines = [
    'Hello Swamy Slabs,',
    '',
    'I am planning a project with:',
    `Stone: ${context.stone.name}`,
  ];
  if (context.finish) lines.push(`Finish: ${context.finish}`);
  if (context.thickness) lines.push(`Thickness: ${context.thickness}`);
  if (context.application) lines.push(`Application: ${context.application}`);
  if (context.enteredArea) lines.push(`Entered project size: ${context.enteredArea}`);
  lines.push(`Project area: ${formatNumber(context.projectAreaSqFt)} sq.ft`);
  lines.push(`Planning allowance: ${formatNumber(context.wastePercent)}%`);
  lines.push(`Estimated required material: ${formatNumber(context.requiredAreaSqFt)} sq.ft`);
  if (context.estimatedSlabs) lines.push(`Approximate slabs: ${context.estimatedSlabs}`);
  if (context.materialEstimate) lines.push(`Indicative material estimate: ${formatCurrency(context.materialEstimate)} (material only)`);
  lines.push('', 'Please help confirm availability, suitable specification and an exact quotation.');

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export default function ProjectPlannerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const querySlug = searchParams.get('stone');
  const [planner, setPlanner] = useState(() => {
    const stored = readStoredState();
    const queryStone = querySlug ? getStoneBySlug(querySlug) : null;
    const storedStone = getStoneBySlug(stored.stoneSlug);
    const initialStone = querySlug ? queryStone : storedStone;
    const baseState = queryStone && queryStone.slug !== stored.stoneSlug
      ? { ...stored, stoneSlug: queryStone.slug, finish: null, thickness: null, application: null }
      : { ...stored, stoneSlug: initialStone?.slug || null };
    return editableState(reconcileStoneFields(baseState, initialStone, Boolean(queryStone && queryStone.slug !== stored.stoneSlug)));
  });
  const [isEnquiryOpen, setIsEnquiryOpen] = useState(false);

  useEffect(() => {
    if (!querySlug) return;
    const queryStone = getStoneBySlug(querySlug);

    if (!queryStone && planner.stoneSlug) {
      setPlanner((current) => reconcileStoneFields(current, null, true));
      return;
    }

    if (queryStone && queryStone.slug !== planner.stoneSlug) {
      setPlanner((current) => reconcileStoneFields(current, queryStone, true));
    }
  }, [planner.stoneSlug, querySlug]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePlannerState(planner)));
    } catch {
      // Planning remains fully functional when storage is unavailable.
    }
  }, [planner]);

  const calculation = useMemo(() => {
    const selectedStone = getStoneBySlug(planner.stoneSlug);
    const validation = validateEstimatorInput({
      ...planner,
      requireStone: false,
    });
    const projectAreaSqFt = validation.projectAreaSqFt;
    const requiredAreaSqFt = validation.wastePercent === null
      ? null
      : calculateRequiredArea(projectAreaSqFt, validation.wastePercent);
    const allowanceAreaSqFt = validation.wastePercent === null
      ? null
      : calculatePlanningAllowance(projectAreaSqFt, validation.wastePercent);
    const usableSlabAreaSqFt = getVerifiedSlabArea(selectedStone);
    const estimatedSlabs = calculateEstimatedSlabCount(requiredAreaSqFt, usableSlabAreaSqFt);
    const materialEstimate = selectedStone && supportsSquareFootPrice(selectedStone)
      ? calculateMaterialEstimate(requiredAreaSqFt, selectedStone.price)
      : null;
    const enteredArea = projectAreaSqFt
      ? planner.areaMode === 'dimensions'
        ? `${planner.length} × ${planner.width} ${planner.dimensionUnit === 'm' ? 'm' : 'ft'}`
        : `${planner.projectArea} ${planner.areaUnit === 'sqm' ? 'sq.m' : 'sq.ft'}`
      : null;
    const sourcePath = selectedStone
      ? `/project-planner?stone=${encodeURIComponent(selectedStone.slug)}`
      : '/project-planner';
    const plannerContext = {
      stone: selectedStone,
      finish: planner.finish,
      thickness: planner.thickness,
      application: planner.application,
      enteredArea,
      projectAreaSqFt,
      wastePercent: validation.wastePercent,
      requiredAreaSqFt,
      estimatedSlabs,
      materialEstimate,
      sourcePath,
    };

    return {
      selectedStone,
      validation,
      projectAreaSqFt,
      requiredAreaSqFt,
      allowanceAreaSqFt,
      estimatedSlabs,
      materialEstimate,
      whatsappUrl: buildWhatsAppUrl(plannerContext),
      canRequestQuote: Boolean(selectedStone && requiredAreaSqFt),
      enquiryProduct: {
        ...selectedStone,
        stoneId: selectedStone?.id || '',
        name: selectedStone?.name || 'Stone project enquiry',
        selectedFinish: planner.finish,
        thickness: planner.thickness,
        quantity: requiredAreaSqFt ? `${formatNumber(requiredAreaSqFt)} sq.ft` : '',
        canonicalPath: sourcePath,
        contextSummary: buildPlannerContext(plannerContext),
        crmSource: 'PROJECT_PLANNER',
        leadContext: {
          application: planner.application,
          enteredArea,
          projectAreaSqFt,
          planningAllowancePercent: validation.wastePercent,
          requiredAreaSqFt,
          estimatedSlabs,
          indicativeMaterialEstimate: materialEstimate,
        },
      },
    };
  }, [planner]);

  const {
    selectedStone,
    validation,
    projectAreaSqFt,
    requiredAreaSqFt,
    allowanceAreaSqFt,
    estimatedSlabs,
    materialEstimate,
    whatsappUrl,
    canRequestQuote,
    enquiryProduct,
  } = calculation;

  const update = (field, value) => setPlanner((current) => ({ ...current, [field]: value }));

  const selectStone = (slug) => {
    const stone = getStoneBySlug(slug);
    setPlanner((current) => editableState(reconcileStoneFields(current, stone, true)));
    setSearchParams(stone ? { stone: stone.slug } : {}, { replace: true });
  };

  const selectApplication = (application) => {
    setPlanner((current) => ({
      ...current,
      application,
      previewMode: inferPreviewMode(application),
    }));
  };

  const totalAreaError = planner.areaMode === 'total' && hasInput(planner.projectArea)
    ? validation.errors.projectArea
    : null;
  const lengthError = planner.areaMode === 'dimensions' && hasInput(planner.length)
    ? validation.errors.length
    : null;
  const widthError = planner.areaMode === 'dimensions' && hasInput(planner.width)
    ? validation.errors.width
    : null;

  return (
    <main className="bg-[var(--color-background)]">
      <SEO
        title="Stone Project Planner & Material Estimator | Swamy Slabs"
        description="Plan a natural-stone project with an indicative material preview, area calculation, planning allowance and quotation-ready project summary."
        canonicalPath="/project-planner"
      />

      <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)] py-10 sm:py-14 lg:py-16">
        <Container size="wide">
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-stone-500">
              <li><Link to="/" className="hover:text-stone-950">Home</Link></li>
              <li aria-hidden="true"><ChevronRight size={14} /></li>
              <li aria-current="page" className="text-stone-800">Project Planner</li>
            </ol>
          </nav>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
            <div>
              <Eyebrow>Stone visualizer & project estimator</Eyebrow>
              <h1 className="type-display-lg mt-5 max-w-5xl text-balance">Turn a material choice into a clearer project brief.</h1>
            </div>
            <p className="type-body-lg max-w-2xl text-[var(--color-text-secondary)] lg:justify-self-end">
              Explore an indicative application preview, calculate planning area and carry the known requirements directly into an exact quotation request.
            </p>
          </div>
        </Container>
      </section>

      <Section className="!pt-10 sm:!pt-14">
        <Container size="wide">
          <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(420px,.82fr)] xl:gap-14">
            <form onSubmit={(event) => event.preventDefault()} aria-label="Stone project inputs" className="space-y-5">
              <section className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 sm:p-7" aria-labelledby="step-stone">
                <div id="step-stone"><StepHeading number="01" title="Select stone" icon={SwatchBook} description="Choose from the current Digital Stone Gallery. Only recorded catalog information is used." /></div>
                <label htmlFor="planner-stone" className="mt-6 grid gap-2 text-sm font-semibold text-stone-800">
                  Material
                  <select
                    id="planner-stone"
                    value={planner.stoneSlug}
                    onChange={(event) => selectStone(event.target.value)}
                    className="min-h-12 w-full border border-stone-300 bg-white px-4 font-normal text-stone-900 outline-none"
                  >
                    <option value="">Choose a stone</option>
                    {catalog.map((stone) => (
                      <option key={stone.id} value={stone.slug}>{stone.name}{stone.materialFamily ? ` — ${stone.materialFamily}` : ''}</option>
                    ))}
                  </select>
                </label>
                {selectedStone && (
                  <div className="mt-4 grid grid-cols-[72px_1fr] items-center gap-4 border border-[var(--color-border)] bg-stone-100/70 p-3">
                    {selectedStone.images[0] && <img src={selectedStone.images[0]} alt="" className="aspect-square h-[72px] w-[72px] object-cover" />}
                    <div>
                      <p className="font-serif text-lg text-stone-950">{selectedStone.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[.1em] text-stone-500">{selectedStone.materialFamily || 'Natural stone'}</p>
                    </div>
                  </div>
                )}
              </section>

              <section className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 sm:p-7" aria-labelledby="step-finish">
                <div id="step-finish"><StepHeading number="02" title="Finish" icon={SwatchBook} description="Choices are limited to the finish configurations recorded for the selected stone." /></div>
                <div className="mt-6">
                  <ChoiceGroup
                    legend="Recorded finish"
                    values={selectedStone?.finishes || []}
                    selected={planner.finish}
                    onChange={(value) => update('finish', value)}
                    emptyMessage="Finish to be confirmed during quotation. No product-specific finish is recorded for this selection."
                  />
                </div>
              </section>

              <section className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 sm:p-7" aria-labelledby="step-thickness">
                <div id="step-thickness"><StepHeading number="03" title="Thickness" icon={Ruler} description="Area planning continues even when project thickness must be confirmed later." /></div>
                <div className="mt-6">
                  <ChoiceGroup
                    legend="Recorded thickness"
                    values={selectedStone?.thicknesses || []}
                    selected={planner.thickness}
                    onChange={(value) => update('thickness', value)}
                    emptyMessage="Thickness will be confirmed during project quotation. No thickness has been assumed."
                  />
                </div>
              </section>

              <section className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 sm:p-7" aria-labelledby="step-application">
                <div id="step-application"><StepHeading number="04" title="Application" icon={SwatchBook} description="Select only from the project contexts recorded for this material. This does not alter the area formula." /></div>
                <div className="mt-6">
                  <ChoiceGroup
                    legend="Recorded application"
                    values={selectedStone?.applications || []}
                    selected={planner.application}
                    onChange={selectApplication}
                    emptyMessage="Application suitability will be discussed during quotation."
                  />
                </div>
              </section>

              <section className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 sm:p-7" aria-labelledby="step-size">
                <div id="step-size"><StepHeading number="05" title="Project size" icon={Ruler} description="Enter a known total area, or calculate a rectangular area from length and width." /></div>

                <fieldset className="mt-6">
                  <legend className="sr-only">Project size input method</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ['total', 'Total area'],
                      ['dimensions', 'Length × width'],
                    ].map(([value, label]) => (
                      <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-3 text-sm font-semibold ${planner.areaMode === value ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-300 bg-white text-stone-800'}`}>
                        <input type="radio" name="area-mode" value={value} checked={planner.areaMode === value} onChange={() => update('areaMode', value)} className="h-4 w-4 accent-[var(--color-brand)]" />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {planner.areaMode === 'total' ? (
                  <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_160px]">
                    <label className="grid gap-2 text-sm font-semibold text-stone-800">
                      Project area
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        max={MAX_PROJECT_AREA_SQ_FT}
                        step="any"
                        value={planner.projectArea}
                        onChange={(event) => update('projectArea', event.target.value)}
                        aria-invalid={Boolean(totalAreaError)}
                        aria-describedby={totalAreaError ? 'project-area-error' : 'project-area-help'}
                        className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none"
                        placeholder="1200"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-stone-800">
                      Area unit
                      <select value={planner.areaUnit} onChange={(event) => update('areaUnit', event.target.value)} className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none">
                        <option value="sqft">Square feet</option>
                        <option value="sqm">Square metres</option>
                      </select>
                    </label>
                    <p id={totalAreaError ? 'project-area-error' : 'project-area-help'} role={totalAreaError ? 'alert' : undefined} className={`text-xs leading-5 sm:col-span-2 ${totalAreaError ? 'text-[var(--color-danger)]' : 'text-stone-500'}`}>
                      {totalAreaError || 'Use the measured project surface area before planning allowance.'}
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_150px]">
                    <label className="grid gap-2 text-sm font-semibold text-stone-800">
                      Length
                      <input type="number" inputMode="decimal" min="0" step="any" value={planner.length} onChange={(event) => update('length', event.target.value)} aria-invalid={Boolean(lengthError)} aria-describedby={lengthError ? 'length-error' : undefined} className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none" placeholder="18" />
                      {lengthError && <span id="length-error" role="alert" className="text-xs text-[var(--color-danger)]">{lengthError}</span>}
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-stone-800">
                      Width
                      <input type="number" inputMode="decimal" min="0" step="any" value={planner.width} onChange={(event) => update('width', event.target.value)} aria-invalid={Boolean(widthError)} aria-describedby={widthError ? 'width-error' : undefined} className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none" placeholder="24" />
                      {widthError && <span id="width-error" role="alert" className="text-xs text-[var(--color-danger)]">{widthError}</span>}
                    </label>
                    <label className="grid gap-2 text-sm font-semibold text-stone-800">
                      Length unit
                      <select value={planner.dimensionUnit} onChange={(event) => update('dimensionUnit', event.target.value)} className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none">
                        <option value="ft">Feet</option>
                        <option value="m">Metres</option>
                      </select>
                    </label>
                    {projectAreaSqFt && <p className="text-xs leading-5 text-stone-500 sm:col-span-3">Calculated rectangular area: {formatNumber(projectAreaSqFt)} sq.ft</p>}
                  </div>
                )}
              </section>

              <section className="border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 sm:p-7" aria-labelledby="step-allowance">
                <div id="step-allowance"><StepHeading number="06" title="Planning allowance" icon={Ruler} description="Add an editable allowance for cutting, fitting and project variation." /></div>
                <label className="mt-6 grid max-w-xs gap-2 text-sm font-semibold text-stone-800">
                  Allowance percentage
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={MAX_PLANNING_ALLOWANCE_PERCENT}
                      step="0.5"
                      value={planner.wastePercent}
                      onChange={(event) => update('wastePercent', event.target.value)}
                      aria-invalid={Boolean(validation.errors.wastePercent)}
                      aria-describedby="allowance-help"
                      className="h-12 w-full border border-stone-300 bg-white px-4 pr-10 font-normal outline-none"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-stone-500">%</span>
                  </div>
                </label>
                <p id="allowance-help" className={`mt-3 text-xs leading-6 ${validation.errors.wastePercent ? 'text-[var(--color-danger)]' : 'text-stone-500'}`}>
                  {validation.errors.wastePercent || 'The default 10% is a planning assumption, not a universal rule. Confirm the appropriate allowance with Swamy Slabs before ordering.'}
                </p>
                <div className="mt-5 flex gap-3 border border-amber-800/20 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  <Info size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  Actual yield depends on the cutting layout, selected slab or batch, defects, matching requirements and site conditions.
                </div>
              </section>
            </form>

            <div className="space-y-6">
              <MaterialPreview stone={selectedStone} mode={planner.previewMode} onModeChange={(value) => update('previewMode', value)} application={planner.application} />
              <PlannerSummary
                stone={selectedStone}
                finish={planner.finish}
                thickness={planner.thickness}
                application={planner.application}
                projectArea={projectAreaSqFt ? `${formatNumber(projectAreaSqFt)} sq.ft` : null}
                allowanceArea={allowanceAreaSqFt === null ? null : formatNumber(allowanceAreaSqFt)}
                wastePercent={validation.wastePercent}
                requiredArea={requiredAreaSqFt ? formatNumber(requiredAreaSqFt) : null}
                estimatedSlabs={estimatedSlabs}
                materialEstimate={materialEstimate ? formatCurrency(materialEstimate) : null}
                onRequestQuote={() => setIsEnquiryOpen(true)}
                whatsappUrl={whatsappUrl}
                canRequestQuote={canRequestQuote}
              />
            </div>
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
