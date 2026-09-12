/**
 * The curriculum map and the stamp ledger.
 *
 * Syllabus statements live here as data — the mapping layer the project
 * instructions asked for ("curriculum-compatible, not curriculum-shaped"):
 * one cabinet may serve several syllabuses, and the numbering, Core /
 * Supplement and (later) the Ghana tags live in the ledger and the parent
 * view, never on the learner's page.
 *
 * A **stamp** is evidence that a syllabus statement was met, and it is not XP:
 * XP still comes only from recorded readings (`lib/events`). What makes a
 * stamp defensible to a parent, a teacher or an examiner is that it carries
 * the **four-line record** (review 1, 11 Sep): what the learner predicted,
 * what they did, what they observed, and how they explained it. A hand-in
 * alone — "eventually got the number" — is not a stamp; a learner can fiddle
 * a dial until the gauge goes green. The explanation closes the record.
 *
 * Two dials, kept apart on purpose: **depth** (Explorer / Scientist /
 * Analyst — how much of a node the learner reads) and **lens** (which
 * syllabus's statements count). The first book carries one lens, Cambridge
 * IGCSE Biology 0610 for examination in 2026–2028, quoted in its own list
 * order (6.1.1 = the first statement under 6.1). Supplement statements are
 * Analyst-only.
 */

import { useSyncExternalStore } from 'react'
import { read, write } from './persist'

export type Tier = 'core' | 'supplement'

export interface Statement {
  /** `0610:8.1.1` — syllabus, topic, sub-topic, list position. */
  id: string
  /** `8.1.1` — what the ledger shows. */
  code: string
  tier: Tier
  /** The statement, close to the syllabus's own wording. */
  text: string
}

const S = (code: string, tier: Tier, text: string): Statement => ({ id: `0610:${code}`, code, tier, text })

/** Cambridge IGCSE Biology 0610 (2026–28), topics 6 and 8. */
export const STATEMENTS: Statement[] = [
  // 6.1 Photosynthesis
  S('6.1.1', 'core', 'Describe photosynthesis as the process by which plants synthesise carbohydrates from raw materials using energy from light'),
  S('6.1.2', 'core', 'State the word equation: carbon dioxide + water → glucose + oxygen, in the presence of light and chlorophyll'),
  S('6.1.3', 'core', 'State that chlorophyll is a green pigment found in chloroplasts'),
  S('6.1.4', 'core', 'State that chlorophyll transfers energy from light into energy in chemicals, for the synthesis of carbohydrates'),
  S('6.1.5', 'core', 'Outline the use and storage of the carbohydrates made: starch as an energy store, cellulose for cell walls, glucose in respiration, sucrose for transport in the phloem, nectar to attract insects'),
  S('6.1.6', 'core', 'Explain the importance of nitrate ions for making amino acids and magnesium ions for making chlorophyll'),
  S('6.1.7', 'core', 'Investigate the need for chlorophyll, light and carbon dioxide for photosynthesis, using appropriate controls'),
  S('6.1.8', 'core', 'Investigate and describe the effects of varying light intensity, carbon dioxide concentration and temperature on the rate of photosynthesis'),
  S('6.1.9', 'core', 'Investigate and describe the effect of light and dark on gas exchange in an aquatic plant using hydrogencarbonate indicator solution'),
  S('6.1.10', 'supplement', 'State the balanced chemical equation: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂'),
  S('6.1.11', 'supplement', 'Identify and explain the limiting factors of photosynthesis in different environmental conditions'),
  // 6.2 Leaf structure
  S('6.2.1', 'core', 'State that most leaves have a large surface area and are thin, and explain how these features are adaptations for photosynthesis'),
  S('6.2.2', 'core', 'Identify in diagrams and images: chloroplasts, cuticle, guard cells and stomata, upper and lower epidermis, palisade mesophyll, spongy mesophyll, air spaces and vascular bundles (xylem and phloem)'),
  S('6.2.3', 'core', 'Explain how the structures in 6.2.2 adapt leaves for photosynthesis'),
  // 8.1 Xylem and phloem
  S('8.1.1', 'core', 'State the functions of xylem (transport of water and mineral ions, and support) and phloem (transport of sucrose and amino acids)'),
  S('8.1.2', 'core', 'Identify in diagrams and images the position of xylem and phloem in sections of roots, stems and leaves'),
  S('8.1.3', 'supplement', 'Relate the structure of xylem vessels to their function: thick walls with lignin, no cell contents, cells joined end to end with no cross walls to form a long continuous tube'),
  // 8.2 Water uptake
  S('8.2.1', 'core', 'Identify in diagrams and images root hair cells and state their functions'),
  S('8.2.2', 'core', 'State that the large surface area of root hairs increases the uptake of water and mineral ions'),
  S('8.2.3', 'core', 'Outline the pathway taken by water: root hair cells → root cortex cells → xylem → mesophyll cells'),
  S('8.2.4', 'core', 'Investigate the pathway of water through the above-ground parts of a plant using a suitable stain'),
  // 8.3 Transpiration
  S('8.3.1', 'core', 'Describe transpiration as the loss of water vapour from leaves'),
  S('8.3.2', 'core', 'State that water evaporates from the surfaces of the mesophyll cells into air spaces and then diffuses out of the leaves through the stomata as water vapour'),
  S('8.3.3', 'core', 'Investigate and describe the effects of variation of temperature and wind speed on transpiration rate'),
  S('8.3.4', 'supplement', 'Explain how water vapour loss is related to the large internal surface area of the interconnecting air spaces and to the size and number of stomata'),
  S('8.3.5', 'supplement', 'Explain the mechanism of water movement upwards through the xylem in terms of a transpiration pull that draws up a column of water molecules, held together by forces of attraction between them'),
  S('8.3.6', 'supplement', 'Explain the effects of variation of temperature, wind speed and humidity on transpiration rate'),
  S('8.3.7', 'supplement', 'Explain how and why wilting occurs'),
  // 8.4 Translocation
  S('8.4.1', 'core', 'Describe translocation as the movement of sucrose and amino acids in the phloem from regions of production (source) to regions of storage or use (sink)'),
  S('8.4.2', 'core', 'Describe sources as the parts of plants that release sucrose or amino acids, and sinks as the parts that use or store them'),
  S('8.4.3', 'core', 'Explain why some parts of a plant may act as a source and a sink at different times'),
]

export const STATEMENT_BY_ID: Record<string, Statement> = Object.fromEntries(STATEMENTS.map((s) => [s.id, s]))

/* ------------------------------------------------------------------ */
/* The evidence record                                                 */
/* ------------------------------------------------------------------ */

export type Grade = 'right' | 'partly' | 'wrong'

export interface EvidenceRecord {
  at: number
  cabinet: string
  /** The level preset (a practical) or the check page id. */
  source: string
  kind: 'practical' | 'check'
  /** The committed guess, in words — "oxygen runs out first". */
  prediction: string
  /** What was set — "light 100 %, CO₂ 400 ppm". */
  action: string
  /** What the gauge read — "export 11.2 mg h⁻¹". */
  observed: string
  /** The learner's explanation, and how it was marked. */
  explanation: string
  grade: Grade
}

interface Ledger {
  /** Statement id → the records that stamped it, oldest first. */
  stamps: Record<string, EvidenceRecord[]>
  /** Hand-ins waiting for their explanation, by level preset id. */
  pending: Record<string, PendingRecord>
}

export interface PendingRecord {
  cabinet: string
  source: string
  prediction: string
  action: string
  observed: string
  stamps: string[]
  at: number
}

const KEY = 'ploobia.curriculum.v1'
const EMPTY: Ledger = { stamps: {}, pending: {} }

let ledger: Ledger = load()
const listeners = new Set<() => void>()

function load(): Ledger {
  const l = read<Ledger>(KEY, EMPTY)
  return { stamps: l.stamps ?? {}, pending: l.pending ?? {} }
}

function commit(next: Ledger): void {
  ledger = next
  write(KEY, ledger)
  listeners.forEach((fn) => fn())
}

/** The brief's guess, in words, before anything is done. */
const predictions: Record<string, string> = {}

export function notePrediction(source: string, text: string): void {
  predictions[source] = text
}

/**
 * A hit hand-in. Three lines are known now; the fourth — the explanation —
 * comes from the practical page, and only then does anything stamp. A miss
 * records nothing: a stamp is evidence the number was landed.
 */
export function noteHandIn(p: { cabinet: string; source: string; action: string; observed: string; stamps: string[] }): void {
  if (!p.stamps.length) return
  const pending: PendingRecord = {
    cabinet: p.cabinet,
    source: p.source,
    prediction: predictions[p.source] ?? 'no guess taken',
    action: p.action,
    observed: p.observed,
    stamps: p.stamps,
    at: Date.now(),
  }
  commit({ ...ledger, pending: { ...ledger.pending, [p.source]: pending } })
}

export function pendingFor(source: string): PendingRecord | null {
  return ledger.pending[source] ?? null
}

export function pendingAll(): PendingRecord[] {
  return Object.values(ledger.pending)
}

/** The fourth line. Closes the record and stamps every statement it names. */
export function explainHandIn(source: string, explanation: string, grade: Grade): EvidenceRecord | null {
  const p = ledger.pending[source]
  if (!p) return null
  const rec: EvidenceRecord = {
    at: Date.now(),
    cabinet: p.cabinet,
    source,
    kind: 'practical',
    prediction: p.prediction,
    action: p.action,
    observed: p.observed,
    explanation,
    grade,
  }
  const stamps = { ...ledger.stamps }
  for (const id of p.stamps) stamps[id] = [...(stamps[id] ?? []), rec]
  const pending = { ...ledger.pending }
  delete pending[source]
  commit({ stamps, pending })
  return rec
}

/** A check page answered: one record, committed before the model answer unfolded. */
export function stampCheck(p: { cabinet: string; source: string; stamps: string[]; explanation: string; grade: Grade }): EvidenceRecord {
  const rec: EvidenceRecord = {
    at: Date.now(),
    cabinet: p.cabinet,
    source: p.source,
    kind: 'check',
    prediction: '—',
    action: 'check page',
    observed: '—',
    explanation: p.explanation,
    grade: p.grade,
  }
  const stamps = { ...ledger.stamps }
  for (const id of p.stamps) stamps[id] = [...(stamps[id] ?? []), rec]
  commit({ ...ledger, stamps })
  return rec
}

export function stampsFor(id: string): EvidenceRecord[] {
  return ledger.stamps[id] ?? []
}

export function isStamped(id: string): boolean {
  return (ledger.stamps[id]?.length ?? 0) > 0
}

export function resetCurriculum(): void {
  commit({ stamps: {}, pending: {} })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Live view of the ledger for React; re-renders on every stamp. */
export function useCurriculum(): Ledger {
  return useSyncExternalStore(subscribe, () => ledger, () => ledger)
}

declare global {
  interface Window {
    __ploobiaCurriculum?: {
      ledger: () => Ledger
      reset: () => void
      statements: () => Statement[]
    }
  }
}

if (typeof window !== 'undefined') {
  window.__ploobiaCurriculum = { ledger: () => ledger, reset: resetCurriculum, statements: () => STATEMENTS }
}
