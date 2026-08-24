/**
 * The place each specimen actually grows in.
 *
 * The Sugar Line spent its first build on a white field-guide plate, which is
 * honest but placeless: a cactus and a bean stood on the same cream disc and
 * the only thing that changed between them was the silhouette. Selorm's note
 * was that the old Rate Lab's garden — grass, sky, weather — was a real part
 * of the appeal, and he is right; a plant with nowhere to be is a diagram of a
 * plant.
 *
 * So the habitat comes back, with three rules that keep it from becoming the
 * noise he was worried about:
 *
 *  1. **It is the specimen's own habitat, not a dial.** A prickly pear stands
 *     in desert, maize in savanna, bean and potato and tomato in temperate
 *     ground. There is no extra control to learn, and the world becomes
 *     evidence for the numbers rather than decoration beside them.
 *  2. **It lives in a ring, outside the working radius.** Nothing grows within
 *     `INNER` units of the plant, so ground cover can never crowd the thing
 *     being measured.
 *  3. **It is tiered, and it is switchable.** A tablet gets sky, ground and a
 *     horizon; the plate is always one press away for anyone who wants the
 *     numbers with no scenery behind them.
 *
 * Only the whole-plant stage gets scenery. Inside a leaf and inside the stem
 * are microscope views — a rainforest behind a chloroplast would be a lie —
 * so those stages keep the habitat only as the *colour of the light*, which is
 * exactly what would actually reach them.
 */

import * as THREE from 'three'
import type { BiomeId } from './leaves'
import { BIOME_BY_ID } from './leaves'
import { SPECIMEN_BY_ID, DEFAULT_SPECIMEN } from './specimens'
import { WORLD_PRESETS } from './world'
import { CO2_MAX_PPM, CO2_AMBIENT_PPM } from './ratelab'

/* ------------------------------------------------------------------ */
/* Geometry of the ring                                               */
/* ------------------------------------------------------------------ */

/**
 * Ground cover starts here. Inside it is the learner's working space.
 *
 * This radius is a *composition* choice — how much bare working ground sits
 * around the specimen. Keeping the camera out of the cover is a separate job,
 * done per-blade in the shader (blades within ~2 units of the eye shrink to
 * nothing), because pushing the ring out far enough to clear the lowest
 * viewpoint left a bald patch half the frame wide from the default one.
 */
export const HABITAT_INNER = 2.0
/** Ground cover stops here; beyond is flat ground running to the horizon. */
export const HABITAT_OUTER = 19
/** The ground disc's radius. Fog closes long before this. */
export const HABITAT_GROUND = 62
/** Where the silhouette band stands. Far enough to read as distance. */
export const HABITAT_HORIZON = 30
/**
 * Ground level.
 *
 * Sits just under the soil mound's base, so outdoors the specimen is *planted*
 * rather than presented — which is the whole point of bringing the habitat
 * back. The roots then live below the surface, and the ground turns to glass
 * when the camera ducks beneath it (see `Habitat`'s x-ray), which is both the
 * classic soil-pit drawing and a great deal more legible than the sectioned
 * block of earth two earlier passes tried and threw away.
 */
export const HABITAT_FLOOR = -0.02

/* ------------------------------------------------------------------ */
/* What a habitat looks like                                          */
/* ------------------------------------------------------------------ */

/** The shape of the things standing on the horizon. */
export type SkylineKind = 'canopy' | 'broadleaf' | 'acacia' | 'butte' | 'conifer'

/** What drifts through the air. */
export type AirKind = 'pollen' | 'dust' | 'spores' | 'flakes'

export interface HabitatPreset {
  id: BiomeId
  /** Plain-language name for the plate. */
  name: string
  /** One word for a chip. */
  short: string
  /** Six sky stops, zenith → below horizon. */
  sky: [string, string, string, string, string, string]
  /** Sun colour and elevation/azimuth in radians. */
  sun: string
  sunElevation: number
  sunAzimuth: number
  /** Hemisphere light. */
  hemiSky: string
  hemiGround: string
  /** Ground, in three bands from near to far. */
  soilNear: string
  soilFar: string
  /** The silhouette band. */
  hills: string
  skyline: SkylineKind
  /** 0–1: how much of the horizon the skyline occupies. */
  skylineDensity: number
  skylineHeight: number
  /** Ground cover. */
  bladeBase: string
  bladeTip: string
  bladeDensity: number
  bladeHeight: number
  /** Scattered ground clutter (stones, litter, tussocks) 0–1. */
  clutter: number
  clutterColor: string
  /** Air. */
  air: AirKind
  airColor: string
  airDensity: number
  /** Rain streaks, 0–1. High tier only. */
  rain: number
  /** Heat shimmer over the ground, 0–1. High tier only. */
  shimmer: number
  /** Fog distances. Near fog is what stops the horizon shouting. */
  fogNear: number
  fogFar: number
  fogColor: string
  /** Typical conditions here, for the "match this habitat" button. */
  conditions: {
    light: number
    tempC: number
    humidity: number
    soilWater: number
    co2: number
  }
  /** One sentence of field note for the plate. */
  note: string
  /** Rainfall in mm/year, for the plate. */
  rainfall: number
}

/**
 * Build a habitat from the two presets that already exist — `WORLD_PRESETS`
 * carries the lighting state the Rate Lab's garden was tuned with, and
 * `BIOMES` carries the physiology. Nothing here is a new palette invented by
 * eye; it is the two tables joined, then warmed toward the atlas paper so the
 * subject still sits in a bright scene.
 */
/** Lighten a colour, optionally pulling it toward a second one first. */
function lighten(hex: string, by: number, toward?: string, amount = 0): string {
  const c = new THREE.Color(hex)
  if (toward) c.lerp(new THREE.Color(toward), amount)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s * 0.88, Math.min(0.92, hsl.l * by))
  return `#${c.getHexString()}`
}

function habitat(
  id: BiomeId,
  extra: Pick<
    HabitatPreset,
    | 'skyline'
    | 'skylineDensity'
    | 'skylineHeight'
    | 'clutter'
    | 'clutterColor'
    | 'air'
    | 'airColor'
    | 'airDensity'
    | 'shimmer'
    | 'sunElevation'
    | 'sunAzimuth'
  >,
): HabitatPreset {
  const w = WORLD_PRESETS[id]
  const b = BIOME_BY_ID[id]
  return {
    id,
    name: b.name,
    short: b.short,
    sky: w.sky,
    sun: w.sun,
    hemiSky: w.hemiSky,
    hemiGround: w.hemiGround,
    soilNear: b.ground,
    soilFar: w.sand,
    hills: b.hills,
    // The garden's blade palette lightened and pulled toward its own tip. Those
    // colours were tuned for a meadow you stand *in*, where you see blade faces;
    // here the ring is read from above at a grazing angle, where you see blade
    // bases, and the untouched palette turned the field darker than the crop.
    bladeBase: lighten(w.bladeBase, 1.34, w.bladeTip, 0.3),
    bladeTip: lighten(w.bladeTip, 1.12),
    bladeDensity: w.bladeDensity,
    bladeHeight: w.bladeHeight,
    rain: w.rain,
    // Fog is pulled in hard compared with the Rate Lab garden: this scene is
    // read from two metres away, not from a hilltop, so the horizon only has
    // to suggest a place, never compete for attention.
    fogNear: 14,
    fogFar: 82,
    fogColor: w.sky[4],
    conditions: {
      light: b.light,
      tempC: b.temp,
      humidity: b.humidity,
      soilWater: b.soilWater,
      co2: CO2_AMBIENT_PPM / CO2_MAX_PPM,
    },
    note: b.note,
    rainfall: b.rainfall,
    ...extra,
  }
}

export const HABITATS: Record<BiomeId, HabitatPreset> = {
  rainforest: habitat('rainforest', {
    skyline: 'canopy',
    skylineDensity: 0.95,
    skylineHeight: 1.5,
    clutter: 0.7,
    clutterColor: '#4A6B3C',
    air: 'spores',
    airColor: '#DFF3D8',
    airDensity: 0.85,
    shimmer: 0,
    sunElevation: 1.15,
    sunAzimuth: 0.6,
  }),
  temperate: habitat('temperate', {
    skyline: 'broadleaf',
    skylineDensity: 0.5,
    skylineHeight: 1,
    clutter: 0.45,
    clutterColor: '#7D8A63',
    air: 'pollen',
    airColor: '#FFF0BE',
    airDensity: 0.6,
    shimmer: 0,
    sunElevation: 0.92,
    sunAzimuth: 0.75,
  }),
  savanna: habitat('savanna', {
    skyline: 'acacia',
    skylineDensity: 0.26,
    skylineHeight: 0.92,
    clutter: 0.3,
    clutterColor: '#A08A4E',
    air: 'dust',
    airColor: '#F0DFAE',
    airDensity: 0.75,
    shimmer: 0.45,
    sunElevation: 1.28,
    sunAzimuth: 0.5,
  }),
  desert: habitat('desert', {
    skyline: 'butte',
    skylineDensity: 0.34,
    skylineHeight: 0.8,
    clutter: 0.55,
    clutterColor: '#BFA075',
    air: 'dust',
    airColor: '#F6E5C6',
    airDensity: 0.9,
    shimmer: 1,
    sunElevation: 1.34,
    sunAzimuth: 0.42,
  }),
  boreal: habitat('boreal', {
    skyline: 'conifer',
    skylineDensity: 0.75,
    skylineHeight: 1.35,
    clutter: 0.5,
    clutterColor: '#7C8A78',
    air: 'flakes',
    airColor: '#F2F7FA',
    airDensity: 0.5,
    shimmer: 0,
    sunElevation: 0.62,
    sunAzimuth: 0.95,
  }),
}

/* ------------------------------------------------------------------ */
/* Which habitat a specimen stands in                                 */
/* ------------------------------------------------------------------ */

/**
 * Straight off the specimen's leaf preset, which already declares
 * `nativeBiome`. No new table to keep in step with the specimen list — add a
 * sixth crop and it arrives with its habitat already chosen.
 */
export function biomeForSpecimen(specimenId: string): BiomeId {
  const specimen = SPECIMEN_BY_ID[specimenId] ?? SPECIMEN_BY_ID[DEFAULT_SPECIMEN]
  return specimen.leaf.nativeBiome
}

export function habitatForSpecimen(specimenId: string): HabitatPreset {
  return HABITATS[biomeForSpecimen(specimenId)]
}

/**
 * A one-line caption for the plate: where this is, and the single number that
 * makes the place matter to a plant.
 */
export function habitatCaption(h: HabitatPreset): string {
  return `${h.name} · ${h.rainfall} mm of rain a year`
}

/* ------------------------------------------------------------------ */
/* Sun direction                                                      */
/* ------------------------------------------------------------------ */

/**
 * Where the key light sits for a habitat, in world units.
 *
 * Deliberately never straight overhead: a low-ish sun gives the plant a long
 * contact shadow and a rim, which is most of what makes it read as a solid
 * object standing somewhere rather than a cut-out pasted on a backdrop.
 */
export function sunPosition(h: HabitatPreset, distance = 12): [number, number, number] {
  const y = Math.sin(h.sunElevation) * distance
  const r = Math.cos(h.sunElevation) * distance
  return [Math.cos(h.sunAzimuth) * r, y, Math.sin(h.sunAzimuth) * r]
}
