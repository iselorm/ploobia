/**
 * Cabinet registry — what the arcade hall shows and how the platform refers to
 * each simulation. Curriculum mapping and sponsorship hang off this id.
 */

import type { CabinetId } from './events'

export interface CabinetMeta {
  id: CabinetId
  route: string
  title: string
  subject: string
  tagline: string
  cta: string
  tint: string
  tintSoft: string
  /**
   * `undiscovered` — built nowhere yet. The hall shows it dashed and says
   * "nobody has discovered what is behind it yet"; never "coming soon"
   * (house rule, same as a campaign door — see lib/campaign.ts).
   */
  status: 'live' | 'undiscovered'
  /** Live and routable, but not shown in the hall (reached from another cabinet). */
  hidden?: boolean
  /** Whether the cabinet ships a guided demo the hall can launch. */
  hasDemo: boolean
  /** IGCSE-ish topic tags for the mapping layer (kept short here). */
  topics: string[]
}

export const CABINETS: CabinetMeta[] = [
  {
    id: 'photosynthesis',
    route: '/photosynthesis',
    title: 'The Sugar Line',
    subject: 'Biology',
    tagline:
      'A leaf makes sugar out of air, water and light — then it has to get it somewhere. Run the line from chloroplast to tuber, and cut the pipe to prove what stalls it.',
    cta: 'Run the line',
    tint: '#3E7C43',
    tintSoft: '#DDEBD9',
    status: 'live',
    hasDemo: true,
    topics: [
      'Photosynthesis',
      'Limiting factors',
      'Transport in plants',
      'Translocation & phloem',
      'Practical skills',
    ],
  },
  {
    id: 'blood',
    route: '/blood',
    title: 'Blood Voyage',
    subject: 'Biology',
    tagline: 'Ride the full oxygen loop — lungs to heart to capillary to living cells — and watch your red cell load, carry and deliver its O\u2082.',
    cta: 'Ride the river of blood',
    tint: '#C13B33',
    tintSoft: '#F6DEDC',
    status: 'live',
    hasDemo: false,
    topics: ['Blood components', 'Circulation', 'Gas exchange', 'Cells & respiration', 'Immune response'],
  },
  {
    id: 'physics',
    route: '/physics',
    title: 'First Physics',
    subject: 'Physics',
    tagline: 'One thing at a time. Drag it, time it, push it — and watch each idea earn its equation.',
    cta: 'Start with one Ploob',
    tint: '#2E6DA8',
    tintSoft: '#D9E6F2',
    status: 'live',
    hasDemo: false,
    topics: ['Distance & speed', 'Distance–time graphs', 'Forces as arrows', 'Balanced forces', 'Friction', 'Weight & gravity'],
  },
  {
    id: 'motion',
    route: '/motion',
    hidden: true,
    title: 'Motion Yard',
    subject: 'Physics',
    tagline: 'Race it, launch it, drop it. Every flight wears its own numbers — and gravity retunes the whole world.',
    cta: 'Enter the yard',
    tint: '#2E6DA8',
    tintSoft: '#D9E6F2',
    status: 'live',
    hasDemo: true,
    topics: ['Speed & motion graphs', 'Projectiles & launchers', 'Falling & gravity', 'Timing & reaction time', 'Practical skills'],
  },
  {
    id: 'atoms',
    route: '/atoms',
    title: 'The Foundry',
    subject: 'Chemistry',
    tagline: 'Catch protons, neutrons and electrons, forge an atom to order, and light its tile on the wall — then send the link and say "beat that".',
    cta: 'Enter the foundry',
    tint: '#B97D10',
    tintSoft: '#FBEBD2',
    status: 'live',
    hasDemo: false,
    topics: ['Atomic structure', 'Isotopes & ions', 'Element identity', 'Periodic table'],
  },
  {
    id: 'rivers',
    route: '/rivers',
    title: 'River & Flood Bench',
    subject: 'Geography',
    tagline: 'One river, source to sea. Time the float, follow your pebble, read the gauge — then make it rain and defend the village.',
    cta: 'Enter the basin',
    tint: '#2E6DA8',
    tintSoft: '#D9E6F2',
    status: 'live',
    hasDemo: true,
    topics: ['River processes', 'Flood hydrographs', 'Erosion & deposition', 'Fieldwork skills', 'Flood management'],
  },
  {
    id: 'numberworks',
    route: '/numberworks',
    title: 'The Numberworks',
    subject: 'Mathematics',
    tagline: 'A stall at Kejetia. Put a price on the board, open the stall, and count the till — ratio and percentage the way the market has always taught them.',
    cta: 'Set out the stall',
    tint: '#B5541C',
    tintSoft: '#F6E3D7',
    status: 'live',
    hasDemo: false,
    topics: ['Ratio & proportion', 'Percentage change', 'Sequences', 'Bounds & accuracy', 'Money'],
  },
  {
    id: 'circuits',
    route: '/circuits',
    title: 'Circuit Workshop',
    subject: 'Physics',
    tagline: 'Build it, measure it, break it. Ohm’s law you can hold.',
    cta: 'Nobody has been in yet',
    tint: '#E8A33D',
    tintSoft: '#FBEBD2',
    status: 'undiscovered',
    hasDemo: false,
    topics: ['Current & voltage', 'Resistance', 'Series & parallel'],
  },
]

export const CABINET_BY_ID: Record<string, CabinetMeta> = Object.fromEntries(CABINETS.map((c) => [c.id, c]))
