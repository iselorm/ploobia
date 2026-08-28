import { useMemo } from 'react'
import {
  Beaker,
  CircleDot,
  Droplets,
  Eye,
  Gauge,
  Leaf,
  Moon,
  Play,
  Scissors,
  Sun,
  Thermometer,
  Timer,
  Wind,
} from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import type { BandCaps } from '@/lib/bands'
import { SPECIMENS, type Specimen } from '@/lib/specimens'
import { habitatCaption, habitatForSpecimen } from '@/lib/sugarworld'
import { MEASURES, MEASURE_ORDER, type MeasureId, type SugarVarId } from '@/lib/sugarline'
import {
  STAGES,
  SUGAR_VARS,
  SUGAR_VAR_ORDER,
  type MissionTarget,
  type StageId,
  type SugarSim,
} from '@/lib/sugarsim'
import { Aim, AtlasButton, Chip, Dial, FactRow, Meter, PillGroup, Plate, Rule } from './AtlasKit'

/* ------------------------------------------------------------------ */
/* Specimen library                                                   */
/* ------------------------------------------------------------------ */

/** A tiny silhouette so the library reads at a glance, the way the reference's thumbnails do. */
function SpecimenMark({ id, tint }: { id: string; tint: string }) {
  const common = { fill: tint, stroke: 'none' }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      {id === 'maize' && (
        <>
          <path d="M12 3c3 3 4 7 3 12-3 1-5-2-5-6 0-3 1-5 2-6Z" {...common} />
          <path d="M11 21c-3-3-4-7-3-11 3 1 4 4 4 7 0 2-.4 3.3-1 4Z" fill={tint} opacity={0.6} />
        </>
      )}
      {id === 'potato' && (
        <>
          <ellipse cx="12" cy="14" rx="8" ry="6" {...common} />
          <circle cx="9" cy="12" r="1" fill="#6B4A2E" />
          <circle cx="14" cy="15" r="1" fill="#6B4A2E" />
        </>
      )}
      {id === 'tomato' && (
        <>
          <circle cx="12" cy="14" r="7" {...common} />
          <path d="M8 8h8l-2 2h-4Z" fill="#4F9A4E" />
        </>
      )}
      {id === 'opuntia' && (
        <>
          <ellipse cx="10" cy="14" rx="5" ry="7" {...common} />
          <ellipse cx="16" cy="9" rx="3" ry="4" fill={tint} opacity={0.75} />
        </>
      )}
      {id === 'bean' && (
        <>
          <path d="M6 15c0-5 4-9 9-9 1 5-3 11-9 9Z" {...common} />
          <path d="M15 6c1 5-3 11-9 9" stroke="#2F6134" strokeWidth="1" fill="none" />
        </>
      )}
    </svg>
  )
}

export function SpecimenRail({
  aim = null,
  current,
  onPick,
  compact = false,
}: {
  /** The control the active mission step is pointing at. */
  aim?: MissionTarget | null
  current: string
  onPick: (id: string) => void
  compact?: boolean
}) {
  return (
    <Plate eyebrow="Specimen library" icon={<Leaf className="h-3 w-3" />} className={compact ? '' : 'w-full'}>
      <Aim on={aim === 'specimen'}>
      <div className={cn('flex flex-col gap-0.5', compact && 'max-h-[38vh] overflow-y-auto')}>
        {SPECIMENS.map((s) => {
          const on = s.id === current
          return (
            <Tile
              key={s.id}
              onClick={() => onPick(s.id)}
              aria-pressed={on}
              aria-label={`Specimen: ${s.name}`}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-all active:scale-[0.99]',
                on ? 'bg-[#E7F1E3]' : 'hover:bg-[#F3EEE0]',
              )}
            >
              <SpecimenMark id={s.id} tint={s.build.colors.leaf} />
              <span className="min-w-0 flex-1">
                <span className="atlas-serif block truncate text-[13.5px] leading-tight font-semibold text-[#2A2823]">
                  {s.name}
                </span>
                <span className="atlas-serif block truncate text-[11px] leading-tight text-[#8B8471] italic">
                  {s.binomial}
                </span>
              </span>
              {on && <span className="h-2 w-2 shrink-0 rounded-full bg-[#3E7C43]" />}
            </Tile>
          )
        })}
      </div>
      </Aim>
    </Plate>
  )
}

/* ------------------------------------------------------------------ */
/* Stage tabs                                                         */
/* ------------------------------------------------------------------ */

export function StageTabs({
  aim = null,
  stage,
  onStage,
  compact = false,
}: {
  /** The control the active mission step is pointing at. */
  aim?: MissionTarget | null
  stage: StageId
  onStage: (s: StageId) => void
  compact?: boolean
}) {
  return (
    <div
      role="group"
      aria-label="View"
      className={cn(
        // `pointer-events-auto` lives HERE, not on the caller's wrapper. The
        // HUD root is `pointer-events-none` so the scene stays draggable
        // between controls, which means every interactive island has to opt
        // back in. The desktop branch wrapped these tabs in an opting-in div
        // and the compact branch did not, so stage navigation was dead on
        // every phone while the tool rail beside it worked — the rail sets the
        // class on itself. Owning it here makes the control correct wherever
        // it is mounted.
        'pointer-events-auto flex gap-2',
        compact ? 'w-full' : 'w-[min(44rem,calc(100vw-42rem))]',
        aim === 'stage' && 'atlas-aim',
      )}
    >
      {STAGES.map((s) => {
        const on = s.id === stage
        return (
          <Tile
            key={s.id}
            onClick={() => onStage(s.id)}
            aria-pressed={on}
            aria-label={s.label}
            className={cn(
              'flex-1 rounded-[14px] border px-3 py-2 text-center transition-all active:scale-[0.99]',
              on
                ? 'border-[#3E7C43] bg-[#FCFAF4] shadow-[0_1px_2px_rgba(74,62,40,0.08)]'
                : 'border-[#E4DCC9] bg-[rgba(252,250,244,0.72)] hover:bg-[#FCFAF4]',
            )}
          >
            <span className="atlas-eyebrow block">{s.eyebrow}</span>
            <span
              className={cn(
                'atlas-serif block text-[13.5px] font-semibold',
                on ? 'text-[#2F6134]' : 'text-[#4A4438]',
              )}
            >
              {s.label}
            </span>
          </Tile>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Conditions                                                         */
/* ------------------------------------------------------------------ */

export interface Conditions {
  light: number
  co2: number
  tempC: number
  soilWater: number
  night: boolean
  girdled: boolean
}

export function ConditionsPlate({
  conditions,
  caps,
  specimen,
  onChange,
  onGirdle,
  onNight,
  onWater,
  aim = null,
  embedded = false,
}: {
  conditions: Conditions
  caps: BandCaps
  specimen: Specimen
  onChange: (patch: Partial<Conditions>) => void
  onGirdle: (on: boolean) => void
  onNight: (on: boolean) => void
  onWater: () => void
  /** The control the active mission step is pointing at. */
  aim?: MissionTarget | null
  embedded?: boolean
}) {
  const v = SUGAR_VARS
  return (
    <Plate
      eyebrow="Conditions"
      icon={<Gauge className="h-3 w-3" />}
      className={embedded ? '' : 'w-full'}
      action={
        <div className="flex gap-1">
          <Aim on={aim === 'night'} inline>
          <Tile
            onClick={() => onNight(!conditions.night)}
            aria-label={conditions.night ? 'Switch to day' : 'Switch to night'}
            aria-pressed={conditions.night}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] font-extrabold transition-all active:scale-95',
              conditions.night
                ? 'border-[#B9C4D8] bg-[#E3E8F2] text-[#3B4A66]'
                : 'border-[#EFD9A6] bg-[#FBF0D8] text-[#8A5A0B]',
            )}
          >
            {conditions.night ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
            {conditions.night ? 'Night' : 'Day'}
          </Tile>
          </Aim>
        </div>
      }
    >
      <Aim on={aim === 'light'}>
      <Dial
        label={v.light.label}
        value={conditions.night ? 0 : conditions.light * v.light.max}
        display={
          conditions.night ? 'dark' : `${v.light.format(conditions.light * v.light.max)} ${v.light.chipUnit}`
        }
        min={v.light.min}
        max={v.light.max}
        step={v.light.step}
        color={v.light.color}
        disabled={conditions.night}
        onChange={(real) => onChange({ light: real / v.light.max })}
        note={conditions.night ? 'The sun is off. Anything still moving is running on starch.' : undefined}
      />
      </Aim>
      <Aim on={aim === 'co2'}>
      <Dial
        label={v.co2.label}
        value={conditions.co2 * v.co2.max}
        display={`${v.co2.format(conditions.co2 * v.co2.max)} ${v.co2.chipUnit}`}
        min={v.co2.min}
        max={v.co2.max}
        step={v.co2.step}
        color={v.co2.color}
        onChange={(real) => onChange({ co2: real / v.co2.max })}
        note={
          specimen.leaf.pathway === 'CAM'
            ? 'This one banked its CO₂ last night, so today’s air barely matters to it.'
            : undefined
        }
      />
      </Aim>
      <Aim on={aim === 'temp'}>
      <Dial
        label={v.temp.label}
        value={conditions.tempC}
        display={`${v.temp.format(conditions.tempC)} °C`}
        min={v.temp.min}
        max={v.temp.max}
        step={v.temp.step}
        color={v.temp.color}
        onChange={(real) => onChange({ tempC: real })}
        note={caps.quantitative ? `Optimum for this specimen: ${specimen.leaf.tOpt} °C` : undefined}
      />
      </Aim>
      <Aim on={aim === 'water'}>
      <Dial
        label={v.water.label}
        value={conditions.soilWater * 100}
        display={`${v.water.format(conditions.soilWater * 100)}%`}
        min={v.water.min}
        max={v.water.max}
        step={v.water.step}
        color={v.water.color}
        onChange={(real) => onChange({ soilWater: real / 100 })}
      />
      </Aim>

      <Rule />
      <div className="flex flex-wrap items-center gap-1.5">
        <AtlasButton onClick={onWater} ariaLabel="Water the plant">
          <Droplets className="h-3.5 w-3.5" />
          Water it
        </AtlasButton>
        <Aim on={aim === 'girdle'} inline>
        <AtlasButton
          onClick={() => onGirdle(!conditions.girdled)}
          tone={conditions.girdled ? 'danger' : 'quiet'}
          ariaLabel={conditions.girdled ? 'Heal the phloem ring' : 'Cut the phloem ring'}
        >
          <Scissors className="h-3.5 w-3.5" />
          {conditions.girdled ? 'Heal the ring' : 'Cut the ring'}
        </AtlasButton>
        </Aim>
      </div>
      {conditions.girdled && (
        <p className="mt-2 text-[10.5px] leading-snug font-semibold text-[#9A302A]">
          The phloem is severed. Water still climbs the xylem — sugar stops at the cut.
        </p>
      )}
    </Plate>
  )
}

/* ------------------------------------------------------------------ */
/* Instruments and the measurement loop                               */
/* ------------------------------------------------------------------ */

export function InstrumentPlate({
  sim,
  caps,
  measure,
  xVar,
  trialRunning,
  trialProgress,
  prediction,
  predictionPending,
  lastY,
  tracerActive,
  tracerWatch,
  tracerWatchSeconds,
  onMeasure,
  onXVar,
  onPredict,
  aim = null,
  onRunTrial,
  onTracer,
  onWatch,
  onDemo,
  embedded = false,
}: {
  sim: SugarSim
  caps: BandCaps
  measure: MeasureId
  xVar: SugarVarId
  trialRunning: boolean
  trialProgress: number
  prediction: number | null
  predictionPending: boolean
  lastY: number | null
  tracerActive: boolean
  tracerWatch: 0 | 1 | 2
  tracerWatchSeconds: number
  onMeasure: (m: MeasureId) => void
  onXVar: (v: SugarVarId) => void
  onPredict: (v: number | null) => void
  /** The control the active mission step is pointing at. */
  aim?: MissionTarget | null
  onRunTrial: () => void
  onTracer: () => void
  onWatch: () => void
  onDemo: () => void
  embedded?: boolean
}) {
  const meta = MEASURES[measure]
  const live = sim.solve ? meta.read(sim.solve) : 0
  const predictMax = measure === 'velocity' ? 4 : 60

  return (
    <Plate eyebrow="Instruments" icon={<Beaker className="h-3 w-3" />} className={embedded ? '' : 'w-full'}>
      <PillGroup
        ariaLabel="Instrument"
        size="sm"
        value={measure}
        onChange={onMeasure}
        options={MEASURE_ORDER.map((id) => ({
          id,
          label: caps.vocab === 'simple' ? MEASURES[id].simpleLabel : MEASURES[id].label,
          title: MEASURES[id].instrument,
        }))}
      />

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold text-[#8B8471]">Reading now</span>
        <span className="atlas-serif text-[19px] leading-none font-semibold tabular-nums text-[#2A2823]">
          {live.toFixed(meta.decimals)}
          <span className="ml-1 text-[11px] font-bold text-[#8B8471]">{meta.unit}</span>
        </span>
      </div>
      <p className="mt-1 text-[10.5px] leading-snug font-semibold text-[#9A9482]">{meta.instrument}</p>

      {caps.controlledVariables && (
        <>
          <Rule />
          <span className="atlas-eyebrow">Investigating</span>
          <div className="mt-1">
            <Aim on={aim === 'xvar'}>
            <PillGroup
              ariaLabel="Independent variable"
              size="sm"
              value={xVar}
              onChange={onXVar}
              options={SUGAR_VAR_ORDER.map((id) => ({
                id,
                label: caps.vocab === 'simple' ? SUGAR_VARS[id].simpleLabel : SUGAR_VARS[id].label,
              }))}
            />
            </Aim>
          </div>
          <p
            className="mt-1 text-[10.5px] leading-snug font-semibold text-[#9A9482]"
            title="Change a control mid-trial and the average would not belong to any one set of conditions, so the reading is discarded."
          >
            Everything else is a control — hold them still.
          </p>
        </>
      )}

      {caps.prediction !== 'none' && (
        <>
          <Rule />
          <div className="flex items-baseline justify-between">
            <span className="atlas-eyebrow">Prediction</span>
            {prediction !== null ? (
              <Chip tone="good">
                {prediction.toFixed(meta.decimals)} {meta.unit}
              </Chip>
            ) : (
              // The dial *shows* the live reading when nothing is committed,
              // which looks exactly like an answer already given. Say plainly
              // that it is not one yet.
              <Chip tone="warn">not set</Chip>
            )}
          </div>
          {/*
            Everyone gets the dial.
            Committing to a number is the whole habit the measurement loop is
            built to teach, and the younger band had been handed three buttons
            instead — which asks for a *direction*, not a prediction, and gives
            the learner nothing to be right or wrong about on the graph. What
            the younger band actually needed was not a different question but a
            way in: the three chips now *set the dial* rather than replace it,
            so "a bit higher than last time" is one tap that lands somewhere
            visible and can then be nudged.
          */}
          <Aim on={aim === 'predict'}>
            <div className="mt-1">
              <Dial
                label="Predicted reading"
                value={prediction ?? live}
                display={`${(prediction ?? live).toFixed(meta.decimals)} ${meta.unit}`}
                min={0}
                max={predictMax}
                step={measure === 'velocity' ? 0.05 : 0.5}
                color="#2E6DA8"
                onChange={(v) => onPredict(v)}
              />
            </div>
            {lastY !== null && (
              <div className="mt-1 flex items-center gap-1">
                <span className="mr-0.5 text-[10px] font-extrabold tracking-[0.08em] text-[#B3AB97] uppercase">
                  vs last
                </span>
                {(
                  [
                    ['Higher', 1.3],
                    ['Same', 1],
                    ['Lower', 0.7],
                  ] as Array<[string, number]>
                ).map(([label, k]) => (
                  <AtlasButton
                    key={label}
                    onClick={() => onPredict(Math.min(predictMax, Math.max(0, lastY * k)))}
                    ariaLabel={`Predict ${label.toLowerCase()}`}
                    className="flex-1"
                  >
                    {label}
                  </AtlasButton>
                ))}
              </div>
            )}
          </Aim>
          {prediction === null && lastY === null && (
            <p className="mt-1 text-[10.5px] leading-snug font-semibold text-[#9A9482]">
              Move the slider to where you think the needle will land. You will see how close you got the
              moment the trial ends.
            </p>
          )}
        </>
      )}

      <Rule />
      <div className="flex flex-wrap items-center gap-1.5">
        <Aim on={aim === 'run'} inline>
        <AtlasButton
          onClick={onRunTrial}
          tone="primary"
          disabled={trialRunning}
          invite={!trialRunning && !predictionPending}
          ariaLabel="Run measurement"
          className="flex-1"
        >
          <Play className="h-3.5 w-3.5" />
          {trialRunning ? `Measuring… ${Math.round(trialProgress * 100)}%` : 'Run measurement'}
        </AtlasButton>
        </Aim>
        <AtlasButton onClick={onDemo} ariaLabel="Watch the guided demo">
          <Eye className="h-3.5 w-3.5" />
          Watch
        </AtlasButton>
      </div>
      {trialRunning && (
        <div className="mt-1.5">
          <Meter value={trialProgress} color="#3E7C43" />
        </div>
      )}

      <Rule />
      <div className="flex items-baseline justify-between">
        <span className="atlas-eyebrow">Tracer run</span>
        <Chip tone="sugar">{(sim.tracerMarkB - sim.tracerMarkA).toFixed(2)} m between marks</Chip>
      </div>
      <p
        className="mt-1 text-[10.5px] leading-snug font-semibold text-[#9A9482]"
        title="Release a labelled parcel and time it from the green mark to the red one. The stopwatch counts plant seconds, so speed is just distance ÷ time — no hidden conversion."
      >
        Time a labelled parcel between the two marks. The watch counts plant seconds.
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Aim on={aim === 'tracer'} inline>
        <AtlasButton onClick={onTracer} disabled={tracerActive} ariaLabel="Release the tracer" className="flex-1">
          <CircleDot className="h-3.5 w-3.5" />
          {tracerActive ? 'Running…' : 'Release tracer'}
        </AtlasButton>
        </Aim>
        <AtlasButton
          onClick={onWatch}
          tone={tracerWatch === 1 ? 'danger' : 'quiet'}
          ariaLabel="Stopwatch"
          className="min-w-[6.2rem]"
        >
          <Timer className="h-3.5 w-3.5" />
          <span className="tabular-nums">{tracerWatchSeconds.toFixed(0)} s</span>
        </AtlasButton>
      </div>
    </Plate>
  )
}

/* ------------------------------------------------------------------ */
/* Live ledger — where the carbon is going right now                  */
/* ------------------------------------------------------------------ */

export function LedgerPlate({
  sim,
  specimen,
  caps,
  embedded = false,
}: {
  sim: SugarSim
  specimen: Specimen
  caps: BandCaps
  embedded?: boolean
}) {
  const solve = sim.solve
  const rows = useMemo(() => specimen.sinks, [specimen])
  if (!solve) return null

  const fixed = solve.production
  const burnt = solve.wholePlantRespiration
  const exported = solve.exportRate

  return (
    <Plate
      eyebrow="Where the sugar goes"
      icon={<Wind className="h-3 w-3" />}
      className={embedded ? '' : 'w-full'}
    >
      <FactRow label="Made in the leaves" value={`${fixed.toFixed(1)} mg h⁻¹`} tone="#2F6134" />
      <FactRow label="Burnt (whole plant)" value={`${burnt.toFixed(1)} mg h⁻¹`} tone="#9A302A" />
      <FactRow label="Sent down the phloem" value={`${exported.toFixed(1)} mg h⁻¹`} tone="#8A5A0B" />
      {caps.quantitative && (
        <FactRow
          label="Speed of the sap"
          value={`${solve.velocity.toFixed(2)} m h⁻¹`}
          tone="#12496F"
        />
      )}
      {caps.uncertainty && (
        <>
          <FactRow
            label="Pressure gradient"
            value={`${solve.pressureGradient.toFixed(2)} MPa`}
            title="Source turgor minus sink turgor. This is what pushes the column."
          />
          <FactRow
            label="Sieve-tube sucrose"
            value={`${solve.sourceConcentration.toFixed(0)} g L⁻¹`}
          />
        </>
      )}

      <Rule />
      <span className="atlas-eyebrow">The stores</span>
      <div className="mt-1 flex flex-col gap-1.5">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-bold text-[#4A4438]">Leaf starch</span>
            <span className="text-[11px] font-extrabold tabular-nums text-[#8A5A0B]">
              {sim.carbon.leafStarch.toFixed(0)} mg
            </span>
          </div>
          <Meter value={sim.carbon.leafStarch / specimen.starchMax} color="#C9A24A" />
        </div>
        {rows.map((s, i) => (
          <div key={s.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[11px] font-bold text-[#4A4438]">{s.label}</span>
              <span className="shrink-0 text-[11px] font-extrabold tabular-nums text-[#8A5A0B]">
                {Math.round((solve.sinks[i]?.share ?? 0) * 100)}% · {sim.carbon.sinkStore[i].toFixed(0)} mg
              </span>
            </div>
            <Meter value={sim.carbon.sinkStore[i] / s.capacity} />
          </div>
        ))}
      </div>
    </Plate>
  )
}

/* ------------------------------------------------------------------ */
/* Specimen entry — the atlas card                                    */
/* ------------------------------------------------------------------ */

export function SpecimenPlate({
  specimen,
  caps,
  bottleneck,
  embedded = false,
}: {
  specimen: Specimen
  caps: BandCaps
  bottleneck: { label: string; because: string }
  embedded?: boolean
}) {
  return (
    <Plate className={embedded ? '' : 'w-full'}>
      <span className="atlas-eyebrow">{specimen.family}</span>
      <h2 className="atlas-serif text-[26px] leading-none font-semibold text-[#2A2823]">
        {specimen.name}
      </h2>
      <p className="atlas-serif text-[13px] leading-tight text-[#8B8471] italic">{specimen.binomial}</p>
      {/*
        The collection stamp.
        A herbarium sheet always says where the specimen was found, and now that
        the plant is standing in a real habitat rather than on a white disc, the
        plate ought to name it — it turns the scenery from decoration into a
        fact about the organism, and it is the line that explains why the
        prickly pear's numbers look nothing like the bean's.
      */}
      <p className="atlas-collected mt-1.5">{habitatCaption(habitatForSpecimen(specimen.id))}</p>
      <p className="mt-2 text-[11.5px] leading-relaxed font-semibold text-[#5F5A4E]">
        {caps.vocab === 'simple' ? specimen.headline : specimen.blurb}
      </p>

      <Rule />
      <span className="atlas-eyebrow">Key facts</span>
      <div className="mt-0.5">
        {specimen.keyFacts.map(([k, v]) => (
          <FactRow key={k} label={k} value={v} />
        ))}
      </div>

      <Rule />
      <span className="atlas-eyebrow">Holding it back</span>
      <p className="mt-0.5 text-[13px] font-extrabold text-[#2F6134]">{bottleneck.label}</p>
      <p className="mt-0.5 text-[11px] leading-snug font-semibold text-[#8B8471]">{bottleneck.because}</p>
    </Plate>
  )
}

/* ------------------------------------------------------------------ */
/* The stage tool rail                                                */
/* ------------------------------------------------------------------ */

/**
 * The stage's own tool rail — Rotate / Zoom / Vision / Reset, icon over a tiny
 * caption, the way the reference atlas floats its controls beside the plate.
 *
 * It is laid out horizontally rather than down the left edge on purpose: the
 * left edge at mid-height is the one strip that is free in *every* cabinet at
 * both viewports, and the pilot report tab lives there.
 */
export function ToolRail({
  vision,
  autoOrbit,
  habitat,
  showHabitat,
  views,
  viewId,
  onVision,
  onOrbit,
  onHabitat,
  onZoomIn,
  onZoomOut,
  onReset,
  onCardboard,
  onView,
  minimal = false,
}: {
  vision: boolean
  autoOrbit: boolean
  habitat: boolean
  /** The habitat toggle only means anything on the whole-plant stage. */
  showHabitat: boolean
  views: Array<{ id: string; label: string; hint: string }>
  viewId: string
  onVision: () => void
  onOrbit: () => void
  onHabitat: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onCardboard: () => void
  onView: (id: string) => void
  minimal?: boolean
}) {
  const tools: Array<{ label: string; icon: string; on?: boolean; go: () => void; aria: string }> = [
    { label: 'Vision', icon: '◎', on: vision, go: onVision, aria: 'Reaction Vision' },
    // The escape hatch from the scenery, always one press away and never
    // buried in a settings panel: some learners want the plant and nothing else.
    ...(showHabitat
      ? [
          {
            label: habitat ? 'Field' : 'Plate',
            icon: habitat ? '⛰' : '▭',
            on: habitat,
            go: onHabitat,
            aria: habitat ? 'Switch to the plain plate' : 'Show the habitat',
          },
        ]
      : []),
    ...(minimal
      ? []
      : [
          { label: 'Orbit', icon: '↻', on: autoOrbit, go: onOrbit, aria: 'Auto orbit' },
          { label: 'In', icon: '+', go: onZoomIn, aria: 'Zoom in' },
          { label: 'Out', icon: '−', go: onZoomOut, aria: 'Zoom out' },
        ]),
    { label: 'Reset', icon: '⤾', go: onReset, aria: 'Reset view' },
    { label: 'VR', icon: '◫', go: onCardboard, aria: 'Cardboard view' },
  ]
  return (
    <div className="atlas-plate pointer-events-auto flex items-stretch gap-0.5 p-1.5">
      {!minimal &&
        views.map((v) => (
          <Tile
            key={v.id}
            onClick={() => onView(v.id)}
            aria-label={v.label}
            title={v.hint}
            aria-pressed={v.id === viewId}
            data-on={v.id === viewId ? 'true' : 'false'}
            className="atlas-rail-item min-w-[3.4rem]"
          >
            <span className="text-[13px] leading-none">◇</span>
            {v.label}
          </Tile>
        ))}
      {!minimal && <span className="mx-1 w-px self-stretch bg-[#E4DCC9]" />}
      {tools.map((it) => (
        <Tile
          key={it.label}
          onClick={it.go}
          aria-label={it.aria}
          aria-pressed={it.on}
          data-on={it.on ? 'true' : 'false'}
          className="atlas-rail-item min-w-[2.9rem]"
        >
          <span className="text-[15px] leading-none">{it.icon}</span>
          {it.label}
        </Tile>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tip card                                                           */
/* ------------------------------------------------------------------ */

export function TipCard({ stage, onClose }: { stage: StageId; onClose: () => void }) {
  const lines: Record<StageId, string[]> = {
    plant: ['Drag to rotate', 'Scroll to zoom', 'Gold is sugar, blue is water'],
    leaf: ['Grana run on light', 'The cycle runs on CO₂', 'Watch which one stalls first'],
    stem: ['Two pipes, opposite ways', 'Water crosses over at both ends', 'Cut the ring and watch'],
  }
  const note: Record<StageId, string> = {
    plant: 'Whole plant — source, phloem and every sink.',
    leaf: 'Inside one chloroplast, roughly two micrometres across.',
    stem: 'One xylem vessel and one sieve tube, hugely enlarged.',
  }
  return (
    <div className="pointer-events-auto w-[15rem] rounded-[14px] border border-[#EADFB8] bg-[#FBF4DC] p-3 shadow-[0_8px_22px_-14px_rgba(74,62,40,0.3)]">
      <div className="flex items-start justify-between">
        <span className="atlas-serif text-[13px] font-semibold text-[#8A6B22] italic">Tip</span>
        <Tile
          onClick={onClose}
          aria-label="Dismiss tip"
          className="-mt-1 -mr-1 rounded-full px-1.5 text-[13px] font-bold text-[#B09656] hover:text-[#8A6B22]"
        >
          ×
        </Tile>
      </div>
      <ul className="mt-1 space-y-0.5">
        {lines[stage].map((l) => (
          <li key={l} className="text-[11.5px] leading-snug font-semibold text-[#6B5A32]">
            · {l}
          </li>
        ))}
      </ul>
      <div className="my-1.5 h-px bg-[#E7D9AE]" />
      <p className="atlas-serif text-[11px] leading-snug text-[#8A7A4E] italic">{note[stage]}</p>
    </div>
  )
}

export { Thermometer }
