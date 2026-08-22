/**
 * Missions — the thing that turns a sandbox into an investigation.
 *
 * Every mission completes on RECORDED EVIDENCE, never on a slider happening to
 * sit in the right place. You have to measure it and keep the data, which is
 * the habit the whole cabinet is trying to build.
 */

import type { Band } from './bands'
import type { SkillId } from './events'
import { LEAF_BY_ID } from './leaves'
import { hasPlateau, seriesFor, type Reading } from './ratelab'

export interface Mission {
  id: string
  title: string
  /** What to do. */
  brief: string
  /** The payoff sentence, revealed on completion — this is where the idea lands. */
  reward: string
  /** Lowest band that sees this mission. */
  minBand: Band
  /** Which skill track this mission's evidence exercises (feeds progression). */
  skill: SkillId
  check: (readings: Reading[]) => boolean
}

const BAND_RANK: Record<Band, number> = { explorer: 0, scientist: 1, analyst: 2 }

function bucketBy(readings: Reading[], key: (r: Reading) => number, width: number) {
  const groups = new Map<number, Reading[]>()
  readings.forEach((r) => {
    const b = Math.round(key(r) / width)
    const list = groups.get(b) ?? []
    list.push(r)
    groups.set(b, list)
  })
  return groups
}

export const MISSIONS: Mission[] = [
  {
    id: 'wake-up',
    title: 'Wake the leaf up',
    brief: 'Run a measurement that reads more than 5 bubbles per minute of oxygen.',
    reward:
      'That stream of bubbles is oxygen — the leftover from splitting water. The plant is not "breathing out": it is throwing away a waste product it has no use for.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (rs) => rs.some((r) => r.y > 5),
  },
  {
    id: 'switch-off',
    title: 'Switch the factory off',
    brief:
      'Get a reading of zero or below. Something has to run out — or go badly wrong — before the bubbles stop.',
    reward:
      'Below zero, the plant is using up more oxygen than it makes. Plants respire every second of every day, exactly like you do; in bright light photosynthesis simply outruns it and hides it.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (rs) => rs.some((r) => r.y <= 0),
  },
  {
    id: 'desert-showdown',
    title: 'Desert showdown',
    brief:
      'Set the climate to hot desert. Measure the rainforest broadleaf there, then measure the cactus pad in the same conditions.',
    reward:
      'The big leaf is faster on paper and dies anyway — it cannot stop leaking. The cactus is slow on purpose: a sealed leaf keeps water in but also keeps CO₂ out. There is no way to be both fast and thrifty.',
    minBand: 'explorer',
    skill: 'controlling',
    check: (rs) => {
      const desert = rs.filter((r) => r.biomeId === 'desert')
      return (
        desert.some((r) => r.leafId === 'rainforest') && desert.some((r) => r.leafId === 'desert')
      )
    },
  },
  {
    id: 'light-plateau',
    title: 'Find the light plateau',
    brief:
      'Investigate light. Record at least four trials spanning dim to full sun, and keep going until extra light stops buying extra rate.',
    reward:
      'The curve bends and flattens. Once light is plentiful the leaf is no longer waiting on photons — something else has become the limiting factor, and the height of that flat part tells you what it can do.',
    minBand: 'scientist',
    skill: 'interpreting',
    check: (rs) => hasPlateau(seriesFor(rs, 'light'), 'light'),
  },
  {
    id: 'compensation-point',
    title: 'Pin down the compensation point',
    brief:
      'Find the light intensity where the net reading sits at zero. You will need readings on both sides of it — one clearly positive, one clearly negative.',
    reward:
      'At the compensation point photosynthesis exactly cancels respiration. A leaf permanently below it starves, which is why the bottom leaves of a dense plant are shed and why shade-grown crops fail.',
    minBand: 'scientist',
    skill: 'interpreting',
    check: (rs) =>
      rs.some((r) => r.y >= 5) && rs.some((r) => r.y <= -1.5) && rs.some((r) => Math.abs(r.y) <= 2),
  },
  {
    id: 'co2-ceiling',
    title: 'Raise the ceiling with CO₂',
    brief:
      'Run a light series at low CO₂, then run a second light series with CO₂ at least 300 ppm higher. Compare the two plateaus.',
    reward:
      'Extra CO₂ does almost nothing in dim light and a great deal in bright light. That is the whole logic of a limiting factor: only the ingredient in shortest supply is worth adding — and it is why commercial greenhouses pump in CO₂ but only under lamps.',
    minBand: 'scientist',
    skill: 'controlling',
    check: (rs) => {
      const light = seriesFor(rs, 'light').filter((r) => r.x >= 800)
      const groups = [...bucketBy(light, (r) => r.controls.co2, 150).entries()]
        .filter(([, list]) => list.length >= 2)
        .map(([bucket, list]) => ({ co2: bucket * 150, peak: Math.max(...list.map((r) => r.y)) }))
        .sort((a, b) => a.co2 - b.co2)
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          if (groups[j].co2 - groups[i].co2 >= 300 && groups[j].peak >= groups[i].peak * 1.15) {
            return true
          }
        }
      }
      return false
    },
  },
  {
    id: 'heat-cliff',
    title: 'Walk off the heat cliff',
    brief:
      'Investigate temperature. Take at least four readings, including one above 42 °C, and find where the rate collapses.',
    reward:
      'Rate climbs with temperature — until the enzymes denature and their shape is destroyed. Notice the curve is not symmetrical: warming up is gradual and reversible, cooking is sudden and permanent.',
    minBand: 'scientist',
    skill: 'interpreting',
    check: (rs) => {
      const s = seriesFor(rs, 'temp')
      if (s.length < 4) return false
      const peak = Math.max(...s.map((r) => r.y))
      if (peak < 4) return false
      return s.some((r) => r.x >= 42 && r.y <= peak * 0.4)
    },
  },
  {
    id: 'c4-advantage',
    title: 'Explain the C4 advantage',
    brief:
      'In bright light above 34 °C, measure the temperate broadleaf and then the C4 savanna blade. Show the C4 leaf winning.',
    reward:
      'The C3 leaf is losing output to photorespiration: hot and bright, its RuBisCO keeps grabbing O₂ instead of CO₂. The C4 pump keeps CO₂ concentrated so the mistake almost never happens — which is why maize and sugarcane own the tropics and wheat owns the cool temperate zone.',
    minBand: 'analyst',
    skill: 'controlling',
    check: (rs) => {
      const hot = rs.filter((r) => r.controls.temp >= 34 && r.controls.light >= 1400)
      const c4 = hot.filter((r) => LEAF_BY_ID[r.leafId]?.pathway === 'C4')
      const c3 = hot.filter((r) => LEAF_BY_ID[r.leafId]?.pathway === 'C3')
      if (c4.length === 0 || c3.length === 0) return false
      return Math.max(...c4.map((r) => r.y)) > Math.max(...c3.map((r) => r.y)) * 1.2
    },
  },
  {
    id: 'wue-audit',
    title: 'Audit water use efficiency',
    brief:
      'Pick one climate and hold it fixed. Measure three different leaf types in it, so you can compare sugar made per unit of water lost.',
    reward:
      'Rate alone never explains which plant wins a habitat — efficiency does. Sort your three leaves by rate, then by water use efficiency, and notice the order changes. That reordering is the whole reason deserts, savannas and rainforests have completely different floras.',
    minBand: 'analyst',
    skill: 'measuring',
    check: (rs) => {
      const byBiome = new Map<string, Set<string>>()
      rs.forEach((r) => {
        const set = byBiome.get(r.biomeId) ?? new Set<string>()
        set.add(r.leafId)
        byBiome.set(r.biomeId, set)
      })
      return [...byBiome.values()].some((set) => set.size >= 3)
    },
  },
  {
    id: 'prediction-streak',
    title: 'Trust your model',
    brief:
      'Commit a prediction before running the trial, and land within 15% of the measured value three times.',
    reward:
      'Predicting correctly is the only proof that you understand the mechanism rather than remembering the shape of a graph. Your model of the leaf now works.',
    minBand: 'analyst',
    skill: 'predicting',
    check: (rs) =>
      rs.filter(
        (r) =>
          r.predicted !== null &&
          Math.abs(r.predicted - r.y) <= Math.max(1.5, Math.abs(r.y) * 0.15),
      ).length >= 3,
  },
]

export function missionsForBand(band: Band): Mission[] {
  return MISSIONS.filter((m) => BAND_RANK[m.minBand] <= BAND_RANK[band])
}
