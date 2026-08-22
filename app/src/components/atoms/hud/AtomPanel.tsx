import { Eye, Flame, MapPin, Minus, PlayCircle, Plus, RotateCcw, Zap } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { useBandCaps, t } from '@/lib/bands'
import {
  addressLogic,
  CATEGORY_META,
  commonNeutrons,
  ELEMENT_BY_Z,
  gripScale,
  gripWord,
  MAX_Z,
  roomInOuterShell,
  shellDetail,
  shellsFor,
  stabilityOf,
  type Stability,
} from '@/lib/atoms'

export interface AtomStatus {
  probing: boolean
  placing: boolean
  lastGrip: number | null
  predicted: number | null
}

export interface BuildState {
  protons: number
  neutrons: number
  electrons: number
}

interface Props {
  build: BuildState
  status: AtomStatus
  cloudView: boolean
  notice: string | null
  onChange: (patch: Partial<BuildState>) => void
  onProbe: () => void
  onForge: () => void
  onPredict: (v: number | null) => void
  onReset: () => void
  onDemo: () => void
  onCloud: (on: boolean) => void
  embedded?: boolean
}

const STABILITY_COPY: Record<Stability, { label: string; cls: string }> = {
  stable: { label: 'stable', cls: 'bg-[#EAF3E6] text-[#2E7D32]' },
  unstable: { label: 'wobbling', cls: 'bg-[#FBEBD2] text-[#B97D10]' },
  wild: { label: 'flying apart', cls: 'bg-[#F6DEDC] text-[#C13B33]' },
}

function ParticleRow({
  label,
  sub,
  color,
  value,
  max,
  onSet,
  addLabel,
  removeLabel,
}: {
  label: string
  sub: string
  color: string
  value: number
  max: number
  onSet: (v: number) => void
  addLabel: string
  removeLabel: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black" style={{ background: `${color}26`, color }}>
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold text-[#5C3A3A]">{sub}</span>
      <Tile round aria-label={removeLabel} disabled={value <= 0} onClick={() => onSet(Math.max(0, value - 1))} className="flex items-center justify-center rounded-full bg-[#F3E9D7] text-[#7A5252] transition-all hover:bg-[#EBDFC8] active:scale-90 disabled:opacity-35">
        <Minus className="h-4 w-4" />
      </Tile>
      <span className="w-7 text-center text-[15px] font-black text-[#402222] tabular-nums">{value}</span>
      <Tile round aria-label={addLabel} disabled={value >= max} onClick={() => onSet(Math.min(max, value + 1))} className="flex items-center justify-center rounded-full text-[#FBF5EA] transition-all active:scale-90 disabled:opacity-35" style={{ background: color }}>
        <Plus className="h-4 w-4" />
      </Tile>
    </div>
  )
}

/**
 * The shell meter — the single most important readout in the cabinet.
 *
 * Every shell shows its occupancy AND its ceiling (2, then 8, then 8), because
 * "how many fit in the outer shell" is precisely what fixes the atom's column,
 * and "how many shells are in use" fixes its row. The address block spells that
 * inference out rather than leaving the learner to guess it.
 */
function ShellMeter({ electrons, formal, neutral }: { electrons: number; formal: boolean; neutral: boolean }) {
  const rows = shellDetail(electrons)
  const room = roomInOuterShell(electrons)
  // An ion has no address of its own — the wall catalogues neutral atoms — so
  // the derivation block appears only once the charge balances.
  const addr = neutral ? addressLogic(electrons) : null

  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-[#F3E9D7] bg-white/55 p-2">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className="text-[10.5px] font-black tracking-wide text-[#7A5252] uppercase">{formal ? 'Electron shells' : 'The rings'}</span>
        <span className="text-[9.5px] font-bold text-[#B08A7A]">seats: 2, then 8s</span>
      </div>

      {rows.map((s) => (
        <div key={s.n} className={`flex items-center gap-1.5 rounded-[8px] px-1 ${s.outer ? 'bg-[#DFF3FA] py-0.5' : ''}`}>
          <span className={`w-9 shrink-0 text-[10px] font-extrabold ${s.outer ? 'text-[#177E9C]' : 'text-[#B08A7A]'}`}>
            {formal ? `n=${s.n}` : `ring ${s.n}`}
          </span>
          {/* one pip per available seat — the ceiling is visible, not implied */}
          <span className="flex min-w-0 flex-1 items-center gap-[2.5px]">
            {Array.from({ length: s.cap }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full border ${i < s.count ? 'border-[#1E9BBF] bg-[#63E0FF]' : 'border-[#D9C9AE] bg-transparent'}`}
              />
            ))}
          </span>
          <span className={`w-9 shrink-0 text-right text-[10.5px] font-black tabular-nums ${s.full ? 'text-[#2E7D32]' : s.outer ? 'text-[#177E9C]' : 'text-[#7A5252]'}`}>
            {s.count}/{s.cap}
          </span>
        </div>
      ))}

      {room !== null && (
        <p className="px-1 text-[10.5px] leading-snug font-bold text-[#5C3A3A]">
          {room === 0 ? (
            <>
              Outer shell <span className="text-[#2E7D32]">FULL</span> — the next electron starts a new ring.
            </>
          ) : (
            <>
              Room for <span className="text-[#177E9C] tabular-nums">{room}</span> more in the outer shell.
            </>
          )}
        </p>
      )}

      {addr && (
        <div className="rounded-[8px] bg-[#FBEBD2]/70 px-2 py-1">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0 text-[#B97D10]" />
            <span className="text-[10.5px] font-black text-[#7A5E1E]">
              Address: row {addr.row} · column {addr.col}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug font-bold text-[#8A6A3A]">
            {addr.colWhy} → col {addr.col}
            {addr.outerFull && addr.col === 8 ? ' (full-shell column)' : ''} · {addr.rowWhy} → row {addr.row}
          </p>
        </div>
      )}
    </div>
  )
}

export default function AtomPanel({ build, status, cloudView, notice, onChange, onProbe, onForge, onPredict, onReset, onDemo, onCloud, embedded = false }: Props) {
  const caps = useBandCaps()
  const { protons, neutrons, electrons } = build
  const el = ELEMENT_BY_Z[protons]
  const charge = protons - electrons
  const stability = protons > 0 ? stabilityOf(protons, neutrons) : 'stable'
  const shells = shellsFor(electrons)
  const neutral = protons > 0 && charge === 0
  const canForge = neutral && stability === 'stable' && !status.probing && !status.placing
  const canProbe = neutral && !status.probing && !status.placing

  const forgeHint = !el
    ? t({ simple: 'Add a proton to begin — one proton IS an atom of hydrogen.', formal: 'Add a proton to begin — the proton count defines the element.' }, caps)
    : charge !== 0
      ? t({ simple: `Balance the charge: ${charge > 0 ? 'add' : 'remove'} ${Math.abs(charge)} electron${Math.abs(charge) === 1 ? '' : 's'}.`, formal: `Neutral atoms only: charge is ${charge > 0 ? '+' : ''}${charge}.` }, caps)
      : stability !== 'stable'
        ? t(
            { simple: `The nucleus is shaking! Try ${el.a - el.z} neutrons.`, formal: `That isotope is unstable — a stable ${el.name} nucleus has ${el.stableN.join(' or ')} neutrons.` },
            caps,
          )
        : null

  return (
    <div className={embedded ? 'pointer-events-auto flex w-full flex-col gap-2 py-1' : 'pointer-events-auto flex max-h-full w-full max-w-[19.5rem] flex-col gap-2 overflow-y-auto rounded-[20px] border border-[#F3E9D7] bg-[#FBF5EA]/95 p-3 shadow-xl backdrop-blur-md'}>
      {/* nameplate */}
      <div className="flex items-center gap-2.5 rounded-[14px] bg-[#F3E9D7]/70 px-3 py-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-lg font-black" style={el ? { background: `${CATEGORY_META[el.category].tint}33`, color: CATEGORY_META[el.category].tint } : { background: '#E9DCC5', color: '#B08A7A' }}>
          {el ? el.symbol : '—'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-extrabold text-[#402222]">{el ? el.name : 'Empty stage'}</div>
          <div className="text-[10.5px] font-bold text-[#7A5252]">
            {el ? (
              <>
                Z {protons}
                {caps.isotopes && <> · A {protons + neutrons}</>}
                {shells.length > 0 && <> · shells {shells.join('·')}</>}
              </>
            ) : (
              t({ simple: 'Tap a crucible or the + buttons.', formal: 'Add particles to forge an atom.' }, caps)
            )}
          </div>
        </div>
        {el && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${charge === 0 ? 'bg-[#EAF3E6] text-[#2E7D32]' : charge > 0 ? 'bg-[#F6DEDC] text-[#C13B33]' : 'bg-[#DCE9F6] text-[#2E6DA8]'}`}>
            {charge === 0 ? t({ simple: 'balanced', formal: 'neutral' }, caps) : charge > 0 ? `ion +${charge}` : `ion ${charge}`}
          </span>
        )}
      </div>
      {el && caps.isotopes && (
        <div className="-mt-1 flex items-center gap-1.5 px-1">
          <span className="text-[10.5px] font-bold text-[#7A5252]">{t({ simple: 'Nucleus:', formal: 'Nucleus:' }, caps)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${STABILITY_COPY[stability].cls}`}>{STABILITY_COPY[stability].label}</span>
        </div>
      )}

      {/* shell meter — capacities, room left, and the address they imply */}
      {electrons > 0 && <ShellMeter electrons={electrons} formal={caps.vocab !== 'simple'} neutral={neutral} />}

      {/* particle controls */}
      <div className="flex flex-col gap-2 rounded-[14px] border border-[#F3E9D7] bg-white/50 p-2.5">
        <ParticleRow label="p⁺" sub={t({ simple: 'protons (the name-givers)', formal: 'protons' }, caps)} color="#C97F1F" value={protons} max={MAX_Z} addLabel="Add proton" removeLabel="Remove proton" onSet={(v) => onChange({ protons: v })} />
        {caps.isotopes && (
          <ParticleRow label="n⁰" sub={t({ simple: 'neutrons (the glue)', formal: 'neutrons' }, caps)} color="#75808E" value={neutrons} max={30} addLabel="Add neutron" removeLabel="Remove neutron" onSet={(v) => onChange({ neutrons: v })} />
        )}
        <ParticleRow label="e⁻" sub={t({ simple: 'electrons (the doers)', formal: 'electrons' }, caps)} color="#1E9BBF" value={electrons} max={MAX_Z} addLabel="Add electron" removeLabel="Remove electron" onSet={(v) => onChange({ electrons: v })} />
        {!caps.isotopes && el && <p className="px-1 text-[10.5px] leading-snug font-semibold text-[#B08A7A]">Neutrons load themselves here ({commonNeutrons(protons)} for {el.name}) — switch to Scientist to play with them.</p>}
      </div>

      {/* prediction */}
      {caps.prediction === 'point' && (
        <div className="flex flex-col gap-1.5 rounded-[14px] border border-[#F3E9D7] bg-white/50 p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-black tracking-wide text-[#7A5252] uppercase">{t({ simple: 'Call it first', formal: 'Predict the grip' }, caps)} — before you probe</span>
            {status.predicted !== null && (
              <button onClick={() => onPredict(null)} className="text-[10px] font-extrabold text-[#B08A7A] hover:text-[#7A5252]">clear</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={2500}
              step={10}
              aria-label="Predicted grip"
              value={status.predicted ?? 1000}
              onChange={(e) => onPredict(Number(e.target.value))}
              className="h-1.5 min-w-0 flex-1 accent-[#B97D10]"
            />
            <span className="w-20 shrink-0 text-right text-[11.5px] font-black text-[#402222] tabular-nums">
              {status.predicted === null ? '—' : `${status.predicted} kJ/mol`}
            </span>
          </div>
        </div>
      )}

      {/* instruments */}
      <div className="flex flex-col gap-2">
        <Tile
          aria-label="Fire the grip probe"
          disabled={!canProbe}
          onClick={onProbe}
          className={`flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-extrabold transition-all ${canProbe ? 'bg-[#1E9BBF] text-white shadow hover:bg-[#177E9C] active:scale-[0.97]' : 'bg-[#F3E9D7] text-[#B08A7A]'}`}
        >
          <Zap className="h-4 w-4" />
          {status.probing ? 'Probing…' : t({ simple: 'Test the grip', formal: 'Fire the grip probe' }, caps)}
        </Tile>
        <p className="-mt-0.5 px-2 text-center text-[10.5px] leading-snug font-semibold text-[#B08A7A]">
          {t(
            {
              simple: 'Tugs the outer electron to show how hard the atom holds on.',
              formal: 'Reads the energy to pull the outer electron free (kJ/mol).',
              technical: 'First ionisation energy — per mole of gaseous atoms (kJ/mol).',
            },
            caps,
          )}
        </p>
        {status.lastGrip !== null && (
          <p className="px-1 text-center text-[11.5px] font-bold text-[#5C3A3A]">
            {caps.quantitative ? (
              <>Last reading: <span className="font-black text-[#177E9C] tabular-nums">{status.lastGrip} kJ/mol</span></>
            ) : (
              <>Grip {gripScale(status.lastGrip)} / 10 — <span className="font-black text-[#177E9C]">{gripWord(status.lastGrip)}</span></>
            )}
          </p>
        )}
        <Tile
          aria-label="Forge into the wall"
          disabled={!canForge}
          onClick={onForge}
          className={`flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-extrabold transition-all ${canForge ? 'bg-[#B97D10] text-white shadow-[0_0_18px_rgba(232,163,61,0.75)] ring-4 ring-[#E8A33D]/50 hover:bg-[#95650C] active:scale-[0.97]' : 'bg-[#F3E9D7] text-[#B08A7A]'}`}
        >
          <Flame className="h-4 w-4" />
          {status.placing ? 'Forging…' : 'Forge into the wall'}
        </Tile>
        {forgeHint && <p className="px-1 text-center text-[11px] leading-snug font-semibold text-[#B08A7A]">{forgeHint}</p>}
        {notice && <p className="notice-pop px-1 text-center text-[11.5px] leading-snug font-bold text-[#C13B33]">{notice}</p>}
      </div>

      {/* extras */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-[#F3E9D7] pt-2">
        {caps.electronCloud && (
          <Tile
            aria-pressed={cloudView}
            aria-label="Toggle electron cloud view"
            onClick={() => onCloud(!cloudView)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold transition-all ${cloudView ? 'bg-[#1E9BBF] text-white' : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'}`}
          >
            <Eye className="h-3.5 w-3.5" />
            {cloudView ? 'Cloud view' : 'Ring view'}
          </Tile>
        )}
        <Tile aria-label="Clear the stage" onClick={onReset} className="flex items-center gap-1.5 rounded-full bg-[#F3E9D7] px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] transition-all hover:bg-[#EBDFC8]">
          <RotateCcw className="h-3.5 w-3.5" />
          Clear stage
        </Tile>
        <Tile aria-label="Watch the demo" onClick={onDemo} className="flex items-center gap-1.5 rounded-full bg-[#F3E9D7] px-3 py-1.5 text-[11px] font-extrabold text-[#7A5252] transition-all hover:bg-[#EBDFC8]">
          <PlayCircle className="h-3.5 w-3.5" />
          Demo
        </Tile>
      </div>
    </div>
  )
}
