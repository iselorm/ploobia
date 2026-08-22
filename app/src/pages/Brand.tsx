import { Suspense } from 'react'
import { Link } from 'react-router'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import Ploob, { PloobEyes, type PloobMood, type PloobTint } from '@/components/brand/Ploob'
import PloobModel from '@/components/brand/PloobModel'
import Wordmark from '@/components/brand/Wordmark'
import { Tile } from '@/components/ui/tile'

/**
 * `#/brand` — the Ploobia brand sheet, rendered from the live components so it
 * can never drift from the product: the model itself, the flat Ploob in every
 * mood and tint, the wordmark, and the icon at favicon sizes.
 */

const MOODS: { id: PloobMood; label: string; when: string }[] = [
  { id: 'curious', label: 'Curious', when: 'Default. Watching, slightly sideways.' },
  { id: 'delighted', label: 'Delighted', when: 'A reading lands; a mission completes.' },
  { id: 'thinking', label: 'Thinking', when: 'Prediction time; the uncharted map.' },
  { id: 'eureka', label: 'Eureka', when: 'A graph finally makes sense.' },
  { id: 'sleepy', label: 'Sleepy', when: 'Attract mode; empty states.' },
]

const TINTS: { id: PloobTint; label: string; where: string }[] = [
  { id: 'gold', label: 'Gold', where: 'Ploobia itself' },
  { id: 'green', label: 'Green', where: 'The Meadow' },
  { id: 'red', label: 'Red', where: 'The Bloodstream' },
  { id: 'blue', label: 'Blue', where: 'The River Basin · The Yard' },
  { id: 'violet', label: 'Violet', where: 'Uncharted' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="font-mono text-[11px] font-bold tracking-[0.28em] text-[#F5D28C] uppercase">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** One canvas holding the whole tint row — the model itself, not a drawing of it. */
function ModelRow() {
  return (
    <div className="h-[280px] w-full overflow-hidden rounded-[22px] border border-white/10 bg-black/30">
      <Canvas
        dpr={[1, 1.75]}
        camera={{ fov: 26, position: [0, 1.15, 12], near: 0.1, far: 60 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.06
        }}
      >
        <hemisphereLight args={['#FFF6E2', '#5A4632', 1.1]} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} color="#FFEDC0" />
        <directionalLight position={[-4, 2.5, -3]} intensity={0.8} color="#CFE6FF" />
        <Suspense fallback={null}>
          {TINTS.map((t, i) => (
            <PloobModel key={t.id} tint={t.id} position={[(i - 2) * 2.1, 0, 0]} height={1.7} faceCamera={false} rotationY={-0.25} />
          ))}
        </Suspense>
      </Canvas>
    </div>
  )
}

export default function Brand() {
  return (
    <div
      className="hud min-h-[100dvh] px-6 py-10 text-[#FBF5EA] sm:px-10"
      style={{ background: 'radial-gradient(ellipse at 50% -10%, #4A3B2A 0%, transparent 55%), #17130F' }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between">
          <Tile asChild>
            <Link to="/" className="text-[12px] font-extrabold text-white/70 hover:text-white">
              ← Back to the hall
            </Link>
          </Tile>
          <div className="font-mono text-[11px] tracking-widest text-white/50 uppercase">brand sheet · v2</div>
        </div>

        <h1 className="mt-6 text-3xl font-black">Ploobia — mascot &amp; wordmark</h1>
        <p className="mt-2 max-w-2xl text-[14px] font-semibold text-[#E9E1CF]/80">
          Ploob is a Ploobian: a jelly creature with two big eyes, two nub arms and two feet. He has no eyebrows and no
          mouth — everything he feels happens in the eyes. The two o’s in the name are those eyes.
        </p>

        <Section title="The model — ploob.glb, tinted by region">
          <ModelRow />
          <div className="mt-3 grid grid-cols-5 gap-2 text-center">
            {TINTS.map((t) => (
              <div key={t.id}>
                <div className="text-[13px] font-black">{t.label}</div>
                <div className="text-[10.5px] leading-snug font-semibold text-white/55">{t.where}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Flat Ploob — expressions">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {MOODS.map((m) => (
              <div key={m.id} className="flex flex-col items-center rounded-[22px] border border-white/10 bg-black/30 p-4 text-center">
                <Ploob size={108} mood={m.id} />
                <div className="mt-2 text-[14px] font-black">{m.label}</div>
                <div className="mt-1 text-[11.5px] leading-snug font-semibold text-white/60">{m.when}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Flat Ploob — region tints">
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
            {TINTS.map((t) => (
              <div key={t.id} className="flex flex-col items-center rounded-[22px] border border-white/10 bg-black/30 p-4 text-center">
                <Ploob size={100} tint={t.id} mood="delighted" />
                <div className="mt-2 text-[13px] font-black">{t.label}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Wordmark">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col items-center justify-center gap-3 rounded-[22px] border border-white/10 bg-black/30 p-8">
              <Wordmark size={80} />
              <div className="font-mono text-[10px] tracking-widest text-white/50 uppercase">on dark · gold gradient</div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 rounded-[22px] bg-[#FBF5EA] p-8">
              <Wordmark size={80} gradient={false} />
              <div className="font-mono text-[10px] tracking-widest text-[#7A5252] uppercase">on light · ink</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-8 rounded-[22px] border border-white/10 bg-black/30 p-6">
            <Wordmark size={40} />
            <Wordmark size={28} />
            <Wordmark size={20} />
            <div className="ml-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black tracking-widest text-white/70 uppercase">
              <PloobEyes size={14} /> Ploobia · the school arcade
            </div>
          </div>
        </Section>

        <Section title="Icon — the eyes at favicon sizes">
          <div className="flex flex-wrap items-end gap-8 rounded-[22px] border border-white/10 bg-black/30 p-6">
            {[128, 64, 48, 32, 16].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center rounded-[22%] bg-[#17130F] ring-1 ring-white/10" style={{ width: s, height: s }}>
                  <PloobEyes size={s * 0.42} />
                </div>
                <div className="font-mono text-[10px] text-white/50">{s}px</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Rules">
          <ul className="grid gap-2 text-[13px] font-semibold text-[#E9E1CF]/85 sm:grid-cols-2">
            <li className="rounded-2xl border border-white/10 bg-black/30 p-4">Ploob is jelly: translucent, glossy, a little wobbly. Never matte, never plastic.</li>
            <li className="rounded-2xl border border-white/10 bg-black/30 p-4">No eyebrows, no mouth. Mood lives entirely in the eyes, so 2D and 3D stay the same creature.</li>
            <li className="rounded-2xl border border-white/10 bg-black/30 p-4">Body tint follows the region; the eyes never change colour.</li>
            <li className="rounded-2xl border border-white/10 bg-black/30 p-4">Ploob explains by <em>becoming</em> things — a bubble, a raindrop, an ion — never by pointing at a caption.</li>
            <li className="rounded-2xl border border-white/10 bg-black/30 p-4">Wordmark: Nunito 900, tight tracking, the o’s are always the eyes. Gold on dark, ink on light.</li>
            <li className="rounded-2xl border border-white/10 bg-black/30 p-4">Idle motion is a slow squish and a blink. Nothing bounces around a screen a learner is measuring on.</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
