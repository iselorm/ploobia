/**
 * Learning bands — the platform-wide depth setting.
 *
 * One simulation, three layers of academic complexity. The band never changes
 * the underlying physics; it changes vocabulary, which controls exist, which
 * tools unlock, and how honest the instruments are about uncertainty.
 *
 * Stored in a tiny module-level store so the choice survives hash-route
 * navigation, and mirrored to persistent storage (where the browser allows it)
 * so it also survives a reload — a learner should not be dropped back to
 * Scientist every time a tablet reloads the page.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { read, write } from './persist'

export type Band = 'explorer' | 'scientist' | 'analyst'

export interface BandMeta {
  id: Band
  label: string
  ages: string
  question: string
  blurb: string
  tint: string
  tintSoft: string
}

export const BANDS: BandMeta[] = [
  {
    id: 'explorer',
    label: 'Explorer',
    ages: '10–12',
    question: 'What happens if I…?',
    blurb: 'Poke everything. Watch the world react. Collect readings and compare them.',
    tint: '#E8A33D',
    tintSoft: '#FBEBD2',
  },
  {
    id: 'scientist',
    label: 'Scientist',
    ages: '13–15',
    question: 'Why did that happen?',
    blurb: 'Change one variable, control the rest, predict the result, then plot the curve.',
    tint: '#3E7C43',
    tintSoft: '#DDEBD9',
  },
  {
    id: 'analyst',
    label: 'Analyst',
    ages: '16–17',
    question: 'Can I model it and defend a conclusion?',
    blurb:
      'Repeat readings, quantify uncertainty, spot anomalies, compare competing explanations, write it up.',
    tint: '#2E6DA8',
    tintSoft: '#D9E6F2',
  },
]

export const BAND_META: Record<Band, BandMeta> = {
  explorer: BANDS[0],
  scientist: BANDS[1],
  analyst: BANDS[2],
}

/** What each band unlocks. Cabinets read these flags instead of switching on the band id. */
export interface BandCaps {
  /** How technical the on-screen wording gets. */
  vocab: 'simple' | 'formal' | 'technical'
  /** Show the "investigate one variable, control the others" framing. */
  controlledVariables: boolean
  /** Show the numeric results table (not just the graph). */
  dataTable: boolean
  /** 'none' | 'direction' (higher/lower/same) | 'point' (drag a marker onto the graph). */
  prediction: 'none' | 'direction' | 'point'
  /** Fractional standard deviation added to every instrument reading. */
  noise: number
  /** Offer 3-repeat trials with a mean and range. */
  repeats: boolean
  /** Show real units, equations and rate values rather than friendly words. */
  quantitative: boolean
  /** Show the water-use-efficiency read-out. */
  waterEfficiency: boolean
  /** Show the structured conclusion builder. */
  conclusion: boolean
  /** Show the limiting-factor sensitivity bars. */
  sensitivity: boolean
  /** Allow CSV download of the results table. */
  exportData: boolean
  /** Length of one measurement trial, in seconds. */
  trialSeconds: number
  /* ---- practical-skills flags (Motion Lab onward) ---- */
  /** The learner places the best-fit line and reads the gradient themselves. */
  learnerPlotsGraph: boolean
  /** Motion sensor (position every 20 ms) can be unlocked. */
  motionSensor: boolean
  /** Which equations of motion the equation beats show. */
  suvat: 'none' | 'linear' | 'full'
  /** Jupiter and the Sun on the gravity dial. */
  extraWorlds: boolean
  /** Quote uncertainties (± half-range, sensor fit error). */
  uncertainty: boolean
  /** How much the stopwatch says about each tap. */
  reactionFeedback: 'flick' | 'number' | 'spread'
  /* ---- chemistry flags (Atom Foundry onward) ---- */
  /** Neutron hopper + stability meter are exposed (otherwise the common isotope loads itself). */
  isotopes: boolean
  /** Electron-cloud view toggle (the honest quantum picture next to the Bohr rings). */
  electronCloud: boolean
  /* ---- geography flags (River & Flood Bench onward) ---- */
  /** The flow meter can be earned (Explorer keeps the honest orange float). */
  fieldMeter: boolean
  /** Flood defences carry costs and a budget (cost–benefit reasoning). */
  floodBudget: boolean
  /** The Hjulström curve panel (erosion/transport/deposition thresholds). */
  hjulstrom: boolean
}

export const BAND_CAPS: Record<Band, BandCaps> = {
  explorer: {
    vocab: 'simple',
    controlledVariables: false,
    dataTable: false,
    prediction: 'direction',
    noise: 0,
    repeats: false,
    quantitative: false,
    waterEfficiency: false,
    conclusion: false,
    sensitivity: false,
    exportData: false,
    trialSeconds: 4,
    learnerPlotsGraph: false,
    motionSensor: false,
    suvat: 'none',
    extraWorlds: false,
    uncertainty: false,
    reactionFeedback: 'flick',
    isotopes: false,
    electronCloud: false,
    fieldMeter: false,
    floodBudget: false,
    hjulstrom: false,
  },
  scientist: {
    vocab: 'formal',
    controlledVariables: true,
    dataTable: true,
    prediction: 'point',
    noise: 0.03,
    repeats: false,
    quantitative: true,
    waterEfficiency: true,
    conclusion: true,
    sensitivity: true,
    exportData: true,
    trialSeconds: 6,
    learnerPlotsGraph: true,
    motionSensor: true,
    suvat: 'linear',
    extraWorlds: false,
    uncertainty: false,
    reactionFeedback: 'number',
    isotopes: true,
    electronCloud: false,
    fieldMeter: true,
    floodBudget: false,
    hjulstrom: false,
  },
  analyst: {
    vocab: 'technical',
    controlledVariables: true,
    dataTable: true,
    prediction: 'point',
    noise: 0.075,
    repeats: true,
    quantitative: true,
    waterEfficiency: true,
    conclusion: true,
    sensitivity: true,
    exportData: true,
    trialSeconds: 6,
    learnerPlotsGraph: true,
    motionSensor: true,
    suvat: 'full',
    extraWorlds: true,
    uncertainty: true,
    reactionFeedback: 'spread',
    isotopes: true,
    electronCloud: true,
    fieldMeter: true,
    floodBudget: true,
    hjulstrom: true,
  },
}

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

const BAND_KEY = 'ploobia.band.v1'
const VALID: string[] = ['explorer', 'scientist', 'analyst']

function loadBand(): Band {
  const saved = read<string>(BAND_KEY, 'scientist')
  return VALID.includes(saved) ? (saved as Band) : 'scientist'
}

let current: Band = loadBand()
const listeners = new Set<() => void>()

export function getBand(): Band {
  return current
}

export function setBand(band: Band): void {
  if (band === current) return
  current = band
  write(BAND_KEY, band)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Read the current band and a setter. Re-renders on change, anywhere in the app. */
export function useBand(): [Band, (b: Band) => void] {
  const band = useSyncExternalStore(subscribe, getBand, getBand)
  const set = useCallback((b: Band) => setBand(b), [])
  return [band, set]
}

/** Convenience: current band's capability flags. */
export function useBandCaps(): BandCaps {
  const [band] = useBand()
  return BAND_CAPS[band]
}

/**
 * Pick the wording that matches the current band.
 * `t({ simple: 'hot', formal: 'high temperature', technical: 'supra-optimal' }, caps)`
 */
export function t(
  variants: { simple: string; formal?: string; technical?: string },
  caps: BandCaps,
): string {
  if (caps.vocab === 'technical') return variants.technical ?? variants.formal ?? variants.simple
  if (caps.vocab === 'formal') return variants.formal ?? variants.simple
  return variants.simple
}
