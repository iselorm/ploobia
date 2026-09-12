/**
 * The Sugar Line's verbs — what a word in the field guide can do here.
 *
 * Every entry in `SUGAR_VERBS` is something the cabinet can honestly show:
 * the stage and viewpoint, a dial (through the same capped handler the
 * sliders use), a cut, the tracer, the starch bank, a tissue lit for a few
 * seconds. The list is static so the model suite can check every book
 * against it without a browser; `registerSugarVerbs` binds the same ids to
 * the live page while the cabinet is mounted.
 *
 * Verbs on the page's own figure (`figure/<layer>`) are not here: the page
 * card answers those itself, because the figure is the page's, not the
 * cabinet's.
 */

import { registerVerbs } from './verbs'
import type { StageId } from './sugarsim'

export const SUGAR_VERBS = [
  // where the camera goes
  'plant/overview',
  'plant/canopy',
  'plant/roots',
  'plant/stemCut',
  'plant/backlit',
  'leaf/inside',
  'leaf/cycle',
  'leaf/vision',
  'pore/open',
  'pore/close',
  'pore/skin',
  'stem/section',
  'stem/plate',
  'stem/xylem',
  'stem/phloem',
  'stem/support',
  // the knife and the tracer
  'xylem/flow',
  'xylem/cut',
  'xylem/heal',
  'phloem/cut',
  'phloem/heal',
  'phloem/flow',
  // the dials, through the capped handler
  'light/up',
  'light/down',
  'co2/up',
  'co2/down',
  'temp/warm',
  'temp/cool',
  'water/pour',
  'water/dry',
  'air/dry',
  'air/humid',
  // night, the bank, the wilt
  'night/on',
  'night/off',
  'starch/bank',
  'leaf/wilt',
  // the specimen
  'specimen/bean',
  'specimen/maize',
  'specimen/cactus',
] as const

export type SugarVerb = (typeof SUGAR_VERBS)[number]

/** What the page needs from the cabinet to answer its verbs. */
export interface SugarVerbApi {
  stage: (s: StageId) => void
  view: (id: string) => void
  /** The capped conditions handler — the same one the sliders use. */
  patch: (p: {
    light?: number
    co2?: number
    tempC?: number
    soilWater?: number
    night?: boolean
    girdled?: boolean
    xylemCut?: boolean
  }) => void
  humidity: (h: number) => void
  hatch: (h: number) => void
  vision: (on: boolean) => void
  /** Watering the pot, exactly as the can does. */
  water: () => void
  /** Release a labelled parcel down the sieve tube. */
  tracer: () => void
  bankStarch: (mg: number) => void
  specimen: (id: string) => void
  /** Light one tissue in the cut stem for a few seconds. */
  spotlight: (tissue: 'xylem' | 'phloem') => void
}

export const SUGAR_VERB_SCOPE = 'sugar'

/** Bind every Sugar Line verb to the live page. Returns the effect cleanup. */
export function registerSugarVerbs(api: SugarVerbApi): () => void {
  const go = (s: StageId, v?: string) => () => {
    api.stage(s)
    if (v) api.view(v)
  }
  return registerVerbs(SUGAR_VERB_SCOPE, {
    'plant/overview': go('plant', 'overview'),
    'plant/canopy': go('plant', 'canopy'),
    'plant/roots': go('plant', 'roots'),
    'plant/stemCut': go('plant', 'stem'),
    'plant/backlit': go('plant', 'backlit'),
    'leaf/inside': go('leaf', 'inside'),
    'leaf/cycle': go('leaf', 'cycle'),
    'leaf/vision': () => {
      api.stage('leaf')
      api.view('cycle')
      api.vision(true)
    },
    'pore/open': () => {
      api.stage('hatches')
      api.view('pore')
      api.hatch(1)
    },
    'pore/close': () => {
      api.stage('hatches')
      api.view('pore')
      api.hatch(0)
    },
    'pore/skin': go('hatches', 'skin'),
    'stem/section': go('stem', 'section'),
    'stem/plate': go('stem', 'plate'),
    'stem/xylem': () => {
      api.stage('stem')
      api.view('section')
      api.spotlight('xylem')
    },
    'stem/phloem': () => {
      api.stage('stem')
      api.view('section')
      api.spotlight('phloem')
    },
    // Support is the wood's other job: the whole-plant stem shot with the
    // xylem lit. Watching it fail is `xylem/cut`, one tap away, never a
    // surprise on the word "up".
    'stem/support': () => {
      api.stage('plant')
      api.view('stem')
      api.spotlight('xylem')
    },
    'xylem/flow': () => {
      api.stage('stem')
      api.view('section')
      api.spotlight('xylem')
    },
    'xylem/cut': () => {
      api.stage('stem')
      api.patch({ xylemCut: true })
    },
    'xylem/heal': () => api.patch({ xylemCut: false }),
    'phloem/cut': () => {
      api.stage('stem')
      api.patch({ girdled: true })
    },
    'phloem/heal': () => api.patch({ girdled: false }),
    'phloem/flow': () => {
      api.stage('stem')
      api.view('section')
      api.tracer()
    },
    'light/up': () => api.patch({ light: 1 }),
    'light/down': () => api.patch({ light: 0.15 }),
    'co2/up': () => api.patch({ co2: 1 }),
    'co2/down': () => api.patch({ co2: 0.2 }),
    'temp/warm': () => api.patch({ tempC: 32 }),
    'temp/cool': () => api.patch({ tempC: 14 }),
    'water/pour': () => api.water(),
    'water/dry': () => api.patch({ soilWater: 0.05 }),
    'air/dry': () => api.humidity(0.2),
    'air/humid': () => api.humidity(0.9),
    'night/on': () => api.patch({ night: true }),
    'night/off': () => api.patch({ night: false }),
    'starch/bank': () => api.bankStarch(60),
    'leaf/wilt': () => {
      api.stage('plant')
      api.view('overview')
      api.patch({ soilWater: 0 })
    },
    'specimen/bean': () => api.specimen('bean'),
    'specimen/maize': () => api.specimen('maize'),
    'specimen/cactus': () => api.specimen('opuntia'),
  })
}
