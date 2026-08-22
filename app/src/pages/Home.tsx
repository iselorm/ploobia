import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Circle,
  Heart,
  MessageCircleQuestion,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { BAND_META, BANDS, setBand, type Band } from '@/lib/bands'
import { CABINETS, CABINET_BY_ID } from '@/lib/cabinets'
import { clearEvents, countInvestigations, isType, since, useAllEvents, useEvents } from '@/lib/events'
import {
  ANALYST_RANKS,
  deriveProgress,
  EXPLORER_BADGES,
  faceFor,
  SKILL_IDS,
  SKILLS,
} from '@/lib/progression'
import { addLearner, AVATARS, removeLearner, selectLearner, setParent, useAccount, useActiveLearner } from '@/lib/profiles'
import { CABINET_SPONSORS, SPONSOR_CONTACT, SUPPORT_AMOUNTS } from '@/lib/sponsors'
import { VARS, type VarId } from '@/lib/ratelab'

const varLabel = (v: string) => (VARS as Record<string, { label: string } | undefined>)[v as VarId]?.label.toLowerCase() ?? v.replace(/_/g, ' ')

const card = 'rounded-[22px] border border-[#F3E9D7] bg-[#FBF5EA] p-5 shadow-xl'
const h2 = 'text-[11px] font-black tracking-widest text-[#A08750] uppercase'
const label = 'text-[11px] font-extrabold text-[#7A5252]'
const input =
  'w-full rounded-[12px] border border-[#E8DFC8] bg-[#FFFDF7] px-3 py-2 text-[13px] font-semibold text-[#402222] outline-none focus-visible:ring-2 focus-visible:ring-[#E8A33D]'
const chip = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-[12px] font-extrabold transition-all ${
    on ? 'bg-[#3E7C43] text-[#FBF5EA] shadow' : 'bg-[#F3E9D7] text-[#7A5252] hover:bg-[#EBDFC8]'
  }`

/* ------------------------------------------------------------------ */
/* Learner section                                                    */
/* ------------------------------------------------------------------ */

function LearnersCard() {
  const account = useAccount()
  const active = useActiveLearner()
  const [adding, setAdding] = useState(false)
  const [nick, setNick] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[1])
  const [band, setBandChoice] = useState<Band>('explorer')

  return (
    <section className={card} aria-labelledby="learners-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="learners-h" className={h2}>
          Learners on this device
        </h2>
        {!adding && (
          <Tile onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-full bg-[#F3E9D7] px-3 py-1.5 text-[12px] font-extrabold text-[#7A5252] hover:bg-[#EBDFC8]">
            <Plus className="h-3.5 w-3.5" /> Add a learner
          </Tile>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {account.learners.map((l) => {
          const on = l.id === active.id
          return (
            <Tile
              key={l.id}
              onClick={() => {
                selectLearner(l.id)
                setBand(l.band)
              }}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-[13px] font-extrabold transition-all ${
                on ? 'shadow' : 'border-[#F3E9D7] bg-[#FFFDF7] text-[#7A5252]'
              }`}
              style={on ? { borderColor: BAND_META[l.band].tint, background: BAND_META[l.band].tintSoft, color: '#402222' } : undefined}
            >
              <span className="text-lg leading-none">{l.avatar}</span>
              {l.nickname}
              <span className="rounded-full bg-black/5 px-1.5 py-px text-[10px]">{BAND_META[l.band].label}</span>
            </Tile>
          )
        })}
      </div>

      {account.learners.length > 1 && !adding && (
        <div className="mt-2">
          <Tile
            onClick={() => {
              if (window.confirm(`Remove ${active.nickname}'s profile from this device?`)) removeLearner(active.id)
            }}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-[#B08A7A] hover:bg-[#F6DEDC] hover:text-[#C13B33]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove {active.nickname}
          </Tile>
        </div>
      )}

      {adding && (
        <form
          className="mt-4 grid gap-3 rounded-[16px] border border-[#EFE6D2] bg-[#FFFDF7] p-3 sm:grid-cols-[1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            const l = addLearner(nick, avatar, band)
            setBand(l.band)
            setNick('')
            setAdding(false)
          }}
        >
          <div className="grid gap-2">
            <label className={label}>
              Nickname (no real names needed)
              <input className={`${input} mt-1`} value={nick} onChange={(e) => setNick(e.target.value)} placeholder="e.g. Kofi, Ama, Bee" maxLength={20} />
            </label>
            <div>
              <span className={label}>Avatar</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {AVATARS.map((a) => (
                  <Tile
                    key={a}
                    onClick={() => setAvatar(a)}
                    aria-pressed={a === avatar}
                    aria-label={`Avatar ${a}`}
                    className={`rounded-full text-xl leading-none ${a === avatar ? 'bg-[#DDEBD9] ring-2 ring-[#3E7C43]' : 'hover:bg-[#F3E9D7]'}`}
                  >
                    {a}
                  </Tile>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Level</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {BANDS.map((b) => (
                  <Tile key={b.id} onClick={() => setBandChoice(b.id)} aria-pressed={band === b.id} className={chip(band === b.id)}>
                    {b.label} <span className="opacity-70">({b.ages})</span>
                  </Tile>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-row gap-2 sm:flex-col">
            <Tile type="submit" className="rounded-full bg-[#3E7C43] px-4 py-2 text-[13px] font-black text-[#FBF5EA] shadow hover:bg-[#2F6134]">
              Add
            </Tile>
            <Tile onClick={() => setAdding(false)} className="rounded-full bg-[#F3E9D7] px-4 py-2 text-[13px] font-extrabold text-[#7A5252]">
              Cancel
            </Tile>
          </div>
        </form>
      )}
      <p className="mt-3 text-[11px] font-semibold text-[#B08A7A]">
        Profiles hold a nickname, an avatar and a level — nothing else. Everything stays on this device
        until you choose to create an account.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Digest                                                             */
/* ------------------------------------------------------------------ */

function dinnerQuestion(events: ReturnType<typeof useEvents>): string {
  const w = [...events].reverse().find((e) => isType(e, 'writeup.completed'))
  if (w && isType(w, 'writeup.completed')) {
    return `They concluded that as ${varLabel(w.payload.variable)} increased, ${w.payload.claim}. Ask: “How did you know? What would have changed your mind?”`
  }
  const m = [...events].reverse().find((e) => isType(e, 'mission.completed'))
  if (m && isType(m, 'mission.completed')) {
    return `They completed the mission “${m.payload.title}”. Ask: “What did you have to measure to prove it?”`
  }
  const r = [...events].reverse().find((e) => isType(e, 'reading.recorded'))
  if (r && isType(r, 'reading.recorded')) {
    return `They measured how ${varLabel(r.payload.variable)} affects the rate. Ask: “What did you keep the same while you changed it?”`
  }
  return 'Ask: “If you could change one thing about a plant’s world, what would you measure?”'
}

function DigestCard() {
  const learner = useActiveLearner()
  const events = useEvents(learner.id)
  const week = useMemo(() => since(events, 7), [events])
  const progress = useMemo(() => deriveProgress(events), [events])
  const face = faceFor(learner.band, progress)
  const readings = week.filter((e) => e.type === 'reading.recorded').length
  const missions = week.filter((e) => e.type === 'mission.completed').length
  const writeups = week.filter((e) => e.type === 'writeup.completed').length
  const investigations = countInvestigations(week)
  const cabinets = [...new Set(week.map((e) => e.cabinet))].map((id) => CABINET_BY_ID[id]?.title ?? id)
  const latestWriteup = [...events].reverse().find((e) => isType(e, 'writeup.completed'))

  return (
    <section className={card} aria-labelledby="digest-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="digest-h" className={h2}>
          This week — {learner.avatar} {learner.nickname}
        </h2>
        <span className="text-[11px] font-extrabold text-[#7A5252]">
          {BAND_META[learner.band].label} · {face.headline}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Investigations', investigations],
          ['Readings', readings],
          ['Missions', missions],
          ['Write-ups', writeups],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-[14px] border border-[#EFE6D2] bg-[#FFFDF7] px-3 py-2">
            <div className="text-2xl font-black text-[#402222] tabular-nums">{v as number}</div>
            <div className="text-[10px] font-black tracking-wider text-[#A08750] uppercase">{k as string}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[12px] font-semibold text-[#5C3A3A]">
        {week.length === 0
          ? 'Nothing recorded in the last seven days. Ploobia is one tap away.'
          : `Cabinets visited: ${cabinets.join(', ')}. ${face.nextLabel}`}
      </p>

      {/* Skills */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {SKILL_IDS.map((id) => {
          const s = progress.skills[id]
          const ratio = s.next ? Math.min(1, s.points / s.next) : 1
          return (
            <div key={id}>
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-extrabold text-[#402222]">{SKILLS[id].label}</span>
                <span className="text-[10px] font-black text-[#A08750]">Level {s.level}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F3E9D7]">
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${ratio * 100}%`, background: SKILLS[id].tint }} />
              </div>
              <p className="mt-0.5 text-[10px] font-semibold text-[#B08A7A]">{SKILLS[id].blurb}</p>
            </div>
          )
        })}
      </div>

      {/* Band-specific record */}
      {learner.band === 'explorer' && (
        <div className="mt-4">
          <div className={h2}>Badges</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXPLORER_BADGES.map((b) => {
              const on = progress.badges.includes(b.id)
              return (
                <span
                  key={b.id}
                  title={b.hint}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                    on ? 'bg-[#FBEBD2] text-[#8A5A32]' : 'bg-[#F3E9D7] text-[#B08A7A]'
                  }`}
                >
                  {on ? <CheckCircle2 className="h-3.5 w-3.5 text-[#E8A33D]" /> : <Circle className="h-3.5 w-3.5" />}
                  {b.label}
                </span>
              )
            })}
          </div>
        </div>
      )}
      {learner.band === 'analyst' && (
        <div className="mt-4">
          <div className={h2}>Lab rank</div>
          <ol className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {ANALYST_RANKS.map((r, i) => {
              const reached = i <= progress.rank
              return (
                <li key={r.label} className={`flex items-start gap-2 rounded-[12px] px-3 py-2 ${reached ? 'bg-[#D9E6F2]' : 'bg-[#F7F1E6]'}`}>
                  <Award className={`mt-0.5 h-4 w-4 shrink-0 ${reached ? 'text-[#2E6DA8]' : 'text-[#C4AF95]'}`} />
                  <span>
                    <span className="block text-[12px] font-black text-[#402222]">{r.label}</span>
                    <span className="block text-[10.5px] font-semibold text-[#5C3A3A]">
                      {r.xp} XP · {r.writeups} write-up{r.writeups === 1 ? '' : 's'} · unlocks {r.unlocks.toLowerCase()}
                    </span>
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* Latest write-up */}
      {latestWriteup && isType(latestWriteup, 'writeup.completed') && (
        <div className="mt-4 rounded-[14px] border border-[#DDEAD8] bg-[#EAF3E6] px-3 py-2.5">
          <div className="text-[10px] font-black tracking-wider text-[#2E7D32] uppercase">One write-up worth reading</div>
          <p className="mt-1 text-[12px] leading-snug font-semibold text-[#3D5B3F]">
            As {varLabel(latestWriteup.payload.variable)} increased, {latestWriteup.payload.claim}. This happened because{' '}
            {latestWriteup.payload.reason}.
            {latestWriteup.payload.limitations.length ? ` Limitations noted: ${latestWriteup.payload.limitations.length}.` : ''}
            {latestWriteup.payload.ownWords ? ' They added their own words.' : ''}
          </p>
        </div>
      )}

      {/* Dinner question */}
      <div className="mt-4 flex items-start gap-2.5 rounded-[14px] border border-[#F0DFC0] bg-[#FDF6E7] px-3 py-2.5">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-[#B97D10]" />
        <div>
          <div className="text-[10px] font-black tracking-wider text-[#B97D10] uppercase">Something to ask at dinner</div>
          <p className="mt-0.5 text-[12px] leading-snug font-semibold text-[#8A5A32]">{dinnerQuestion(events)}</p>
        </div>
      </div>

      {events.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Tile
            onClick={() => {
              if (window.confirm(`Clear all of ${learner.nickname}'s recorded activity on this device?`)) clearEvents(learner.id)
            }}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-extrabold text-[#B08A7A] hover:bg-[#F6DEDC] hover:text-[#C13B33]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Start this learner fresh
          </Tile>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Grown-up account (mock)                                            */
/* ------------------------------------------------------------------ */

function ParentCard() {
  const account = useAccount()
  const [name, setName] = useState(account.name)
  const [contact, setContact] = useState(account.contact)
  const [saved, setSaved] = useState(false)
  return (
    <section className={card} aria-labelledby="parent-h">
      <h2 id="parent-h" className={h2}>
        Grown-up account
      </h2>
      <p className="mt-1 text-[12px] font-semibold text-[#5C3A3A]">
        The adult holds the account; learners never need an email or a password. Sign-in by phone code or
        email arrives with the online version — for now this just labels the device.
      </p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          setParent(name, contact)
          setSaved(true)
          window.setTimeout(() => setSaved(false), 2000)
        }}
      >
        <label className={label}>
          Your name
          <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Parent or guardian" />
        </label>
        <label className={label}>
          Phone (MoMo) or email
          <input className={`${input} mt-1`} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+233 … or you@example.com" />
        </label>
        <div className="flex items-end">
          <Tile type="submit" className="w-full rounded-full bg-[#402222] px-4 py-2 text-[13px] font-black text-[#FBF5EA] sm:w-auto">
            {saved ? 'Saved' : 'Save'}
          </Tile>
        </div>
      </form>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Support + sponsors                                                 */
/* ------------------------------------------------------------------ */

function SupportCard({ open }: { open: boolean }) {
  const all = useAllEvents()
  const investigations = countInvestigations(all)
  const readings = all.filter((e) => e.type === 'reading.recorded').length
  const [rail, setRail] = useState<'GHS' | 'USD'>('GHS')
  const [thanks, setThanks] = useState<string | null>(null)
  const amounts = SUPPORT_AMOUNTS[rail]

  return (
    <section className={`${card} ${open ? 'ring-2 ring-[#E8A33D]' : ''}`} aria-labelledby="support-h" id="support">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-[#C13B33]" />
        <h2 id="support-h" className={h2}>
          Keep Ploobia free
        </h2>
      </div>
      <p className="mt-2 text-[13px] leading-snug font-semibold text-[#402222]">
        {readings > 0
          ? `On this device alone, Ploobia has run ${investigations} investigation${investigations === 1 ? '' : 's'} and recorded ${readings} reading${readings === 1 ? '' : 's'} — free.`
          : 'Every cabinet is free for every learner, and stays that way.'}{' '}
        If you can chip in, it pays for hosting and the next cabinet. If you can’t, please don’t — that is
        exactly who this is for.
      </p>
      <div className="mt-3 flex gap-1.5">
        <Tile onClick={() => setRail('GHS')} aria-pressed={rail === 'GHS'} className={chip(rail === 'GHS')}>
          <Smartphone className="mr-1 inline h-3.5 w-3.5" /> Mobile money (GH₵)
        </Tile>
        <Tile onClick={() => setRail('USD')} aria-pressed={rail === 'USD'} className={chip(rail === 'USD')}>
          Card / PayPal ($)
        </Tile>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {amounts.map((a) => (
          <Tile
            key={a}
            onClick={() => {
              setThanks(`${rail === 'GHS' ? 'GH₵' : '$'}${a}`)
              window.setTimeout(() => setThanks(null), 3500)
            }}
            className="rounded-full bg-[#E8A33D] px-4 py-2 text-[13px] font-black text-[#402222] shadow hover:bg-[#F0B455]"
          >
            {rail === 'GHS' ? 'GH₵' : '$'}
            {a}
          </Tile>
        ))}
      </div>
      {thanks && (
        <p className="fact-pop mt-2 text-[12px] font-bold text-[#2E7D32]">
          Thank you. Payments switch on with the online version (Paystack for MoMo and cards, PayPal for
          the diaspora) — nothing was charged today.
        </p>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-[11px] font-semibold text-[#B08A7A]">
        <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
        Support is only ever asked for here, on the grown-up’s screens — never from a learner mid-experiment,
        and never through ads inside a cabinet.
      </p>
    </section>
  )
}

function SponsorsCard() {
  return (
    <section className={card} aria-labelledby="sponsors-h">
      <h2 id="sponsors-h" className={h2}>
        Sponsors and plaques
      </h2>
      <p className="mt-1 text-[12px] font-semibold text-[#5C3A3A]">
        A sponsor puts their name on a cabinet the way a museum exhibit is underwritten — no tracking, no ads
        in the simulation. A classroom sponsor covers a school and is named in that school’s hall.
      </p>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {CABINETS.map((c) => {
          const s = CABINET_SPONSORS[c.id]
          return (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-[12px] border border-[#EFE6D2] bg-[#FFFDF7] px-3 py-2">
              <span className="text-[12px] font-extrabold text-[#402222]">
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: c.tint }} />
                {c.title}
              </span>
              <span className="text-[10.5px] font-bold text-[#7A5252]">{s ? s.name : c.status === 'live' ? 'Looking for a sponsor' : 'Not yet open'}</span>
            </li>
          )
        })}
      </ul>
      <a href={SPONSOR_CONTACT} className="mt-3 inline-block text-[12px] font-black text-[#3E7C43] underline-offset-2 hover:underline">
        Sponsor a cabinet or a classroom →
      </a>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [params] = useSearchParams()
  const supportOpen = params.get('support') === '1'
  return (
    <div className="hud min-h-[100dvh] bg-[#F3EADB] px-4 py-6 sm:px-8" style={{ background: 'radial-gradient(ellipse at 15% 0%, #FDF3D8 0%, transparent 50%), #F3EADB' }}>
      <div className="mx-auto max-w-4xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Tile asChild>
            <Link to="/" className="flex items-center gap-1.5 rounded-full border border-[#F3E9D7] bg-[#FBF5EA] px-3 py-1.5 text-[12px] font-extrabold text-[#7A5252] shadow hover:text-[#3E7C43]">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Ploobia
            </Link>
          </Tile>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-[#402222]">
            <UserRound className="h-5 w-5 text-[#3E7C43]" /> Family home
          </h1>
        </header>

        <div className="grid gap-4">
          <LearnersCard />
          <DigestCard />
          {supportOpen && <SupportCard open />}
          <ParentCard />
          {!supportOpen && <SupportCard open={false} />}
          <SponsorsCard />
          <p className="px-2 text-center text-[11px] font-semibold text-[#B08A7A]">
            Everything on this page is computed from the learner’s own recorded activity — readings, missions
            and write-ups. Nothing is awarded for clicks or time on screen.
          </p>
        </div>
      </div>
    </div>
  )
}
