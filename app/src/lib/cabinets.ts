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
  status: 'live' | 'soon'
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
    id: 'motion',
    route: '/motion',
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
    title: 'Atom Foundry',
    subject: 'Chemistry',
    tagline: 'Stack protons, pour electrons, watch the shells fill — and forge the periodic table onto a dark wall, one atom at a time.',
    cta: 'Enter the foundry',
    tint: '#B97D10',
    tintSoft: '#FBEBD2',
    status: 'live',
    hasDemo: true,
    topics: ['Atomic structure', 'Periodic table & trends', 'Isotopes & ions', 'Ionisation energy'],
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
    id: 'circuits',
    route: '/circuits',
    title: 'Circuit Workshop',
    subject: 'Physics',
    tagline: 'Build it, measure it, break it. Ohm’s law you can hold.',
    cta: 'Coming soon',
    tint: '#E8A33D',
    tintSoft: '#FBEBD2',
    status: 'soon',
    hasDemo: false,
    topics: ['Current & voltage', 'Resistance', 'Series & parallel'],
  },
]

export const CABINET_BY_ID: Record<string, CabinetMeta> = Object.fromEntries(CABINETS.map((c) => [c.id, c]))
