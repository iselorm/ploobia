import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Beaker,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Droplets,
  Microscope,
  Pause,
  Play,
  Snowflake,
  Sun,
  Target,
  Thermometer,
  PlayCircle,
  Undo2,
  Wind,
  Zap,
  Atom,
} from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { useBandCaps } from '@/lib/bands'
import { BIOMES, LEAVES, PATHWAY_NOTE, type BiomeId } from '@/lib/leaves'
import { simEnv, simLeaf, LIMITING_LABELS, type PhotoSim } from '@/lib/photo'
import { sensitivities, VARS, VAR_ORDER, type VarId } from '@/lib/ratelab'
import LeafVitals from './LeafVitals'

export interface LabSettings {
  light: number
  co2: number
  water: number
  tempC: number
  paused: boolean
}

interface Props {
  sim: PhotoSim
  settings: LabSettings
  leafId: string
  biomeId: BiomeId
  xVar: VarId
  zoomed: boolean
  trialRunning: boolean
  /** 0–1 progress through the running trial. */
  trialProgress: number
  /** True when this band requires a committed prediction before measuring. */
  predictionPending: boolean
  onChange: (patch: Partial<LabSettings>) => void
  onLeaf: (id: string) => void
  onBiome: (id: BiomeId) => void
  onXVar: (v: VarId) => void
  onZoom: (z: boolean) => void
  onEquation: () => void
  onWaterPlant: () => void
  onStartTrial: () => void
  onDemo: () => void
}

/** Every species in the scene carries this label on the molecules themselves. */
const MOLECULE_KEY = [
  { formula: 'CO₂', color: '#6C7480', note: 'Carbon dioxide from the air — one grey C between two red O atoms.' },
  { formula: 'H₂O', color: '#3E90D0', note: 'Water climbing the stem from the roots.' },
  { formula: 'O₂', color: '#4E9BC4', note: 'Oxygen leaving the leaf as a pair of bonded O atoms — the waste product.' },
  { formula: 'C₆H₁₂O₆', color: '#C9911F', note: 'Glucose: the sugar the leaf has just built.' },
]

const VAR_ICONS: Record<VarId, React.ReactNode> = {
  light: <Sun className="h-3.5 w-3.5 text-[#E8A33D]" />,
  co2: <Wind className="h-3.5 w-3.5 text-[#8A94A0]" />,
  temp: <Thermometer className="h-3.5 w-3.5 text-[#C13B33]" />,
  water: <Droplets className="h-3.5 w-3.5 text-[#4FA3E3]" />,
}

/** Read a factor's real-world value out of the settings mirror. */
function readSetting(v: VarId, s: LabSettings): number {
  switch (v) {
    case 'light':
      return s.light * VARS.light.max
    case 'co2':
      return s.co2 * VARS.co2.max
    case 'temp':
      return s.tempC
    case 'water':
      return s.water * 100
  }
}

/** Turn a real-world value back into a settings patch. */
function writeSetting(v: VarId, real: number): Partial<LabSettings> {
  switch (v) {
    case 'light':
      return { light: real / VARS.light.max }
    case 'co2':
      return { co2: real / VARS.co2.max }
    case 'temp':
      return { tempC: real }
    case 'water':
      return { water: real / 100 }
  }
}

function FactorSlider({
  v,
  settings,
  investigating,
  quantitative,
  onChange,
}: {
  v: VarId
  settings: LabSettings
  investigating: boolean
  quantitative: boolean
  onChange: (patch: Partial<LabSettings>) => void
}) {
  const meta = VARS[v]
  const real = readSetting(v, settings)
  const label = quantitative ? meta.label : meta.simpleLabel
  // Temperature has no meaningful "percent", so it always shows real degrees.
  const casual = v === 'temp' ? `${Math.round(real)} °C` : `${Math.round((real / meta.max) * 100)}%`

  return (
    <div
      className={
        investigating
          ? 'rounded-[12px] border-2 border-dashed px-2 py-1.5'
          : 'rounded-[12px] px-2 py-1.5'
      }
      style={investigating ? { borderColor: meta.color, background: '#FFFDF7' } : undefined}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#7A5252]">
          {VAR_ICONS[v]} {label}
          {investigating && (
            <span
              className="rounded-full px-1.5 py-px text-[9px] font-black tracking-wide uppercase"
              style={{ background: meta.color, color: '#FBF5EA' }}
            >
              varying
            </span>
          )}
        </label>
        <span
          className="shrink-0 rounded-full bg-[#F3E9D7] px-2 py-0.5 text-[11px] font-extrabold whitespace-nowrap tabular-nums"
          style={{ color: meta.color }}
          title={quantitative ? `${meta.format(real)} ${meta.unit}` : undefined}
        >
          {quantitative ? `${meta.format(real)} ${meta.chipUnit}` : casual}
        </span>
      </div>
      <Slider
        value={[real]}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        onValueChange={([val]) => onChange(writeSetting(v, val))}
        aria-label={meta.label}
      />
    </div>
  )
}

/** The experiment control panel — specimen, climate, factors, and the apparatus. */
export default function RateLabPanel({
  sim,
  settings,
  leafId,
  biomeId,
  xVar,
  zoomed,
  trialRunning,
  trialProgress,
  predictionPending,
  onChange,
  onLeaf,
  onBiome,
  onXVar,
  onZoom,
  onEquation,
  onWaterPlant,
  onStartTrial,
  onDemo,
}: Props) {
  const caps = useBandCaps()
  const [dossier, setDossier] = useState(false)
  const [bars, setBars] = useState(false)
  const [showKey, setKey] = useState(false)
  const [vitals, setVitals] = useState(() => (typeof window === 'undefined' ? false : window.innerHeight > 940))
  const leaf = simLeaf(sim)
  const sens = useMemo(
    () => sensitivities(leaf, simEnv(sim)),
    // Recomputed whenever any control moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leaf, settings.light, settings.co2, settings.water, settings.tempC, sim.turgor],
  )

  const mismatch = leaf.nativeBiome !== biomeId

  const simple = caps.vocab === 'simple'
  const wilting = sim.turgor < 0.55

  /**
   * A diagnosis, not a single label. Several things can be wrong at once — a
   * leaf can be overheating AND short of CO₂ AND drying out — and saying only
   * one of them is how a learner ends up with a tidy, wrong mental model.
   */
  const hint = (() => {
    if (sens.lethalHeat)
      return simple
        ? 'Way too hot! The tiny machines inside the leaf have been wrecked, and cooling it back down will not repair them.'
        : 'Past this leaf’s denaturation limit the enzymes have permanently lost their shape. Cooling it back down will not restore the rate.'
    if (sens.tooCold)
      return simple
        ? 'Too cold for this leaf — everything inside has slowed to a crawl.'
        : 'Below this leaf’s chilling threshold: membranes and enzymes are too cold to function.'

    const parts: string[] = []

    if (sens.heatDamage) {
      parts.push(
        simple
          ? 'It is hotter than this leaf likes, so the rate is already falling.'
          : `Temperature is past this leaf’s optimum of ${leaf.tOpt} °C, so the rate is falling as you heat it further.`,
      )
    }

    if (sens.stomatalLimited) {
      parts.push(
        simple
          ? 'It has shut its holes to stop losing water — but that also blocks the CO₂ it needs. Give it a drink!'
          : 'CO₂ is limiting, but only because water stress has closed the stomata: the proximate cause is CO₂ supply, the ultimate cause is water.',
      )
    } else if (sens.limiting === null) {
      parts.push(
        simple
          ? 'Nothing you add right now will speed it up — something else is in the way.'
          : 'No single factor is limiting: the leaf is at its capacity for these conditions.',
      )
    } else {
      const name = LIMITING_LABELS[sens.limiting]
      parts.push(
        simple
          ? `Of the things you can add, ${name} would help most right now.`
          : `${name.charAt(0).toUpperCase() + name.slice(1)} is the limiting factor — the input in shortest supply relative to demand.`,
      )
    }

    if (wilting && !sens.stomatalLimited) {
      parts.push(
        simple
          ? 'It is also going floppy — it is running out of water.'
          : 'It is also losing turgor: water is leaving faster than the roots can replace it.',
      )
    }

    return parts.join(' ')
  })()

  const chipBtn = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-[10.5px] font-extrabold transition-all duration-200 ${
      active ? 'bg-[#3E7C43] text-[#FBF5EA] shadow' : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'
    }`

  return (
    <div className="space-y-3.5">
      {/* ---- Specimen ---- */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-black tracking-widest text-[#7A5252] uppercase">
          <Beaker className="h-3 w-3" /> Leaf in the apparatus
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LEAVES.map((l) => (
            <button
              key={l.id}
              onClick={() => onLeaf(l.id)}
              className={chipBtn(l.id === leafId)}
              title={`${l.plant} — ${l.pathway}`}
            >
              {l.name.replace(/ (broadleaf|blade|pad|needle)$/, '')}{' '}
              <span className="opacity-70">{l.pathway}</span>
            </button>
          ))}
        </div>

        {/* Why this leaf is shaped the way it is */}
        <button
          onClick={() => setDossier((d) => !d)}
          className="mt-1.5 flex items-center gap-1 text-[10px] font-black text-[#3E7C43] uppercase"
          aria-expanded={dossier}
        >
          {dossier ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Why is it built like this?
        </button>
        {dossier && (
          <div className="mt-1 space-y-1.5 rounded-[14px] border border-[#DDEAD8] bg-[#EAF3E6] px-2.5 py-2">
            <div className="text-[11px] font-black text-[#2E7D32]">
              {leaf.name} · {leaf.plant}
            </div>
            <p className="text-[10.5px] leading-snug font-semibold text-[#3D5B3F]">
              {PATHWAY_NOTE[leaf.pathway]}
            </p>
            <ul className="space-y-1">
              {leaf.adaptations.map((a, i) => (
                <li key={i} className="flex gap-1.5 text-[10.5px] leading-snug font-semibold text-[#3D5B3F]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#5E9E63]" />
                  {a}
                </li>
              ))}
            </ul>
            <p className="border-t border-[#D3E3CE] pt-1.5 text-[10.5px] leading-snug font-bold text-[#2E7D32]">
              Water: {leaf.waterStory}
            </p>
            {caps.quantitative && (
              <p className="text-[10px] leading-snug font-bold text-[#5E7F5F]">
                Leaf area {leaf.leafArea.toFixed(2)}× · P<sub>max</sub> {leaf.pmax} µmol CO₂ m⁻² s⁻¹ ·
                light half-saturation {leaf.kLight} · CO₂ half-saturation {leaf.kCo2} ppm · optimum{' '}
                {leaf.tOpt} °C (works between {leaf.tMin} and {leaf.tMax} °C)
              </p>
            )}
          </div>
        )}
      </div>

      {/* ---- Climate ---- */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-black tracking-widest text-[#7A5252] uppercase">
          <Wind className="h-3 w-3" /> Climate
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BIOMES.map((b) => (
            <button
              key={b.id}
              onClick={() => onBiome(b.id)}
              className={chipBtn(b.id === biomeId)}
              title={b.note}
            >
              {b.short}
            </button>
          ))}
        </div>
        {mismatch && (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-[12px] border border-[#F0D9C0] bg-[#FDF1E4] px-2.5 py-1.5">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0 text-[#C1743B]" />
            <p className="text-[10.5px] leading-snug font-bold text-[#8A5A32]">
              This leaf evolved in {leaf.nativeBiome === 'boreal' ? 'the boreal forest' : `the ${leaf.nativeBiome}`}, not here.
              Watch what that costs it.
            </p>
          </div>
        )}
      </div>

      {/* ---- Independent variable ---- */}
      {caps.controlledVariables && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-black tracking-widest text-[#7A5252] uppercase">
            <Crosshair className="h-3 w-3" /> Investigating
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VAR_ORDER.map((v) => (
              <button key={v} onClick={() => onXVar(v)} className={chipBtn(v === xVar)}>
                {VARS[v].label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] leading-snug font-bold text-[#B08A7A]">
            Change only this one. The other three are your controlled variables — leave them alone,
            or your results mean nothing.
          </p>
        </div>
      )}

      {/* ---- Factor sliders ---- */}
      <div className="space-y-1">
        {VAR_ORDER.map((v) => (
          <FactorSlider
            key={v}
            v={v}
            settings={settings}
            investigating={caps.controlledVariables && v === xVar}
            quantitative={caps.quantitative}
            onChange={onChange}
          />
        ))}
      </div>

      {/* ---- Live diagnosis ---- */}
      <div className="rounded-[14px] border border-[#E8DFC8] bg-[#F8F1DF] px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-black tracking-wider uppercase">
          {sens.lethalHeat || sens.heatDamage ? (
            <>
              <AlertTriangle className="h-3 w-3 text-[#C13B33]" />
              <span className="text-[#C13B33]">Heat damage</span>
            </>
          ) : sens.tooCold ? (
            <>
              <Snowflake className="h-3 w-3 text-[#2E6DA8]" />
              <span className="text-[#2E6DA8]">Too cold</span>
            </>
          ) : (
            <>
              <Zap className="h-3 w-3 text-[#B97D10]" />
              <span className="text-[#B97D10]">Limiting factor</span>
            </>
          )}
        </div>
        <p className="mt-1 text-[12px] leading-snug font-semibold text-[#6B5236]">{hint}</p>

        {caps.sensitivity && (
          <button
            onClick={() => setBars((b) => !b)}
            aria-expanded={bars}
            className="mt-1.5 flex items-center gap-1 text-[9.5px] font-black tracking-wider text-[#A08750] uppercase"
          >
            {bars ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Gain from a small increase
          </button>
        )}
        {caps.sensitivity && bars && (
          <div className="mt-1 space-y-1 border-t border-[#E8DFC8] pt-2">
            {VAR_ORDER.map((v) => {
              const raw = sens[v]
              const span = Math.max(
                1,
                ...VAR_ORDER.map((k) => Math.abs(sens[k])),
              )
              const width = Math.min(100, (Math.abs(raw) / span) * 100)
              return (
                <div key={v} className="flex items-center gap-1.5">
                  <span className="w-[68px] shrink-0 text-[10px] font-bold text-[#7A5252]">
                    {VARS[v].label.replace(' concentration', '').replace(' intensity', '')}
                  </span>
                  <div className="relative h-1.5 flex-1 rounded-full bg-[#EFE4CE]">
                    <div
                      className="absolute inset-y-0 rounded-full"
                      style={{
                        width: `${width}%`,
                        background: raw < 0 ? '#C13B33' : VARS[v].color,
                        opacity: raw < 0 ? 0.75 : 1,
                      }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right text-[9.5px] font-black tabular-nums text-[#8A7A55]">
                    {raw > 0 ? '+' : ''}
                    {raw.toFixed(1)}
                  </span>
                </div>
              )
            })}
            <p className="text-[9.5px] leading-snug font-bold text-[#B08A7A]">
              Measured by nudging each factor and re-solving. Red means increasing it would now
              reduce the rate.
            </p>
          </div>
        )}
      </div>

      {/* ---- The apparatus ---- */}
      <div>
        <button
          onClick={() => setVitals((v) => !v)}
          aria-expanded={vitals}
          className="flex w-full items-center gap-1 text-[10.5px] font-black tracking-widest text-[#7A5252] uppercase"
        >
          {vitals ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Water &amp; stomata
          <span className="ml-auto rounded-full bg-[#EAF3E6] px-2 py-0.5 text-[9.5px] font-black text-[#2E7D32] normal-case">
            turgor {Math.round(sim.turgor * 100)}%
          </span>
        </button>
        {vitals && (
          <div className="mt-1.5">
            <LeafVitals sim={sim} />
          </div>
        )}
      </div>

      {/* ---- Trial ---- */}
      <div>
        <button
          onClick={onStartTrial}
          disabled={trialRunning || predictionPending}
          className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-[#3E7C43] px-4 py-2.5 text-sm font-extrabold text-[#FBF5EA] shadow transition-all duration-200 hover:bg-[#2F6134] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {trialRunning && (
            <span
              className="absolute inset-y-0 left-0 bg-[#2F6134]"
              style={{ width: `${trialProgress * 100}%` }}
            />
          )}
          <span className="relative flex items-center gap-2">
            <Target className="h-4 w-4" />
            {trialRunning
              ? `Counting bubbles… ${Math.ceil((1 - trialProgress) * sim.trialLength)}s`
              : predictionPending
                ? 'Commit your prediction first'
                : caps.quantitative
                  ? `Run a ${caps.trialSeconds}s trial${caps.repeats ? ' (×3)' : ''}`
                  : 'Measure the bubbles!'}
          </span>
        </button>
        <p className="mt-1 text-[10px] leading-snug font-bold text-[#B08A7A]">
          {caps.repeats
            ? 'Three repeats per trial, so you get a mean and a range you can defend.'
            : 'Counts the oxygen coming off the leaf for a fixed time — the classic pondweed method.'}
        </p>
      </div>

      {/* ---- Utilities ---- */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          onClick={() => onChange({ paused: !settings.paused })}
          className="flex items-center gap-1.5 rounded-full border border-[#DDEAD8] bg-[#EAF3E6] px-3 py-1.5 text-[11px] font-extrabold text-[#2E7D32] shadow-sm transition-all duration-200 hover:bg-[#DDEBD9] active:scale-95"
        >
          {settings.paused ? (
            <Play className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Pause className="h-3.5 w-3.5 fill-current" />
          )}
          {settings.paused ? 'Play' : 'Pause'}
        </button>
        <button
          onClick={onWaterPlant}
          className="flex items-center gap-1.5 rounded-full border border-[#D3E2F0] bg-[#E7F0F8] px-3 py-1.5 text-[11px] font-extrabold text-[#2E6DA8] shadow-sm transition-all duration-200 hover:bg-[#DAE8F4] active:scale-95"
        >
          <Droplets className="h-3.5 w-3.5" />
          Water the plant
        </button>
        <button
          onClick={() => onZoom(!zoomed)}
          className="flex items-center gap-1.5 rounded-full border border-[#DDEAD8] bg-[#EAF3E6] px-3 py-1.5 text-[11px] font-extrabold text-[#2E7D32] shadow-sm transition-all duration-200 hover:bg-[#DDEBD9] active:scale-95"
        >
          {zoomed ? <Undo2 className="h-3.5 w-3.5" /> : <Microscope className="h-3.5 w-3.5" />}
          {zoomed ? 'Back out' : 'Zoom in'}
        </button>
        <button
          onClick={onEquation}
          className="flex items-center gap-1.5 rounded-full border border-[#E9D9F0] bg-[#F3EAF7] px-3 py-1.5 text-[11px] font-extrabold text-[#7A3E9C] shadow-sm transition-all duration-200 hover:bg-[#EADCF1] active:scale-95"
        >
          <Atom className="h-3.5 w-3.5" />
          Expand the equation
        </button>
        <button
          onClick={onDemo}
          className="flex items-center gap-1.5 rounded-full border border-[#E8DFC8] bg-[#F8F1DF] px-3 py-1.5 text-[11px] font-extrabold text-[#B97D10] shadow-sm transition-all duration-200 hover:bg-[#F3E9D7] active:scale-95"
        >
          <PlayCircle className="h-3.5 w-3.5" />
          Watch the demo
        </button>
      </div>

      {/* ---- What am I looking at? ---- */}
      <div>
        <button
          onClick={() => setKey((k) => !k)}
          aria-expanded={showKey}
          className="flex w-full items-center gap-1 text-[10.5px] font-black tracking-widest text-[#7A5252] uppercase"
        >
          {showKey ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          What am I looking at?
        </button>
        {showKey && (
          <ul className="mt-1.5 space-y-1 rounded-[14px] border border-[#E8DFC8] bg-[#F8F1DF] px-2.5 py-2">
            {MOLECULE_KEY.map((m) => (
              <li key={m.formula} className="flex items-start gap-2">
                <span
                  className="mt-px flex h-4 shrink-0 items-center rounded-full px-1.5 text-[9.5px] font-black text-[#FBF5EA]"
                  style={{ background: m.color }}
                >
                  {m.formula}
                </span>
                <span className="text-[10.5px] leading-snug font-semibold text-[#6B5236]">
                  {m.note}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
