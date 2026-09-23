/**
 * The Biology book — Cambridge IGCSE 0610, read from the Sugar Line.
 *
 * Two chapters for now (6 then 8, the order the campaign opens in). The
 * explanations that close a hand-in's evidence record belong to the door,
 * not the section — the Line's question is the Line's whether you came from
 * 8.1 or 8.4 — so they are attached here by door.
 */

import type { Band } from '@/lib/bands'
import type { Book, CheckPick, CheckWrite, Practical, Section } from '@/lib/page'
import { CH06 } from './ch06'
import { CH08 } from './ch08'

type Explain = Partial<Record<Band, CheckPick | CheckWrite>>

/** After a hit at the door, before it stamps: say what happened. */
const EXPLAIN_BY_DOOR: Record<string, Explain> = {
  plant: {
    explorer: {
      kind: 'pick',
      stamps: [],
      question: { en: 'The export climbed when you raised the light. Why?' },
      options: [
        { en: 'More light gives the leaf more energy to build sugar' },
        { en: 'The light warmed the pot' },
        { en: 'Light makes the roots drink faster' },
      ],
      answer: 0,
      reveal: { en: 'Light is the energy the factory runs on. Warmth and water matter too — but it was the light you moved.' },
    },
    scientist: {
      kind: 'pick',
      stamps: [],
      question: { en: 'Past a certain light level the export stopped climbing. What was happening?' },
      options: [
        { en: 'Another factor — carbon dioxide or temperature — had become limiting' },
        { en: 'The leaf had run out of chlorophyll' },
        { en: 'Too much light switches photosynthesis off' },
      ],
      answer: 0,
      reveal: { en: 'The rate is set by whichever factor is in shortest supply. Raise light past that point and the ceiling belongs to CO₂ or temperature.' },
    },
    analyst: {
      kind: 'write',
      stamps: [],
      question: { en: 'Explain what limited the rate at the ceiling you found, and how you could tell.' },
      marks: 3,
      model: {
        en: 'At the ceiling, raising light no longer raised the export, so light was no longer the limiting factor; raising carbon dioxide (or temperature) did move the rate, which identifies that factor as limiting. The rate is set by the factor in shortest supply.',
      },
      points: [{ en: 'raising light no longer changed the rate → light not limiting' }, { en: 'the factor that did change the rate was the limiting one' }, { en: 'the rate is set by the factor in shortest supply' }],
    },
  },
  pond: {
    explorer: {
      kind: 'pick',
      stamps: [],
      question: { en: 'One dial made the bubbles jump. The others changed almost nothing. What does that tell you?' },
      options: [
        { en: 'The plant was short of that one thing, and had enough of the others' },
        { en: 'The plant only likes that dial' },
        { en: 'The other dials do not do anything at all' },
      ],
      answer: 0,
      reveal: { en: 'It was short of one thing. The others were already enough — which is exactly why moving them did nothing. Give it more of what it has plenty of and nothing happens.' },
    },
    scientist: {
      kind: 'pick',
      stamps: [],
      question: { en: 'Moving one dial changed nothing; moving another changed everything. Why?' },
      options: [
        { en: 'The second was the factor in shortest supply — the limiting factor; the first was already in excess' },
        { en: 'The first dial was broken' },
        { en: 'Only one factor affects photosynthesis at a time, and it is always that one' },
      ],
      answer: 0,
      reveal: { en: 'The rate is set by whichever factor is in shortest supply. Raise one that is already in excess and the rate does not move; raise the limiting one and it does. Fix that, and something else becomes limiting — there is always a ceiling.' },
    },
    analyst: {
      kind: 'write',
      stamps: [],
      question: { en: 'Explain how your counts identified the limiting factor, and why the first dial you moved changed nothing.' },
      marks: 4,
      model: {
        en: 'Changing one variable at a time while holding the others fixed, the count did not rise when the first factor was increased, so that factor was already in excess and was not limiting. Increasing the other factor raised the bubble count substantially, identifying it as the factor in shortest supply — the limiting factor — because the rate is set by whichever requirement is least available. Counts were repeated because a bubble count carries sampling error, so a single pair of readings could differ by chance rather than by cause.',
      },
      points: [
        { en: 'one variable changed at a time, the others held' },
        { en: 'no rise when a factor in excess was increased → not limiting' },
        { en: 'a clear rise when the scarce factor was increased → limiting' },
        { en: 'the rate is set by the factor in shortest supply' },
      ],
    },
  },
  hatches: {
    explorer: {
      kind: 'pick',
      stamps: [],
      question: { en: 'The leaf lost water faster when the hatches opened. Why?' },
      options: [
        { en: 'Open stomata let water vapour diffuse out' },
        { en: 'Open stomata let light in' },
        { en: 'The water left through the roots' },
      ],
      answer: 0,
      reveal: { en: 'The stomata are the only doors. Open, and carbon dioxide comes in — and the water goes out the same way.' },
    },
    scientist: {
      kind: 'pick',
      stamps: [],
      question: { en: 'Why did the plant close its own hatches in the Harmattan?' },
      options: [
        { en: 'Dry wind raised water loss past what the roots could replace, so turgor fell' },
        { en: 'Wind blows the carbon dioxide away' },
        { en: 'Stomata close whenever it is windy, regardless of water' },
      ],
      answer: 0,
      reveal: { en: 'Wind strips the humid air off the leaf, transpiration climbs, and once loss outruns uptake the guard cells lose turgor and the pore narrows.' },
    },
    analyst: {
      kind: 'write',
      stamps: [],
      question: { en: 'Explain the trade a plant makes when its stomata open, and why humidity changes the rate of water loss.' },
      marks: 4,
      model: {
        en: 'Open stomata let carbon dioxide diffuse in for photosynthesis but also let water vapour diffuse out from the air spaces — transpiration. Humid air has a smaller water-vapour concentration gradient between the air spaces and the outside, so diffusion out is slower; dry (or windy) air steepens the gradient and speeds loss.',
      },
      points: [{ en: 'open stomata: CO₂ in for photosynthesis' }, { en: 'water vapour out by diffusion — transpiration' }, { en: 'humidity lowers the concentration gradient → slower loss' }, { en: 'dry / windy air steepens it → faster loss' }],
    },
  },
  stem: {
    explorer: {
      kind: 'pick',
      stamps: [],
      question: { en: 'Where did the night\'s sugar come from, with the sun off?' },
      options: [
        { en: 'The starch the leaf banked in the day' },
        { en: 'The roots sent it up' },
        { en: 'The leaf kept making it in the dark' },
      ],
      answer: 0,
      reveal: { en: 'No light, no new sugar. The leaf breaks its starch down and the phloem carries it to the roots.' },
    },
    scientist: {
      kind: 'pick',
      stamps: [],
      question: { en: 'Cutting the bark ring stopped the sugar but not the water. Why?' },
      options: [
        { en: 'Sugar travels in the phloem, which the ring cut takes; water travels in the xylem, the wood' },
        { en: 'Sugar and water both travel in the wood' },
        { en: 'The ring cut stopped the roots drinking' },
      ],
      answer: 0,
      reveal: { en: 'Two pipes, two jobs. The ring cut takes the phloem and leaves the xylem, so the leaf stays firm while the sugar stops.' },
    },
    analyst: {
      kind: 'write',
      stamps: [],
      question: { en: 'Explain why cooling the stem changed how much sugar reached the roots overnight.' },
      marks: 3,
      model: {
        en: 'Phloem sap moves by pressure flow through sieve tubes; a cooler sap is more viscous, so it flows more slowly through the sieve plates, but cooling also lowers the leaf\'s own respiration so more of the starch bank is exported rather than used. The best night is a balance — the coldest night is not the best.',
      },
      points: [{ en: 'cooler sap is more viscous → slower flow through sieve plates' }, { en: 'cooling lowers respiration in the leaf → more available to export' }, { en: 'the amount sent is a balance of the two' }],
    },
  },
}

function withExplain(section: Section): Section {
  return {
    ...section,
    pages: section.pages.map((p) => {
      if (!p.practical) return p
      const explain = EXPLAIN_BY_DOOR[p.practical.door]
      if (!explain) return p
      // The record stamps the section's statements, so the explain items
      // carry them — the door's question, the section's evidence.
      const stamped = Object.fromEntries(
        Object.entries(explain).map(([band, item]) => [band, { ...item, stamps: p.practical!.stampsBy?.[band as Band] ?? p.practical!.stamps }]),
      ) as Explain
      const practical: Practical = { ...p.practical, explain: stamped }
      return { ...p, practical }
    }),
  }
}

export const BOOK_0610: Book = {
  id: 'biology-0610',
  subject: 'Biology',
  syllabus: '0610',
  cabinet: 'photosynthesis',
  chapters: [CH06, CH08].map((c) => ({ ...c, sections: c.sections.map(withExplain) })),
}
