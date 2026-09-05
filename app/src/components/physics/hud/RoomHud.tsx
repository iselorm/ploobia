import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Slider } from '@/components/ui/slider'
import { Tile } from '@/components/ui/tile'
import { dialTick, startAudio } from '@/lib/audio'
import { WORLDS, type WorldId } from '@/lib/motion'
import {
  A3_SPEED_MAX,
  A3_SPEED_MIN,
  A5_MAX_TEAM,
  EPISODES,
  FLOORS,
  playHint,
  type Beat,
  type EpisodeId,
  type PhysicsSim,
  type SentenceTile,
  type Vocab,
} from '@/lib/physics'

/**
 * The room's HUD: a coach chip that names the one next action, the beat's
 * tiles beneath it, and — only during Play — the episode's one dial. The
 * busy budget is three interactive things on screen; this component is
 * where that budget is spent, so it is deliberately small.
 */

/* ------------------------------------------------------------------ */
/* Coach chip                                                         */
/* ------------------------------------------------------------------ */

export function Coach({ text, hint, tone = 'go' }: { text: string; hint?: string; tone?: 'go' | 'ask' | 'done' }) {
  const mark = tone === 'ask' ? '?' : tone === 'done' ? '✓' : '→'
  const bg = tone === 'ask' ? 'bg-[#FBEBD2] text-[#8A5A0B]' : tone === 'done' ? 'bg-[#DDEBD9] text-[#2F6134]' : 'bg-[#D9E6F2] text-[#2E6DA8]'
  return (
    <div className="fp-plate fp-rise pointer-events-none flex max-w-[min(34rem,calc(100vw-1.5rem))] items-center gap-2.5 px-4 py-2.5" data-coach="">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${bg}`}>{mark}</span>
      <div className="min-w-0">
        <p className="text-[13.5px] leading-snug font-extrabold text-[#2A2823]">{text}</p>
        {hint ? <p className="text-[11.5px] leading-snug font-semibold text-[#8B8471]">{hint}</p> : null}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Small controls                                                     */
/* ------------------------------------------------------------------ */

function Big({ children, onClick, tone = 'go', disabled, ...rest }: { children: ReactNode; onClick?: () => void; tone?: 'go' | 'quiet'; disabled?: boolean } & Record<string, unknown>) {
  const cls = tone === 'go' ? 'bg-[#2E6DA8] text-[#FBF5EA] hover:bg-[#245685]' : 'bg-[#FCFAF4] text-[#2A2823] border border-[#E4DCC9] hover:bg-white'
  return (
    <Tile onClick={onClick} disabled={disabled} className={`rounded-full px-5 py-2.5 text-[13px] font-extrabold shadow-lg transition-all active:scale-95 disabled:opacity-40 ${cls}`} {...rest}>
      {children}
    </Tile>
  )
}

/** Segmented notches — the dial for A6's floor and A7's world. */
function Notches<T extends string>({ label, options, value, onChange, testId }: { label: string; options: Array<{ id: T; label: string; swatch?: string }>; value: T; onChange: (id: T) => void; testId: string }) {
  return (
    <div className="fp-plate flex flex-col gap-1.5 px-3 py-2" data-dial={testId} data-interactive="">
      <span className="text-[10.5px] font-black tracking-[0.12em] text-[#8B8471] uppercase">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <Tile
            key={o.id}
            onClick={() => {
              if (o.id !== value) {
                dialTick()
                onChange(o.id)
              }
            }}
            aria-pressed={o.id === value}
            aria-label={o.label}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-extrabold transition-all ${o.id === value ? 'border-[#2E6DA8] bg-[#D9E6F2] text-[#2E6DA8]' : 'border-[#E4DCC9] bg-white text-[#4A4438] hover:border-[#B8B1A0]'}`}
          >
            {o.swatch && <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: o.swatch }} />}
            {o.label}
          </Tile>
        ))}
      </div>
    </div>
  )
}

/** Stopwatch: taps are stamped on pointerdown; the click that follows is swallowed. */
function Stopwatch({ elapsed, running, onTap, onReset, feedback, armed = false }: { elapsed: number; running: boolean; onTap: () => void; onReset: () => void; feedback: string | null; armed?: boolean }) {
  const lastDown = useRef(0)
  return (
    <div className="fp-plate flex items-center gap-2 px-3 py-2" data-dial="stopwatch" data-interactive="">
      <Tile
        onPointerDown={(e) => {
          lastDown.current = performance.now()
          e.preventDefault()
          onTap()
        }}
        onClick={() => {
          if (performance.now() - lastDown.current < 400) return
          onTap()
        }}
        aria-label={running ? 'Stop the stopwatch' : 'Start the stopwatch'}
        className={`flex min-w-[8.5rem] items-center justify-center gap-2 rounded-full px-4 py-2.5 font-mono text-[18px] font-bold tabular-nums shadow transition-all active:scale-95 ${running ? 'bg-[#C13B33] text-[#FBF5EA]' : 'bg-[#3E7C43] text-[#FBF5EA]'}`}
      >
        <span className="text-[10px] font-black tracking-widest uppercase">{running ? 'Stop' : armed ? 'Start race' : 'Start'}</span>
        {elapsed.toFixed(2)} s
      </Tile>
      <Tile onClick={onReset} aria-label="Reset the stopwatch" className="rounded-full border border-[#E4DCC9] bg-white px-3 py-2 text-[11px] font-extrabold text-[#4A4438]">
        Reset
      </Tile>
      {feedback && <span className="text-[11px] font-bold text-[#8B8471]">{feedback}</span>}
    </div>
  )
}

/** One tug-of-war team's counter. */
function Team({ side, color, count, running, onChange }: { side: 'left' | 'right'; color: string; count: number; running: boolean; onChange: (n: number) => void }) {
  return (
    <div className="fp-plate flex items-center gap-1.5 px-2.5 py-1.5" data-dial={`team-${side}`} data-interactive="">
      <span className="text-[10.5px] font-black tracking-[0.12em] uppercase" style={{ color }}>
        {side}
      </span>
      <Tile onClick={() => (dialTick(), onChange(count - 1))} disabled={running || count <= 0} aria-label={`Fewer on the ${side}`} className="rounded-full border border-[#E4DCC9] bg-white px-2.5 py-1 text-[14px] font-black text-[#4A4438]">
        −
      </Tile>
      <span className="w-4 text-center font-mono text-[15px] font-bold tabular-nums">{count}</span>
      <Tile onClick={() => (dialTick(), onChange(count + 1))} disabled={running || count >= A5_MAX_TEAM} aria-label={`More on the ${side}`} className="rounded-full border border-[#E4DCC9] bg-white px-2.5 py-1 text-[14px] font-black text-[#4A4438]">
        +
      </Tile>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The one dial per episode                                           */
/* ------------------------------------------------------------------ */

export interface DialHandlers {
  go: () => void
  tapWatch: () => void
  resetWatch: () => void
  setSpeed: (v: number) => void
  run: () => void
  setTeam: (side: 'left' | 'right', n: number) => void
  setFloor: (i: number) => void
  push: () => void
  setWorld: (w: WorldId) => void
  drop: () => void
  resetDrop: () => void
}

interface DialProps {
  sim: PhysicsSim
  episode: EpisodeId
  vocab: Vocab
  extraWorlds: boolean
  h: DialHandlers
  /** Poll counter from the page so the dial re-renders with the sim. */
  tick: number
}

export function Dial({ sim, episode, vocab, extraWorlds, h }: DialProps) {
  const s = vocab === 'simple'
  switch (episode) {
    case 'a1':
      return null
    case 'a2': {
      const a = sim.a2
      const fb = a.lap !== null ? (s ? `You timed it: ${a.lap.toFixed(2)} s` : `Lap: ${a.lap.toFixed(2)} s over 4.0 m`) : null
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Stopwatch elapsed={a.swElapsed} running={a.swRunning} onTap={h.tapWatch} onReset={h.resetWatch} feedback={fb} armed={!a.swRunning && !a.running} />
        </div>
      )
    }
    case 'a3': {
      const a = sim.a3
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="fp-plate w-[min(18rem,calc(100vw-9rem))] px-4 py-2" data-dial="speed" data-interactive="">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[10.5px] font-black tracking-[0.12em] text-[#8B8471] uppercase">{s ? 'How fast' : 'Speed'}</span>
              <span className="font-mono text-[12px] font-bold text-[#2E6DA8] tabular-nums">{s ? (a.speed < 0.8 ? 'slow' : a.speed < 1.5 ? 'medium' : 'fast') : `${a.speed.toFixed(1)} m/s`}</span>
            </div>
            <Slider
              value={[a.speed]}
              min={A3_SPEED_MIN}
              max={A3_SPEED_MAX}
              step={s ? 0.5 : 0.1}
              onValueChange={(v) => {
                dialTick()
                h.setSpeed(v[0])
              }}
              aria-label="Speed"
              className="[&_[data-slot=slider-range]]:bg-[#2E6DA8] [&_[data-slot=slider-thumb]]:border-[#2E6DA8] [&_[data-slot=slider-track]]:bg-[#E7E1D2]"
            />
          </div>
          <Big onClick={h.run} disabled={a.running} data-dial="run">
            {a.t === 0 ? 'Run' : 'Run again'}
          </Big>
        </div>
      )
    }
    case 'a4':
      return null
    case 'a5': {
      const a = sim.a5
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Team side="left" color="#2E6DA8" count={a.left} running={a.running} onChange={(n) => h.setTeam('left', n)} />
          <Big onClick={h.go} disabled={a.running || a.left + a.right === 0} data-dial="go">
            Go
          </Big>
          <Team side="right" color="#B97D10" count={a.right} running={a.running} onChange={(n) => h.setTeam('right', n)} />
        </div>
      )
    }
    case 'a6': {
      const a = sim.a6
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Notches
            label={s ? 'The floor' : 'Surface'}
            testId="floor"
            options={FLOORS.map((f, i) => ({ id: String(i), label: f.label[vocab], swatch: f.color }))}
            value={String(a.floor)}
            onChange={(id) => h.setFloor(Number(id))}
          />
          <Big onClick={h.push} disabled={a.sliding} data-dial="push">
            Push
          </Big>
        </div>
      )
    }
    case 'a7': {
      const a = sim.a7
      const worlds = WORLDS.filter((w) => extraWorlds || (w.id !== 'jupiter' && w.id !== 'sun'))
      return (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Notches label={s ? 'Which world' : 'World'} testId="world" options={worlds.map((w) => ({ id: w.id, label: vocab === 'technical' ? `${w.label} · ${w.g} N/kg` : w.label }))} value={sim.world} onChange={(id) => h.setWorld(id as WorldId)} />
          {a.landedAt[0] === null ? (
            <Big onClick={h.drop} disabled={a.dropping} data-dial="drop">
              Drop
            </Big>
          ) : (
            <Big onClick={h.resetDrop} tone="quiet" data-dial="reset-drop">
              Put them back
            </Big>
          )}
        </div>
      )
    }
  }
}

/* ------------------------------------------------------------------ */
/* The beat strip                                                     */
/* ------------------------------------------------------------------ */

interface StripProps {
  sim: PhysicsSim
  beat: Beat
  vocab: Vocab
  extraWorlds: boolean
  h: DialHandlers
  tick: number
  onPredict: (id: string) => void
  onNoticed: () => void
  onSay: (tile: SentenceTile) => void
  sentences: SentenceTile[]
  said: 'right' | 'swapped' | 'wrong' | null
  onNext: () => void
  hasNext: boolean
  missing: EpisodeId[]
  onGoTo: (id: EpisodeId) => void
  /** Meet beat: which orientation step is up, and how to advance. */
  meetStep: number
  onMeetNext: () => void
}

export function BeatStrip({ sim, beat, vocab, extraWorlds, h, tick, onPredict, onNoticed, onSay, sentences, said, onNext, hasNext, missing, onGoTo, meetStep, onMeetNext }: StripProps) {
  const ep = EPISODES[sim.episode]
  const [shake, setShake] = useState<string | null>(null)
  useEffect(() => {
    startAudio()
  }, [])

  if (missing.length) {
    const first = missing[0]
    return (
      <div className="flex flex-col items-center gap-2">
        <Coach tone="ask" text={vocab === 'simple' ? `Do "${EPISODES[first].title.simple}" first.` : `This one builds on "${EPISODES[first].title[vocab]}" — do that first.`} />
        <Big onClick={() => onGoTo(first)} data-goto={first}>
          Go there
        </Big>
      </div>
    )
  }

  switch (beat) {
    case 'arrive':
      return <Coach text={ep.title[vocab]} hint={vocab === 'simple' ? 'Have a look at what is on the floor.' : 'Meet the object first.'} />
    case 'meet': {
      const step = ep.meet[Math.min(meetStep, ep.meet.length - 1)]
      const last = meetStep >= ep.meet.length - 1
      return (
        <div className="flex flex-col items-center gap-2" data-meet-step={meetStep}>
          <Coach text={step.say[vocab]} />
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1" aria-hidden="true">
              {ep.meet.map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === meetStep ? 'bg-[#2E6DA8]' : 'bg-[#C9C2B2]'}`} />
              ))}
            </span>
            <Big onClick={onMeetNext} data-meet-next="">
              {last ? (vocab === 'simple' ? 'Got it — let me guess' : 'Got it — predict') : 'Next'}
            </Big>
          </div>
        </div>
      )
    }
    case 'predict':
      return (
        <div className="flex flex-col items-center gap-2">
          <Coach tone="ask" text={ep.predict.prompt[vocab]} hint={vocab === 'simple' ? 'Guess first. Then find out.' : 'Commit a prediction before anything moves.'} />
          <div className="flex flex-wrap justify-center gap-2" data-predict="">
            {ep.predict.options.map((o) => (
              <Big key={o.id} tone="quiet" onClick={() => onPredict(o.id)} data-option={o.id}>
                {o.label[vocab]}
              </Big>
            ))}
          </div>
        </div>
      )
    case 'play':
      return (
        <div className="flex flex-col items-center gap-2">
          <Coach text={playHint(sim, vocab)} hint={ep.instruction[vocab]} />
          <Dial sim={sim} episode={sim.episode} vocab={vocab} extraWorlds={extraWorlds} h={h} tick={tick} />
        </div>
      )
    case 'notice':
      return (
        <div className="flex flex-col items-center gap-2">
          <Coach tone="ask" text={ep.notice[vocab]} hint={vocab === 'simple' ? 'Look again if you like. Then tap when you have an answer.' : 'Replay if you need to; then say what you noticed.'} />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Dial sim={sim} episode={sim.episode} vocab={vocab} extraWorlds={extraWorlds} h={h} tick={tick} />
            <Big onClick={onNoticed} data-noticed="">
              {vocab === 'simple' ? 'I know!' : 'I have an answer'}
            </Big>
          </div>
        </div>
      )
    case 'land':
      // With a card the card owns the screen; without one, the sentences.
      if (ep.equation) return null
      return (
        <div className="flex w-full flex-col items-center gap-2" data-say-it-back="">
          <Coach tone="ask" text={vocab === 'simple' ? 'Say it back. Which one is right?' : 'Say it back: pick the sentence that says what you found.'} />
          <div className="flex w-full max-w-[34rem] flex-col gap-2">
            {sentences.map((t) => (
              <Tile
                key={t.id}
                onClick={() => {
                  if (t.id !== 'right') {
                    setShake(t.id)
                    window.setTimeout(() => setShake(null), 500)
                  }
                  onSay(t)
                }}
                data-sentence={t.id}
                className={`w-full rounded-2xl border border-[#E4DCC9] bg-[#FCFAF4] px-4 py-3 text-left text-[13.5px] leading-snug font-extrabold text-[#2A2823] shadow-md transition-transform hover:scale-[1.01] active:scale-[0.99] ${shake === t.id ? 'eq-shake' : ''} ${said === t.id && t.id === 'right' ? 'border-[#3E7C43] bg-[#DDEBD9]' : ''}`}
              >
                {t.text}
              </Tile>
            ))}
          </div>
        </div>
      )
    case 'done':
      return (
        <div className="flex flex-col items-center gap-2">
          <Coach tone="done" text={vocab === 'simple' ? 'On the shelf! That one is yours now.' : `"${ep.title[vocab]}" is on the shelf.`} hint={hasNext ? (vocab === 'simple' ? 'Ready for the next one?' : 'The next object is waiting.') : 'That is the whole shelf, for now.'} />
          {hasNext && (
            <Big onClick={onNext} data-next="">
              Next
            </Big>
          )}
        </div>
      )
  }
}

