/**
 * The section ledger — the evidence column beside the page card.
 *
 * One row per syllabus statement the section covers, with what the learner
 * has done about each: stamped (with the grade its explanation earned),
 * waiting for its explanation, covered by a door or a check page, or not
 * here — this section does not evidence it.
 *
 * Decided 2026-09-12 (reconciling the two streams' review): the learner
 * reads a row as a plain name — "Where the pipes run" — and its stamp.
 * The **Syllabus** toggle turns on the numbers and the verbatim statements,
 * for the parent or the teacher who is checking against the paper; it is
 * remembered per device. A stamped row opens to its four lines — what the
 * learner guessed, set, saw, and explained — because a stamp *is* that
 * record, not a tick.
 *
 * Supplement statements are shown only at Analyst, because only Analyst is
 * set them. Nothing here is scored.
 */

import { useState } from 'react'
import { BadgeCheck, Circle, PenLine } from 'lucide-react'
import { Tile } from '@/components/ui/tile'
import { cn } from '@/lib/utils'
import type { Band } from '@/lib/bands'
import { STATEMENT_BY_ID, useCurriculum, type EvidenceRecord } from '@/lib/curriculum'
import { lineIn, pagesFor, type Section } from '@/lib/page'
import { read, write } from '@/lib/persist'
import { Plate } from '@/components/sugar/hud/AtlasKit'

const SYLLABUS_KEY = 'ploobia.ledger.syllabus'

export function SectionLedger({ section, band, embedded = false }: { section: Section; band: Band; embedded?: boolean }) {
  const ledger = useCurriculum()
  const [syllabus, setSyllabus] = useState<boolean>(() => read<boolean>(SYLLABUS_KEY, false))
  const [open, setOpen] = useState<string | null>(null)
  const pages = pagesFor(section, band)
  const practicalStamps = new Set(pages.flatMap((p) => p.practical?.stamps ?? []))
  const checkStamps = new Set(
    pages.flatMap((p) => {
      const item = p.check?.[band]
      return item ? item.stamps : []
    }),
  )
  const pendingIds = new Set(Object.values(ledger.pending).flatMap((p) => p.stamps))
  const rows = section.statements
    .map((id) => STATEMENT_BY_ID[id])
    .filter((s): s is NonNullable<typeof s> => !!s)
    .filter((s) => s.tier === 'core' || band === 'analyst')

  const toggleSyllabus = () => {
    setSyllabus((v) => {
      write(SYLLABUS_KEY, !v)
      return !v
    })
  }

  return (
    <Plate
      eyebrow="Section"
      quiet={embedded}
      className={cn(embedded && 'p-2.5')}
      action={
        <Tile
          onClick={toggleSyllabus}
          aria-label="Show the syllabus numbers"
          aria-pressed={syllabus}
          data-testid="ledger-syllabus"
          className={cn(
            'rounded-full border px-2 py-0.5 text-[9.5px] font-black tracking-[0.08em] uppercase transition-colors',
            syllabus ? 'border-[#2A2823] bg-[#2A2823] text-[#FBF5EA]' : 'border-[#D8D0BC] text-[#8B8471] hover:border-[#2A2823] hover:text-[#2A2823]',
          )}
        >
          Syllabus
        </Tile>
      }
    >
      <p className="atlas-serif -mt-1 mb-1.5 text-[13px] font-semibold text-[#2A2823]">{lineIn(section.title)}</p>
      <ul className="flex flex-col" data-testid="section-ledger" data-syllabus={syllabus ? 'on' : 'off'}>
        {rows.map((s) => {
          const records = ledger.stamps[s.id] ?? []
          const stamped = records.length > 0
          const pending = !stamped && pendingIds.has(s.id)
          const how = stamped ? 'stamped' : pending ? 'explain' : practicalStamps.has(s.id) ? 'door' : checkStamps.has(s.id) ? 'check' : 'none'
          const last = records[records.length - 1]
          const isOpen = stamped && open === s.id
          return (
            <li
              key={s.id}
              data-statement={s.code}
              data-how={how}
              title={syllabus ? s.text : undefined}
              className="border-b border-[#EDE6D6] py-1 text-[11.5px] last:border-b-0"
            >
              <Tile
                onClick={() => stamped && setOpen((o) => (o === s.id ? null : s.id))}
                aria-label={stamped ? `${isOpen ? 'Hide' : 'Show'} the evidence for ${s.label}` : s.label}
                aria-expanded={stamped ? isOpen : undefined}
                data-testid="ledger-row"
                className={cn('flex w-full items-center justify-between gap-2 text-start', !stamped && 'cursor-default')}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {stamped ? (
                    <BadgeCheck className="h-3.5 w-3.5 flex-none text-[#2F6134]" />
                  ) : pending ? (
                    <PenLine className="h-3.5 w-3.5 flex-none text-[#96591C]" />
                  ) : (
                    <Circle className="h-3 w-3 flex-none text-[#D9CFBB]" />
                  )}
                  {syllabus && (
                    <span className="font-mono text-[10.5px] text-[#8B8471]" data-testid="ledger-code">
                      {s.code}
                    </span>
                  )}
                  <span className="truncate font-semibold text-[#4A4438]">{s.label}</span>
                  {s.tier === 'supplement' && <span className="flex-none text-[9.5px] font-black tracking-[0.08em] text-[#C98A1E] uppercase">ext</span>}
                </span>
                <span
                  className={cn(
                    'flex-none text-[10px] font-black tracking-[0.06em] uppercase',
                    how === 'stamped' && 'text-[#2F6134]',
                    how === 'explain' && 'text-[#96591C]',
                    (how === 'door' || how === 'check') && 'text-[#8B8471]',
                    how === 'none' && 'text-[#B9B09A]',
                  )}
                >
                  {how === 'stamped' ? (last?.grade === 'right' ? 'stamped' : `stamped · ${last?.grade}`) : how === 'explain' ? 'explain' : how === 'door' ? 'door' : how === 'check' ? 'check' : 'not here'}
                </span>
              </Tile>
              {syllabus && (
                <p className="mt-0.5 ps-5 text-[10px] leading-snug text-[#8B8471]" data-testid="ledger-statement">
                  {s.text}
                </p>
              )}
              {isOpen && last && <Record record={last} />}
            </li>
          )
        })}
      </ul>
      <p className="mt-1.5 text-[10px] leading-snug text-[#8B8471]">
        Stamps are evidence — a guess, what you did, what you saw, and why — never XP. Tap a stamped row to read it.
        {rows.some((s) => !practicalStamps.has(s.id) && !checkStamps.has(s.id)) ? ' “Not here”: this section does not cover it.' : ''}
        {syllabus ? ' Numbers are Cambridge IGCSE Biology 0610, examination 2026–2028.' : ''}
      </p>
    </Plate>
  )
}

/** The four lines of a stamp, in the learner's own words as they were kept. */
function Record({ record }: { record: EvidenceRecord }) {
  const line = (dt: string, dd: string) => (
    <>
      <dt className="font-black tracking-[0.08em] text-[#96591C] uppercase">{dt}</dt>
      <dd className="min-w-0 font-semibold break-words text-[#2A2823]">{dd}</dd>
    </>
  )
  return (
    <dl
      data-testid="stamp-record"
      className="mt-1 ms-5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-lg border border-[#EAD0A0] bg-[#FBEBD2]/60 px-2 py-1.5 text-[10.5px] leading-snug"
    >
      {record.kind === 'practical' ? (
        <>
          {line('Guessed', record.prediction)}
          {line('Set', record.action)}
          {line('Saw', record.observed)}
        </>
      ) : (
        line('Did', 'Answered the check page, committed before the answer unfolded')
      )}
      {line('Explained', record.explanation || '—')}
      <dt className="font-black tracking-[0.08em] text-[#96591C] uppercase">Marked</dt>
      <dd className="min-w-0 font-semibold text-[#8B8471]">
        {record.grade} · {new Date(record.at).toLocaleDateString()}
      </dd>
    </dl>
  )
}
