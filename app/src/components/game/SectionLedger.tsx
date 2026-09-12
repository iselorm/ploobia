/**
 * The section ledger — the grown-ups' column.
 *
 * Beside the page card, the ledger lists the section's syllabus statements
 * with their numbers and what the learner has done about each: stamped (with
 * the grade its explanation earned), waiting for its explanation, covered
 * by a check page, or not yet touched. Syllabus numbering is allowed here
 * and nowhere else on the learner's screen — this is the ledger, and the
 * ledger is what a parent or a teacher reads.
 *
 * Supplement statements are shown only at Analyst, because only Analyst is
 * set them.
 */

import { BadgeCheck, Circle, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Band } from '@/lib/bands'
import { STATEMENT_BY_ID, useCurriculum } from '@/lib/curriculum'
import { lineIn, pagesFor, type Section } from '@/lib/page'
import { Plate } from '@/components/sugar/hud/AtlasKit'

export function SectionLedger({ section, band, embedded = false }: { section: Section; band: Band; embedded?: boolean }) {
  const ledger = useCurriculum()
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

  return (
    <Plate eyebrow="Section" quiet={embedded} className={cn(embedded && 'p-2.5')}>
      <p className="atlas-serif -mt-1 mb-1.5 text-[13px] font-semibold text-[#2A2823]">{lineIn(section.title)}</p>
      <ul className="flex flex-col" data-testid="section-ledger">
        {rows.map((s) => {
          const records = ledger.stamps[s.id] ?? []
          const stamped = records.length > 0
          const pending = !stamped && pendingIds.has(s.id)
          const how = stamped ? 'stamped' : pending ? 'explain' : practicalStamps.has(s.id) ? 'door' : checkStamps.has(s.id) ? 'check' : 'none'
          const last = records[records.length - 1]
          return (
            <li
              key={s.id}
              data-statement={s.code}
              data-how={how}
              title={s.text}
              className="flex items-center justify-between gap-2 border-b border-[#EDE6D6] py-1 text-[11.5px] last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {stamped ? (
                  <BadgeCheck className="h-3.5 w-3.5 flex-none text-[#2F6134]" />
                ) : pending ? (
                  <PenLine className="h-3.5 w-3.5 flex-none text-[#96591C]" />
                ) : (
                  <Circle className="h-3 w-3 flex-none text-[#D9CFBB]" />
                )}
                <span className="font-mono text-[10.5px] text-[#8B8471]">{s.code}</span>
                <span className="truncate font-semibold text-[#4A4438]">{short(s.text)}</span>
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
                {how === 'stamped' ? (last?.grade === 'right' ? 'stamped' : `stamped · ${last?.grade}`) : how === 'explain' ? 'explain' : how === 'door' ? 'door' : how === 'check' ? 'check' : '—'}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-1.5 text-[10px] leading-snug text-[#8B8471]">Stamps are evidence — a guess, what you did, what you saw, and why — never XP.</p>
    </Plate>
  )
}

/** The statement's first clause, for a row; the whole text rides in the title. */
function short(text: string): string {
  const cut = text.replace(/^(State|Describe|Explain|Identify|Outline|Investigate and describe|Investigate|Relate) (that |the |how |why |in diagrams and images )?/i, '')
  const end = cut.search(/[:,;(]| — /)
  const s = end > 12 ? cut.slice(0, end) : cut
  return s.length > 42 ? s.slice(0, 40).trimEnd() + '…' : s
}
