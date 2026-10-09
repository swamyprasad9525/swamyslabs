const PREVIEW_MODES = [
  { value: 'floor', label: 'Floor' },
  { value: 'wall', label: 'Wall' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'landscape', label: 'Landscape' },
];

const surfaceClasses = {
  floor: 'inset-x-[5%] bottom-0 h-[57%] [clip-path:polygon(23%_0,77%_0,100%_100%,0_100%)]',
  wall: 'inset-x-[13%] top-[12%] h-[70%] border-[8px] border-white/55 shadow-2xl sm:border-[12px]',
  outdoor: 'inset-x-0 bottom-0 h-[49%] [clip-path:polygon(0_18%,100%_0,100%_100%,0_100%)]',
  landscape: 'bottom-0 left-[30%] h-[72%] w-[40%] [clip-path:polygon(38%_0,62%_0,100%_100%,0_100%)]',
};

function SceneFrame({ mode }) {
  if (mode === 'wall') {
    return (
      <>
        <div className="absolute inset-0 bg-[linear-gradient(120deg,#d5cec2,#f0ece4_52%,#c4bbad)]" />
        <div className="absolute bottom-[10%] left-[4%] h-[28%] w-[12%] border border-stone-500/20 bg-[#b4aa99] shadow-xl" />
        <div className="absolute bottom-[10%] right-[5%] h-[36%] w-[10%] border border-stone-500/20 bg-[#d8d1c5] shadow-xl" />
        <div className="absolute inset-x-0 bottom-0 h-[10%] bg-[#8c8273]" />
      </>
    );
  }

  if (mode === 'outdoor') {
    return (
      <>
        <div className="absolute inset-x-0 top-0 h-[58%] bg-[linear-gradient(#cfd8da,#eef0e9)]" />
        <div className="absolute inset-x-0 top-[45%] h-[22%] bg-[#747664] [clip-path:polygon(0_38%,18%_18%,36%_40%,56%_4%,76%_34%,100%_12%,100%_100%,0_100%)]" />
        <div className="absolute left-[8%] top-[23%] h-[34%] w-[2px] bg-stone-800/35" />
        <div className="absolute left-[4%] top-[18%] h-[11%] w-[10%] rounded-full bg-[#6d735e]" />
      </>
    );
  }

  if (mode === 'landscape') {
    return (
      <>
        <div className="absolute inset-0 bg-[linear-gradient(#d9ded6_0_40%,#77806a_40%_100%)]" />
        <div className="absolute bottom-0 left-0 h-[54%] w-[38%] bg-[#5f6955]" />
        <div className="absolute bottom-0 right-0 h-[59%] w-[38%] bg-[#69735d]" />
        <div className="absolute left-[6%] top-[23%] h-[30%] w-[18%] rounded-t-full bg-[#4f5c4b]" />
        <div className="absolute right-[8%] top-[19%] h-[35%] w-[20%] rounded-t-full bg-[#56624f]" />
      </>
    );
  }

  return (
    <>
      <div className="absolute inset-x-0 top-0 h-[52%] bg-[linear-gradient(115deg,#d2cbc0,#f2eee7_58%,#c8bfb1)]" />
      <div className="absolute left-[13%] top-[12%] h-[29%] w-[21%] border-[6px] border-white/65 bg-[#aaa18f] shadow-lg" />
      <div className="absolute right-[14%] top-[15%] h-[23%] w-[17%] border-[6px] border-white/65 bg-[#b7afa1] shadow-lg" />
      <div className="absolute inset-x-0 top-[51%] h-px bg-stone-700/20" />
    </>
  );
}

export default function MaterialPreview({ stone, mode = 'floor', onModeChange, application }) {
  const activeMode = PREVIEW_MODES.some((item) => item.value === mode) ? mode : 'floor';
  const image = stone?.images?.[0];

  return (
    <figure className="border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="type-eyebrow text-[var(--color-brand)]">Material preview</p>
            <h2 className="mt-2 font-serif text-2xl text-stone-950">{stone?.name || 'Choose a stone'}</h2>
            {application && <p className="mt-1 text-sm text-stone-500">Project context: {application}</p>}
          </div>
          <fieldset>
            <legend className="sr-only">Preview setting</legend>
            <div className="flex flex-wrap gap-1" aria-label="Preview setting">
              {PREVIEW_MODES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={activeMode === item.value}
                  onClick={() => onModeChange(item.value)}
                  className={`min-h-10 min-w-0 border px-3 text-[10px] font-bold uppercase tracking-[.1em] transition-colors ${activeMode === item.value ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-300 text-stone-600 hover:border-stone-600 hover:text-stone-950'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="relative aspect-[4/3] min-h-[280px] overflow-hidden bg-[#d7d0c4] sm:min-h-[360px]">
        <SceneFrame mode={activeMode} />
        {image ? (
          <div
            className={`absolute overflow-hidden bg-stone-300 shadow-[0_22px_50px_rgba(28,25,23,.28)] ${surfaceClasses[activeMode]}`}
            role="img"
            aria-label={`Indicative ${activeMode} preview using ${stone.name}`}
          >
            <img src={image} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,.2),transparent_42%,rgba(28,25,23,.12))]" aria-hidden="true" />
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center px-8 text-center">
            <div className="max-w-xs border border-white/60 bg-white/75 p-6 backdrop-blur-sm">
              <p className="font-serif text-2xl text-stone-900">Select a material to begin.</p>
              <p className="mt-2 text-sm leading-6 text-stone-600">Its recorded stone image will appear in this conceptual surface setting.</p>
            </div>
          </div>
        )}
        <div className="absolute bottom-3 right-3 bg-stone-950/80 px-3 py-2 text-[9px] font-bold uppercase tracking-[.14em] text-white backdrop-blur-sm">
          Indicative preview
        </div>
      </div>

      <figcaption className="px-5 py-4 text-xs leading-6 text-stone-600 sm:px-6">
        Digital previews are indicative. Natural stone appearance varies by slab, batch, finish, lighting and installation environment.
      </figcaption>
    </figure>
  );
}
