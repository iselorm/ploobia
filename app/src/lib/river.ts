/**
 * River & Flood Bench — the first geography cabinet. One 1D discharge model
 * along the course drives the visuals AND every instrument reading, so what
 * the learner sees and what they measure can never disagree.
 *
 * The valley is a journey (source → gorge → meanders → floodplain village →
 * mouth); the flood is telemetry (a live hydrograph at the gauge station);
 * the basin dial retunes the whole world the way the gravity dial does in
 * the Motion Yard. See the vault: Cabinet Spec — River & Flood Bench.
 */

import * as THREE from 'three'
import type { Band } from './bands'
import type { WorldPreset } from './world'
import { fbm } from './world'

/* ------------------------------------------------------------------ */
/* The course — distance s along the river, source 0 → mouth COURSE    */
/* ------------------------------------------------------------------ */

/**
 * The course runs source → mouth. A real basin, not a single line: the main
 * stem gathers TRIBUTARIES (each with its own valley), and every confluence
 * steps the catchment — and therefore the discharge, the channel and the
 * velocity — upward. That is why the lower river is bigger: not magic, but
 * arithmetic you can walk to.
 */
export const COURSE = 156
/** worldZ(s): the river flows toward +z. */
export function worldZ(s: number): number {
  return s - 74
}
export function uOf(s: number): number {
  return THREE.MathUtils.clamp(s / COURSE, 0, 1)
}

/** The headwaters: upland moor above the gorge, where the streams gather. */
export const HEAD1 = 30
/** The gorge reach (steep, strata walls, the waterfall). */
export const GORGE0 = 34
export const GORGE1 = 62
/** Waterfall position at year zero; it retreats upstream under the lens. */
export const FALLS_S0 = 46
export const FALLS_DROP = 3.4
/** The bend that will pinch into an ox-bow under the time-lapse lens. */
export const OXBOW_S = 112
/** The gauge station / village reach. */
export const GAUGE_S = 124
/** Where the channel breaks into distributaries and builds its delta. */
export const DELTA0 = 138
/** Where the village stands on the floodplain (distances along the course). */
export const VILLAGE_S = [124.5, 126.5, 128, 130, 131.5, 133, 134.5, 136]

export interface StationDef {
  id: 'st1' | 'st2' | 'st3'
  s: number
  name: string
  blurb: string
}
export const STATIONS: StationDef[] = [
  { id: 'st1', s: 56, name: 'Station 1 — below the falls', blurb: 'The gorge. Narrow, shallow, steep — white water over boulders.' },
  { id: 'st2', s: 88, name: 'Station 2 — the meanders', blurb: 'The middle course. Two tributaries in, and the channel is swinging.' },
  { id: 'st3', s: 124, name: 'Station 3 — the gauge', blurb: 'The floodplain, the village and the gauge station.' },
]
export const STATION_BY_ID: Record<string, StationDef> = Object.fromEntries(STATIONS.map((s) => [s.id, s]))

/** Distance between the two float poles at every station (metres). */
export const FLOAT_RUN = 6

/* ------------------------------------------------------------------ */
/* Tributaries — the drainage network                                  */
/* ------------------------------------------------------------------ */

export interface TributaryDef {
  id: string
  name: string
  /** Distance along the MAIN stem where it joins. */
  join: number
  /** -1 joins from the left bank (−x), +1 from the right. */
  side: -1 | 1
  /** Length of the tributary, world units. */
  len: number
  /** Join angle from the upstream direction, radians (acute = arrowhead). */
  angle: number
  /** Sideways bow of its course (world units). */
  bow: number
  /** Share of the basin's catchment this tributary delivers. */
  share: number
}

/**
 * Six named tributaries. The two big ones join in the middle course, which is
 * exactly where the main river visibly grows. Order matters only for drawing.
 */
export const TRIBUTARIES: TributaryDef[] = [
  { id: 'tb1', name: 'Moor Burn', join: 14, side: -1, len: 17, angle: 0.72, bow: 1.6, share: 0.05 },
  { id: 'tb2', name: 'Cold Sike', join: 24, side: 1, len: 15, angle: 0.66, bow: -1.3, share: 0.045 },
  { id: 'tb3', name: 'Scree Beck', join: 66, side: 1, len: 24, angle: 0.78, bow: 2.4, share: 0.09 },
  { id: 'tb4', name: 'Ash Water', join: 82, side: -1, len: 30, angle: 0.85, bow: -3.0, share: 0.115 },
  { id: 'tb5', name: 'Mill Brook', join: 104, side: 1, len: 27, angle: 0.9, bow: 2.6, share: 0.10 },
  { id: 'tb6', name: 'Fen Dike', join: 128, side: -1, len: 20, angle: 1.0, bow: -1.8, share: 0.05 },
]
export const TRIB_BY_ID: Record<string, TributaryDef> = Object.fromEntries(TRIBUTARIES.map((t) => [t.id, t]))

/** Blend half-width (world units) over which a confluence's water arrives. */
const JOIN_BLEND = 3

/**
 * A point on a tributary's centreline. t = 0 at its head, 1 at the confluence.
 * Computed against the un-migrated main stem so the network is stable.
 */
export function tribPoint(tb: TributaryDef, t: number, out: { x: number; z: number }): void {
  const jx = meanderX(tb.join, 0)
  const jz = worldZ(tb.join)
  // Head direction: outward from the bank and upstream, so it joins pointing
  // downstream — the arrowhead every drainage map shows.
  const dx = tb.side * Math.sin(tb.angle)
  const dz = -Math.cos(tb.angle)
  const k = (1 - t) * tb.len
  const bow = Math.sin(Math.PI * t) * tb.bow
  out.x = jx + dx * k + -dz * bow
  out.z = jz + dz * k + dx * bow
}

/** Cheap bounding circle per tributary, for early-out in the terrain loop. */
const TRIB_BOUNDS = TRIBUTARIES.map((tb) => {
  const p = { x: 0, z: 0 }
  let cx = 0
  let cz = 0
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= 8; i++) {
    tribPoint(tb, i / 8, p)
    pts.push([p.x, p.z])
    cx += p.x / 9
    cz += p.z / 9
  }
  let r = 0
  for (const [x, z] of pts) r = Math.max(r, Math.hypot(x - cx, z - cz))
  return { cx, cz, r: r + 18, pts }
})

/** Distance from (x,z) to a tributary's centreline, plus the t there. */
function tribDist(i: number, x: number, z: number): { d: number; t: number } {
  const b = TRIB_BOUNDS[i]
  if (Math.hypot(x - b.cx, z - b.cz) > b.r) return { d: 1e9, t: 0 }
  let best = 1e9
  let bestT = 0
  for (let k = 0; k < b.pts.length - 1; k++) {
    const [ax, az] = b.pts[k]
    const [bx, bz] = b.pts[k + 1]
    const vx = bx - ax
    const vz = bz - az
    const len2 = vx * vx + vz * vz
    let u = len2 > 1e-9 ? ((x - ax) * vx + (z - az) * vz) / len2 : 0
    u = THREE.MathUtils.clamp(u, 0, 1)
    const px = ax + vx * u
    const pz = az + vz * u
    const d = Math.hypot(x - px, z - pz)
    if (d < best) {
      best = d
      bestT = (k + u) / (b.pts.length - 1)
    }
  }
  return { d: best, t: bestT }
}

/** Channel half-width of a tributary at t (grows toward its mouth). */
export function tribW(tb: TributaryDef, t: number): number {
  return 0.35 + 1.5 * Math.pow(t, 0.8) * Math.pow(tb.share / 0.12, 0.5)
}

const tribPt = { x: 0, z: 0 }
/**
 * Bed elevation along a tributary. It is READ FROM THE LAND (the un-carved
 * valley surface) and incised a little, so the carve, the water ribbon and
 * the terrain can never disagree — the trap that produced floating ribbons.
 */
export function tribH(tb: TributaryDef, t: number, years = 0): number {
  tribPoint(tb, t, tribPt)
  const ground = valleyBaseH(tribPt.x, tribPt.z, years)
  const incise = 0.3 + 1.1 * Math.pow(t, 0.7)
  // Ease into the main channel so the confluence is flush.
  const mouth = bedH(tb.join, years)
  return THREE.MathUtils.lerp(ground - incise, mouth, THREE.MathUtils.smoothstep(t, 0.86, 1))
}

/**
 * How much the tributaries carve at (x, z): returns the depth to subtract and
 * a 0..1 mask of "this is tributary ground".
 */
export function tribCarve(x: number, z: number, years = 0): { drop: number; mask: number; floor: number } {
  // `drop` is now a 0..1 strength; `floor` is the bed to cut down to.
  let drop = 0
  let mask = 0
  let floor = 0
  for (let i = 0; i < TRIBUTARIES.length; i++) {
    const tb = TRIBUTARIES[i]
    const { d, t } = tribDist(i, x, z)
    if (d > 14) continue
    const w = tribW(tb, t)
    const valley = 3 + t * 7
    const m = 1 - THREE.MathUtils.smoothstep(d, w, w + valley)
    if (m <= 0.001) continue
    if (m > mask) {
      mask = m
      floor = tribH(tb, t, years)
    }
    drop = Math.max(drop, m)
  }
  return { drop, mask, floor }
}

/* ------------------------------------------------------------------ */
/* Catchment — the honest reason the river grows                       */
/* ------------------------------------------------------------------ */

const TRIB_TOTAL = TRIBUTARIES.reduce((a, t) => a + t.share, 0)

/**
 * Normalised catchment area drained at s (0 at the source, 1 at the mouth).
 * The main stem gathers steadily; each confluence adds its tributary's share
 * in one step. This single function drives discharge, width, depth — and so
 * the whole Bradshaw story is *caused* by the network, not asserted.
 */
export function catchmentAt(s: number): number {
  const u = uOf(s)
  let a = 0.05 + (1 - TRIB_TOTAL - 0.05) * Math.pow(u, 1.9)
  for (const tb of TRIBUTARIES) {
    a += tb.share * THREE.MathUtils.smoothstep(s, tb.join - JOIN_BLEND, tb.join + JOIN_BLEND)
  }
  return THREE.MathUtils.clamp(a, 0.02, 1.2)
}

/** The tributary whose confluence is nearest upstream of s (or null). */
export function lastConfluence(s: number): TributaryDef | null {
  let out: TributaryDef | null = null
  for (const tb of TRIBUTARIES) if (tb.join <= s) out = tb
  return out
}

/* ------------------------------------------------------------------ */
/* Long profile and channel geometry                                   */
/* ------------------------------------------------------------------ */

/** Waterfall position after `years` of retreat (the lens earns this). */
export function fallsAt(years: number): number {
  return Math.max(GORGE0 + 4, FALLS_S0 - years * 0.09)
}

/** Bed elevation of the river at s (before channel depth is subtracted). */
export function profileH(s: number, years = 0): number {
  const u = uOf(s)
  let h = 38 * Math.pow(1 - u, 2.15)
  // The waterfall: a hard cap holds a step that the plunge pool undercuts.
  const wf = fallsAt(years)
  h += FALLS_DROP / (1 + Math.exp((s - wf) / 0.55))
  return h
}

/**
 * Hydraulic geometry: width ∝ catchment^0.5, depth ∝ catchment^0.35 — so the
 * channel grows a little slower than the flow does, and velocity creeps UP
 * downstream. The delta flares the mouth so the water finally slows.
 */
export function channelW(s: number): number {
  const cat = catchmentAt(s)
  const flare = 1 + THREE.MathUtils.smoothstep(s, DELTA0 - 12, DELTA0) * 1.4
  return (0.75 + 3.1 * Math.pow(cat, 0.5)) * flare
}
export function channelD(s: number): number {
  const cat = catchmentAt(s)
  return 0.2 + 0.66 * Math.pow(cat, 0.35)
}
/** Half-width of the flat valley floor (floodplain) either side of the channel. */
export function floodplainW(s: number): number {
  const u = uOf(s)
  const gorge = THREE.MathUtils.smoothstep(s, GORGE0 - 4, GORGE0) * (1 - THREE.MathUtils.smoothstep(s, GORGE1, GORGE1 + 8))
  const upland = 1 - THREE.MathUtils.smoothstep(s, 6, HEAD1)
  const wide = 0.9 + Math.pow(u, 1.5) * 9
  return Math.max(channelW(s) * 0.5 + 1.2, wide * (1 - gorge * 0.85) * (1 - upland * 0.55))
}

/**
 * Meander offset of the channel centreline at s. Amplitude grows downstream;
 * `years` (the time-lapse lens) migrates the bends and grows them, and past
 * ~year 24 the ox-bow bend is cut off (its offset collapses to the shortcut).
 */
export function meanderX(s: number, years = 0): number {
  const u = uOf(s)
  const grow = 1 + Math.min(years, 60) * 0.006
  const migrate = Math.min(years, 60) * 0.028 * Math.pow(u, 2)
  const amp = (0.4 + Math.pow(u, 1.7) * 7.2) * grow
  let x = amp * Math.sin(s * 0.26 + migrate + 1.25 * Math.sin(s * 0.079 + 0.7))
  // The ox-bow bend: exaggerate it, then cut it off.
  const bend = Math.exp(-Math.pow((s - OXBOW_S) / 5.5, 2))
  const pinch = oxbowT(years)
  x += bend * (2.6 * Math.min(years, 24) * 0.1) * (1 - pinch) * Math.sin((s - OXBOW_S) * 0.5 + 1.2)
  x *= 1 - bend * pinch * 0.75
  // The delta: the channel straightens as it builds its own fan.
  x *= 1 - THREE.MathUtils.smoothstep(s, DELTA0 - 10, DELTA0 + 6) * 0.55
  return x
}

/** 0..1 — how far the ox-bow cut-off has happened at `years`. */
export function oxbowT(years: number): number {
  return THREE.MathUtils.smoothstep(years, 24, 30)
}

/** Where the abandoned ox-bow lake sits once cut off. */
export function oxbowCentre(years: number): { x: number; z: number; r: number } {
  void years
  return { x: meanderX(OXBOW_S, 20) + 2.4, z: worldZ(OXBOW_S), r: 2.6 }
}

/* ------------------------------------------------------------------ */
/* The delta — distributaries building new land                        */
/* ------------------------------------------------------------------ */

export const DISTRIBUTARIES = [-1, 0, 1] as const
/** Sideways spread of distributary k at delta-progress t (0 at the split). */
export function distribX(k: number, t: number): number {
  return meanderX(DELTA0, 0) + k * (2.5 + t * 16) + Math.sin(t * 3.4 + k * 1.7) * (0.6 + t * 1.4)
}
export function distribZ(t: number): number {
  return worldZ(DELTA0 + t * (COURSE - DELTA0))
}
/** Distributary channel half-width — they thin as they split and spread. */
export function distribW(k: number, t: number): number {
  void k
  return channelW(DELTA0) * 0.34 * (1 - t * 0.35)
}

/** Height of the delta plain (near sea level, built from silt). */
export function deltaPlainH(x: number, z: number): number {
  const t = THREE.MathUtils.clamp((z - worldZ(DELTA0)) / (worldZ(COURSE) - worldZ(DELTA0)), 0, 1)
  // A fan: land only within the spreading wedge, tapering to the sea.
  const halfW = 5 + t * 26
  const lat = Math.abs(x - meanderX(DELTA0, 0))
  const inFan = 1 - THREE.MathUtils.smoothstep(lat, halfW * 0.72, halfW)
  const lobe = 0.5 + 0.5 * Math.cos(lat * 0.55)
  return SEA_Y + (0.22 + lobe * 0.16) * inFan * (1 - t * 0.55)
}

/** Sea level, in the same units as profileH. */
export const SEA_Y = 0.12

/* ------------------------------------------------------------------ */
/* Terrain — the carved basin                                          */
/* ------------------------------------------------------------------ */

/**
 * Terrain height at world (x, z): the main valley, every tributary valley,
 * the upland moor above the gorge, and the delta plain at the mouth.
 */
export function valleyBaseH(x: number, z: number, years = 0): number {
  const s = THREE.MathUtils.clamp(z + 74, -10, COURSE + 18)
  const cx = meanderX(s, years)
  const d = Math.abs(x - cx)
  const floor = profileH(s, years)
  const fp = floodplainW(s)
  const u = uOf(s)
  // Valley wall: a shoulder of bounded relief — near-vertical and close in
  // the gorge, a long gentle rise across the lower basin, high open moor above.
  const gorge = THREE.MathUtils.smoothstep(s, GORGE0 - 12, GORGE0 + 9) * (1 - THREE.MathUtils.smoothstep(s, GORGE1 - 10, GORGE1 + 14))
  const upland = 1 - THREE.MathUtils.smoothstep(s, 8, HEAD1)
  const relief = THREE.MathUtils.lerp(THREE.MathUtils.lerp(30 - u * 6, 34, upland), 22, gorge)
  const wallW = THREE.MathUtils.lerp(THREE.MathUtils.lerp(26 + u * 14, 30, upland), 15, gorge)
  const beyond = Math.max(0, d - fp)
  let h = floor + relief * THREE.MathUtils.smoothstep(beyond, 0, wallW)
  // The gorge proper: a narrow slot cut into the plateau.
  const slotW = channelW(s) * 0.5 + 3.2
  h -= gorge * 7 * (1 - THREE.MathUtils.smoothstep(d, slotW, slotW + 5.5))
  // The channel itself, carved into the floor.
  const cw = channelW(s) * 0.5 + 0.45
  if (d < cw) {
    const t = d / cw
    h -= channelD(s) * 1.12 * (0.5 + 0.5 * Math.cos(Math.PI * t))
  }
  // Rolling interfluves + hills toward the horizon.
  const wx = x + fbm(x * 0.05, z * 0.05, 3) * 5
  const wz = z + fbm(x * 0.05 + 41, z * 0.05 - 17, 3) * 5
  h += (fbm(wx * 0.05, wz * 0.05, 4) * 3.4 + 3.4) * THREE.MathUtils.smoothstep(beyond, wallW * 0.4, wallW * 1.6)
  // Crags in the upland and the gorge rim — the roughness you orbit to see.
  const dense = (1 - THREE.MathUtils.smoothstep(Math.abs(x - cx), 16, 26)) * (1 - THREE.MathUtils.smoothstep(Math.abs(z), 74, 88))
  const crag = Math.max(upland * 0.8, gorge) * dense
  h += Math.abs(fbm(wx * 0.085, wz * 0.085, 3)) * 6.5 * crag * THREE.MathUtils.smoothstep(beyond, 1.5, 12)
  // The basin RIM: high ground wraps the whole catchment and opens only at
  // the sea. This is the watershed — the line rain has to choose sides on.
  const seaOpen = 1 - THREE.MathUtils.smoothstep(z, worldZ(DELTA0) - 14, worldZ(DELTA0) + 10)
  const rimHead = THREE.MathUtils.smoothstep(-z, 62, 112) * 26
  h += rimHead * seaOpen
  // Beyond the rim, rolling country falls away again.
  const far = THREE.MathUtils.smoothstep(Math.hypot(x, z + 10), 96, 150)
  h = THREE.MathUtils.lerp(h, h * 0.55 + 14 + fbm(x * 0.012, z * 0.012, 3) * 9, far * seaOpen)

  return h
}

/** The full surface: base valley + every tributary valley + the delta plain. */
export function valleyH(x: number, z: number, years = 0): number {
  let h = valleyBaseH(x, z, years)
  // Tributary valleys, cut into whatever the main valley left.
  const tc = tribCarve(x, z, years)
  if (tc.mask > 0.001) {
    h = Math.min(h, THREE.MathUtils.lerp(h, tc.floor, tc.mask))
  }

  // The delta plain replaces the valley beyond the split.
  const dt = THREE.MathUtils.smoothstep(z, worldZ(DELTA0) - 6, worldZ(DELTA0) + 10)
  if (dt > 0.001) {
    let dh = deltaPlainH(x, z)
    // distributary channels carved into the fan
    for (const k of DISTRIBUTARIES) {
      for (let i = 0; i <= 6; i++) {
        const t = i / 6
        const px = distribX(k, t)
        const pz = distribZ(t)
        const dd = Math.hypot(x - px, z - pz)
        const w = distribW(k, t) + 1.2
        if (dd < w) dh -= 0.5 * (1 - dd / w)
      }
    }
    h = THREE.MathUtils.lerp(h, dh, dt)
  }
  // Beyond the delta, the sea floor.
  h = THREE.MathUtils.lerp(h, SEA_Y - 1.6, THREE.MathUtils.smoothstep(z, worldZ(COURSE) - 2, worldZ(COURSE) + 22))
  return h
}

/* ------------------------------------------------------------------ */
/* Checkpoints — the journey's gates, on the minimap and the ride      */
/* ------------------------------------------------------------------ */

export interface RiverCheckpoint {
  id: string
  s: number
  name: string
  blurb: string
  /** The one idea this place teaches. */
  teach: string
}

export const CHECKPOINTS: RiverCheckpoint[] = [
  { id: 'source', s: 4, name: 'The Source', blurb: 'A spring line on the open moor.', teach: 'Every drop of rain that falls on this basin has to leave through one river — and this is where it starts.' },
  { id: 'head', s: 20, name: 'The Headwaters', blurb: 'Steep, stony, and already gathering streams.', teach: 'Two small burns have joined already. A river is a NETWORK long before it is a river.' },
  { id: 'falls', s: FALLS_S0, name: 'The Falls', blurb: 'A hard cap of rock over soft shale.', teach: 'The river cannot cut the hard band as fast — so it steps, undercuts, and the falls retreat upstream.' },
  { id: 'st1', s: 56, name: 'Station 1 · Gorge', blurb: 'White water over boulders.', teach: 'It LOOKS fastest here — time the float before you believe it.' },
  { id: 'conf', s: 82, name: 'Ash Water Confluence', blurb: 'The biggest tributary arrives.', teach: 'Watch the discharge jump as it joins. The river below a confluence is the sum of everything above it.' },
  { id: 'st2', s: 88, name: 'Station 2 · Meanders', blurb: 'The channel widens and swings.', teach: 'Fastest water hugs the outside of each bend — that is why bends migrate.' },
  { id: 'oxbow', s: OXBOW_S, name: 'The Big Bend', blurb: 'A meander on its way to becoming an ox-bow lake.', teach: 'Erode the outside, deposit on the inside, and one day the neck cuts through.' },
  { id: 'st3', s: GAUGE_S, name: 'Station 3 · Gauge', blurb: 'The river wears its own dial here.', teach: 'Discharge past this post is THE number: everything upstream, summed.' },
  { id: 'village', s: 130, name: 'The Village', blurb: 'People on the floodplain.', teach: 'The most dangerous land in the valley is also the most fertile — that is why they stay.' },
  { id: 'delta', s: 144, name: 'The Delta', blurb: 'The channel splits into distributaries.', teach: 'Slowed by the sea, the river drops its load and builds new land — then has to split to get around it.' },
  { id: 'mouth', s: 153, name: 'The Mouth', blurb: 'Fresh water meets the sea.', teach: 'The journey ends, but the sediment keeps going — that plume is your gorge, rearranged.' },
]
export const CHECKPOINT_BY_ID: Record<string, RiverCheckpoint> = Object.fromEntries(CHECKPOINTS.map((c) => [c.id, c]))

if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__riverTerrain = (x: number, z: number) => valleyH(x, z, 0)
}

export function bedH(s: number, years = 0): number {
  return profileH(s, years) - channelD(s)
}

/* ------------------------------------------------------------------ */
/* Basins — the gravity-dial pattern: one dial retunes the whole world */
/* ------------------------------------------------------------------ */

export type BasinId = 'temperate' | 'savanna' | 'monsoon' | 'wadi'

export interface BasinPreset extends WorldPreset {
  label: string
  blurb: string
  /** Daylight input for WorldState.step (0 dusk .. 1 full day). */
  light: number
  /** Baseflow scale (m³/s at the mouth, roughly). */
  baseflow: number
  /** Runoff multiplier — how flashy the basin responds to a storm. */
  flashiness: number
  /** Storm rain falls on the headwaters only (the wadi lesson). */
  stormUpstream: boolean
  /** Suspended-sediment tint of the water. */
  water: string
  waterFlood: string
  /** Baseline turbidity 0..1 (drives the underwater fog). */
  turbidity: number
  /** Vegetation style for the instanced trees. */
  trees: 'broadleaf' | 'baobab' | 'palm' | 'scrub'
  treeDensity: number
}

export const BASINS: BasinId[] = ['temperate', 'savanna', 'monsoon', 'wadi']

export const BASIN_PRESETS: Record<BasinId, BasinPreset> = {
  temperate: {
    label: 'Temperate valley',
    blurb: 'The familiar green — steady rain, steady river.',
    sky: ['#3B7FC4', '#63A5DB', '#9CCBEA', '#C8E3F2', '#E3EEF0', '#C6D6C4'],
    skyDusk: ['#16233F', '#2B3F66', '#5A5F86', '#9A6F7E', '#C48A6C', '#8B6E5A'],
    sun: '#FFF4D6', sunDusk: '#FFB070', hemiSky: '#CFEAF5', hemiGround: '#5F8F4E',
    fogNear: 70, fogFar: 420,
    grass: '#6FAE5A', rock: '#8B8A78', sand: '#B7A97D',
    bladeBase: '#4E8B3F', bladeTip: '#B4DE7A', bladeDensity: 0.85, bladeHeight: 1,
    moisture: 0.62, rain: 0, snow: 0, haze: 0.25, stars: 0.7,
    light: 0.85, baseflow: 1.0, flashiness: 1.0, stormUpstream: false,
    water: '#4A829C', waterFlood: '#7A6242', turbidity: 0.25, trees: 'broadleaf', treeDensity: 0.9,
  },
  savanna: {
    label: 'Volta savanna',
    blurb: 'Harmattan haze, baobabs, and one violent storm cell.',
    sky: ['#5C93C9', '#8DB8DA', '#C7D5D0', '#E7D9B3', '#EDD9A4', '#C9B47C'],
    skyDusk: ['#2A2140', '#5B3557', '#A0506A', '#D9805C', '#F0A45B', '#A97D4C'],
    sun: '#FFF0C0', sunDusk: '#FF9A4A', hemiSky: '#E9D9A8', hemiGround: '#8C7A3E',
    fogNear: 60, fogFar: 380,
    grass: '#B9A54E', rock: '#9A7F55', sand: '#D3BE86',
    bladeBase: '#8A7A32', bladeTip: '#E4CB6C', bladeDensity: 0.7, bladeHeight: 1.25,
    moisture: 0.3, rain: 0, snow: 0, haze: 0.55, stars: 0.9,
    light: 0.88, baseflow: 0.55, flashiness: 1.7, stormUpstream: false,
    water: '#6E5F3C', waterFlood: '#8A6A38', turbidity: 0.55, trees: 'baobab', treeDensity: 0.4,
  },
  monsoon: {
    label: 'Monsoon delta',
    blurb: 'Emerald paddies, humid light, a river that owns the land.',
    sky: ['#4E8FB0', '#79B6CC', '#A9D3D6', '#CBE3D6', '#D9E7CD', '#B7C9A9'],
    skyDusk: ['#182B3B', '#28465C', '#3F6474', '#5B7D7C', '#6E877A', '#55665A'],
    sun: '#FFF1CF', sunDusk: '#F0B87A', hemiSky: '#BFE3D6', hemiGround: '#3E6B3A',
    fogNear: 46, fogFar: 320,
    grass: '#3F8A44', rock: '#5B6B4E', sand: '#7C8B5A',
    bladeBase: '#2E6B33', bladeTip: '#8FD06B', bladeDensity: 0.95, bladeHeight: 1.15,
    moisture: 0.92, rain: 0.25, snow: 0, haze: 0.6, stars: 0.3,
    light: 0.75, baseflow: 1.7, flashiness: 1.25, stormUpstream: false,
    water: '#5E8A68', waterFlood: '#7C6B3E', turbidity: 0.7, trees: 'palm', treeDensity: 0.75,
  },
  wadi: {
    label: 'Desert wadi',
    blurb: 'Bone dry — until a storm you cannot see sends the river anyway.',
    sky: ['#4B86C4', '#84B4DE', '#C6D9E6', '#EEDFC0', '#F3DCB2', '#D9BC8B'],
    skyDusk: ['#22183A', '#4A2C5A', '#8F4A6B', '#D07A5A', '#F2A55C', '#B08653'],
    sun: '#FFF6DC', sunDusk: '#FF9455', hemiSky: '#F0DCBA', hemiGround: '#A88657',
    fogNear: 80, fogFar: 460,
    grass: '#C9AD74', rock: '#A98963', sand: '#E2C899',
    bladeBase: '#A08A4E', bladeTip: '#D8C27E', bladeDensity: 0.1, bladeHeight: 0.7,
    moisture: 0.05, rain: 0, snow: 0, haze: 0.85, stars: 1,
    light: 0.95, baseflow: 0.045, flashiness: 2.6, stormUpstream: true,
    water: '#8A6E48', waterFlood: '#96703C', turbidity: 0.9, trees: 'scrub', treeDensity: 0.18,
  },
}

/* ------------------------------------------------------------------ */
/* Land use and defences                                               */
/* ------------------------------------------------------------------ */

export type LandUseId = 'forest' | 'farm' | 'town'
export const LAND_USES: Array<{ id: LandUseId; label: string; blurb: string; runoff: number; lag: number }> = [
  { id: 'forest', label: 'Forest', blurb: 'Interception and roots — rain takes the slow path.', runoff: 0.22, lag: 11 },
  { id: 'farm', label: 'Farmland', blurb: 'Open fields — some soaks in, some runs off.', runoff: 0.45, lag: 6.5 },
  { id: 'town', label: 'Town', blurb: 'Roofs, roads and drains — rain arrives almost at once.', runoff: 0.78, lag: 3.2 },
]
export const LAND_USE_BY_ID = Object.fromEntries(LAND_USES.map((l) => [l.id, l])) as Record<LandUseId, (typeof LAND_USES)[number]>

export type DefenceId = 'levee' | 'dam' | 'basin' | 'trees' | 'channel'
export interface DefenceDef {
  id: DefenceId
  label: string
  cost: number
  blurb: string
  /** The honest trade-off, shown when placed. */
  tradeoff: string
}
export const DEFENCES: DefenceDef[] = [
  { id: 'levee', label: 'Levées', cost: 40, blurb: 'Earth embankments raise the banks at the village.', tradeoff: 'Higher banks hold more water back — so when they do fail, the flood is deeper and faster.' },
  { id: 'dam', label: 'Dam + reservoir', cost: 120, blurb: 'Holds the flood wave upstream and releases it slowly.', tradeoff: 'Expensive; drowns the upper valley; traps the silt that used to feed the floodplain.' },
  { id: 'basin', label: 'Storage basin', cost: 60, blurb: 'A dug pond that swallows the first surge.', tradeoff: 'Only helps until it is full — one basin buys minutes, not safety.' },
  { id: 'trees', label: 'Afforestation', cost: 20, blurb: 'Plant the headwaters — interception slows the rain down.', tradeoff: 'Cheap but slow: young trees take years to matter, and this model plants grown ones.' },
  { id: 'channel', label: 'Channelisation', cost: 50, blurb: 'Straighten and smooth the channel so water leaves faster.', tradeoff: 'Faster past YOUR village — the flood arrives downstream sooner and higher. Someone lives there too.' },
]
export const DEFENCE_BY_ID = Object.fromEntries(DEFENCES.map((d) => [d.id, d])) as Record<DefenceId, DefenceDef>
export const FLOOD_BUDGET = 150

/* ------------------------------------------------------------------ */
/* The sim                                                             */
/* ------------------------------------------------------------------ */

export type RiverViewId = 'overview' | 'head' | 'gorge' | 'overlook' | 'village' | 'mouth' | 'follow'
export type LensId = 'none' | 'under' | 'lapse'

export interface HydroSample {
  t: number
  q: number
  rain: number
}

export interface StormLog {
  id: number
  basin: BasinId
  landUse: LandUseId
  wet: boolean
  night: boolean
  peakQ: number
  /** Minutes (model) from peak rain to peak discharge. */
  lagS: number
  flooded: boolean
  rainAtVillage: number
  defences: DefenceId[]
  damage: number
  downstreamPeak: number
}

export interface PebbleState {
  s: number
  /** 1 = the angular block it started as, shrinks with distance. */
  size: number
  /** 0 angular .. 1 well rounded (Powers-ish). */
  roundness: number
  travelled: number
  resting: boolean
  restingFor: number
  mode: 'rest' | 'traction' | 'saltation' | 'suspension'
}

export interface RiverSim {
  started: boolean
  demoMode: boolean
  paused: boolean
  time: number
  lastWall: number

  basin: BasinId
  landUse: LandUseId
  wet: boolean
  night: boolean
  visionOn: boolean
  lens: LensId
  /** Time-lapse years elapsed (the lens advances this). */
  years: number
  /** 0..1 living-map morph. */
  mapT: number
  mapOn: boolean

  /* storm + hydrograph */
  stormT: number
  stormActive: boolean
  stormFast: number
  stormSlow: number
  /** Storm outflow at the gauge scale (m³/s) — stores drained through the lag. */
  qStorm: number
  q: number
  qVillage: number
  stage: number
  rainNow: number
  lightning: number
  lightningAt: number
  hydro: HydroSample[]
  hydroAccum: number
  peakQ: number
  peakQAt: number
  peakRainAt: number
  flooded: boolean
  siltFresh: number
  damage: number
  stormSeq: number
  storms: StormLog[]

  /* defences */
  defences: Set<DefenceId>
  basinStore: number
  damStore: number

  /* field kit */
  station: 'st1' | 'st2' | 'st3'
  floatActive: boolean
  floatS: number
  floatT: number
  floatDone: number
  floatSnapshot: { station: string; t: number; v: number } | null
  meterUnlocked: boolean
  tapeT: number
  soundT: number
  /* stopwatch (same discipline as the Motion Yard: taps on the wall clock) */
  swRunning: boolean
  swStartAt: number
  swElapsed: number
  swStops: number
  swLast: { start: number; stop: number } | null

  /* pebble */
  pebble: PebbleState
  pebbleRing: number | null

  /* predictions */
  fastestFlag: 'st1' | 'st2' | 'st3' | null
  floodLine: number | null

  /* free navigation */
  /** Queued pan in camera-relative metres (x = right, z = forward). */
  panX: number
  panZ: number
  /** Index of the checkpoint the camera is parked at, or -1. */
  atCp: number
  cpSeq: number

  /* camera */
  viewId: RiverViewId
  viewSeq: number
  viewReset: number
  viewZoom: number
  autoOrbit: boolean
  /** World position the follow view tracks (Ploob in the demo, else the float/pebble). */
  follow: { x: number; y: number; z: number; active: boolean }

  /* demo (Ploob the raindrop rides the river) */
  ploobS: number
  ploobActive: boolean

  /* the ride — source to sea in Ploob's wake */
  rideActive: boolean
  /** Index of the last checkpoint passed this ride (-1 before the first). */
  rideCp: number
  rideCpAt: number
  ridesDone: number
  rideEndedAt: number
}

export function createRiverSim(): RiverSim {
  const sim: RiverSim = {
    started: false, demoMode: false, paused: false, time: 0, lastWall: 0,
    basin: 'temperate', landUse: 'farm', wet: false, night: false,
    visionOn: true, lens: 'none', years: 0, mapT: 0, mapOn: false,
    stormT: 0, stormActive: false, stormFast: 0, stormSlow: 0, qStorm: 0,
    q: 0, qVillage: 0, stage: 0.35, rainNow: 0, lightning: 0, lightningAt: -99,
    hydro: [], hydroAccum: 0, peakQ: 0, peakQAt: 0, peakRainAt: 0,
    flooded: false, siltFresh: 0, damage: 0, stormSeq: 0, storms: [],
    defences: new Set(), basinStore: 0, damStore: 0,
    station: 'st2', floatActive: false, floatS: 0, floatT: 0, floatDone: 0, floatSnapshot: null,
    meterUnlocked: false, tapeT: -1, soundT: -1,
    swRunning: false, swStartAt: 0, swElapsed: 0, swStops: 0, swLast: null,
    pebble: { s: 50, size: 1, roundness: 0.06, travelled: 0, resting: true, restingFor: 0, mode: 'rest' },
    pebbleRing: null,
    fastestFlag: null, floodLine: null,
    panX: 0, panZ: 0, atCp: -1, cpSeq: 0,
    viewId: 'overview', viewSeq: 0, viewReset: 0, viewZoom: 0, autoOrbit: false,
    follow: { x: 0, y: 0, z: 0, active: false },
    ploobS: 0, ploobActive: false,
    rideActive: false, rideCp: -1, rideCpAt: -999, ridesDone: 0, rideEndedAt: -999,
  }
  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__riverSim = sim
    // Model handle for the verify suite — reads the SAME functions the
    // instruments read, so the checks and the visuals cannot disagree.
    ;(window as unknown as Record<string, unknown>).__riverModel = {
      velocityAt: (s: number) => velocityAt(sim, s),
      stageAt: (s: number) => stageAt(sim, s),
      totalQ: (s: number) => totalQ(sim, s),
      bankfullQ: (s: number) => bankfullQ(s, sim.basin),
      areaAt: (s: number) => areaAt(sim, s),
      channelW,
      profileH,
      fallsAt,
      oxbowT,
      catchmentNow: () => catchmentNow(sim),
      turbidityNow: () => turbidityNow(sim),
      catchmentAt,
      tributaries: TRIBUTARIES,
      distribX,
      distribZ,
      valleyH: (x: number, z: number) => valleyH(x, z, sim.years),
      checkpointData: (cp: RiverCheckpoint) => checkpointData(sim, cp),
      checkpointById: (id: string) => CHECKPOINT_BY_ID[id],
    }
  }
  return sim
}

/* ------------------------------------------------------------------ */
/* Hydrology — the single source of truth                              */
/* ------------------------------------------------------------------ */

/** Baseflow discharge (m³/s) at s for a basin. */
export function baseQ(s: number, basin: BasinId): number {
  // Discharge IS the catchment it drains — so it steps at every confluence.
  return BASIN_PRESETS[basin].baseflow * catchmentAt(s) * 2.2
}

/** Bankfull discharge at s — stage 1.0 means the channel is exactly full. */
export function bankfullQ(s: number, basin: BasinId): number {
  void basin
  return catchmentAt(s) * 2.2 * 2.25 + 0.05
}

/** Total discharge at s right now (baseflow + the storm wave). */
export function totalQ(sim: RiverSim, s: number): number {
  // The storm wave arrives in proportion to the catchment above you, too.
  return baseQ(s, sim.basin) + sim.qStorm * catchmentAt(s)
}

/** Stage 0..~2 at s: fraction of bankfull. */
export function stageAt(sim: RiverSim, s: number): number {
  return totalQ(sim, s) / bankfullQ(s, sim.basin)
}

/** Wetted cross-section area (m²) at s for the current stage. */
export function areaAt(sim: RiverSim, s: number): number {
  const st = Math.min(1.35, Math.max(0.12, stageAt(sim, s)))
  return channelW(s) * channelD(s) * (0.18 + 0.82 * Math.min(1, st))
}

/**
 * Mean velocity (m/s) at s — v = Q / A. Increases downstream at baseflow
 * (the misconception payoff: the mountain torrent LOOKS faster, but the
 * smooth deep lower course wins on the stopwatch).
 */
export function velocityAt(sim: RiverSim, s: number): number {
  return totalQ(sim, s) / Math.max(0.05, areaAt(sim, s))
}

/** Water surface height at s. Above bankfull it climbs onto the floodplain. */
export function waterY(sim: RiverSim, s: number): number {
  const st = stageAt(sim, s)
  const d = channelD(s)
  if (st <= 1) return bedH(s, sim.years) + d * (0.22 + 0.78 * Math.pow(st, 0.75))
  return profileH(s, sim.years) + Math.min(0.9, (st - 1) * 0.55)
}

/** How wide the water is at s (spills over the floodplain past bankfull). */
export function waterW(sim: RiverSim, s: number): number {
  const st = stageAt(sim, s)
  const w = channelW(s)
  if (st <= 1) return w * (0.45 + 0.55 * Math.min(1, st / 0.9))
  const over = THREE.MathUtils.smoothstep(st, 1, 1.7)
  return THREE.MathUtils.lerp(w, floodplainW(s) * 2, over)
}

/** Turbidity 0..1 right now (baseline + storm load + fresh silt). */
export function turbidityNow(sim: RiverSim): number {
  const p = BASIN_PRESETS[sim.basin]
  return THREE.MathUtils.clamp(p.turbidity + (sim.qStorm / 5) * 0.6 + sim.siltFresh * 0.15, 0, 1)
}

/** Runoff coefficient + lag for the current settings (defences included). */
export function catchmentNow(sim: RiverSim): { runoff: number; lag: number } {
  const lu = LAND_USE_BY_ID[sim.landUse]
  let runoff = lu.runoff * BASIN_PRESETS[sim.basin].flashiness
  let lag = lu.lag / Math.sqrt(BASIN_PRESETS[sim.basin].flashiness)
  if (sim.wet) {
    runoff *= 1.45
    lag *= 0.75
  }
  if (sim.defences.has('trees')) {
    runoff *= 0.72
    lag *= 1.3
  }
  if (sim.defences.has('channel')) lag *= 0.72
  return { runoff: Math.min(2.6, runoff), lag: Math.max(1.6, lag) }
}

/** Storm rain profile 0..1 over ~26 s of model time. */
export const STORM_LEN = 22
function stormRain(t: number): number {
  if (t < 0 || t > STORM_LEN) return 0
  const x = (t - STORM_LEN * 0.42) / (STORM_LEN * 0.2)
  return Math.exp(-x * x)
}

export function startStorm(sim: RiverSim): void {
  if (sim.stormActive) return
  sim.stormActive = true
  sim.stormT = 0
  sim.peakQ = totalQ(sim, GAUGE_S)
  sim.peakQAt = sim.time
  sim.peakRainAt = 0
  sim.flooded = false
  sim.damage = 0
  sim.basinStore = 0
}

/** Levée height (m of extra stage) at the village when built. */
export const LEVEE_H = 0.45

function endStorm(sim: RiverSim): void {
  sim.stormActive = false
  sim.stormSeq += 1
  const p = BASIN_PRESETS[sim.basin]
  const downstreamPeak = sim.peakQ * (sim.defences.has('channel') ? 1.22 : 1) * (sim.defences.has('dam') ? 0.7 : 1)
  sim.storms.push({
    id: sim.stormSeq,
    basin: sim.basin,
    landUse: sim.landUse,
    wet: sim.wet,
    night: sim.night,
    peakQ: sim.peakQ,
    lagS: Math.max(0, sim.peakQAt - sim.peakRainAt),
    flooded: sim.flooded,
    rainAtVillage: p.stormUpstream ? 0 : 1,
    defences: [...sim.defences],
    damage: sim.damage,
    downstreamPeak,
  })
  if (sim.flooded) sim.siltFresh = 1
}

/* ------------------------------------------------------------------ */
/* Pebble transport — Hjulström, honestly simplified                   */
/* ------------------------------------------------------------------ */

/** Critical (erosion/entrainment) velocity for the pebble's current size. */
export function entrainV(size: number): number {
  return 0.42 + size * 0.55
}
/** Settling velocity — below this the pebble stops. */
export function settleV(size: number): number {
  return 0.28 + size * 0.38
}

export function resetPebble(sim: RiverSim): void {
  sim.pebble = { s: 50, size: 1, roundness: 0.06, travelled: 0, resting: true, restingFor: 0, mode: 'rest' }
}

function tickPebble(sim: RiverSim, dt: number): void {
  const p = sim.pebble
  const v = velocityAt(sim, p.s)
  const ev = entrainV(p.size)
  if (v > ev * 1.6) p.mode = 'suspension'
  else if (v > ev * 1.15) p.mode = 'saltation'
  else if (v > ev) p.mode = 'traction'
  else if (v < settleV(p.size)) {
    p.mode = 'rest'
    p.resting = true
    p.restingFor += dt
    return
  } else {
    // between settle and entrain: keeps moving only if already moving
    if (p.resting) return
    p.mode = 'traction'
  }
  p.resting = false
  p.restingFor = 0
  const speedK = p.mode === 'suspension' ? 0.95 : p.mode === 'saltation' ? 0.5 : 0.2
  const ds = v * speedK * dt
  p.s = Math.min(COURSE - 1.5, p.s + ds)
  p.travelled += ds
  p.size = Math.max(0.22, 1 - p.travelled * 0.0075)
  p.roundness = Math.min(0.96, 0.06 + p.travelled * 0.009)
}

/* ------------------------------------------------------------------ */
/* The step — advances everything analytic                             */
/* ------------------------------------------------------------------ */

export function simNow(sim: RiverSim): number {
  return sim.time
}

export function tapStopwatch(sim: RiverSim): void {
  const now = sim.time
  if (!sim.swRunning) {
    sim.swRunning = true
    sim.swStartAt = now
    sim.swElapsed = 0
  } else {
    sim.swRunning = false
    sim.swElapsed = now - sim.swStartAt
    sim.swStops += 1
    sim.swLast = { start: sim.swStartAt, stop: now }
  }
}
export function resetStopwatch(sim: RiverSim): void {
  sim.swRunning = false
  sim.swElapsed = 0
}

/** Start the ride: Ploob drops in at the source and runs the whole course. */
export function startRide(sim: RiverSim): void {
  if (sim.rideActive) return
  sim.rideActive = true
  sim.ploobActive = true
  sim.ploobS = 2
  sim.rideCp = -1
  sim.rideCpAt = -999
  sim.viewId = 'follow'
  sim.viewSeq += 1
}

export function endRide(sim: RiverSim, completed: boolean): void {
  if (!sim.rideActive) return
  sim.rideActive = false
  sim.ploobActive = false
  sim.rideEndedAt = sim.time
  if (completed) sim.ridesDone += 1
  sim.viewId = completed ? 'mouth' : 'overview'
  sim.viewSeq += 1
}

/** Fly to a checkpoint (wraps at both ends), framing it from the bank. */
export function gotoCheckpoint(sim: RiverSim, index: number): void {
  const n = CHECKPOINTS.length
  sim.atCp = ((index % n) + n) % n
  sim.cpSeq += 1
  sim.viewId = 'follow'
}

/** Step to the next/previous checkpoint along the course. */
export function stepCheckpoint(sim: RiverSim, dir: 1 | -1): void {
  gotoCheckpoint(sim, sim.atCp < 0 ? (dir > 0 ? 0 : CHECKPOINTS.length - 1) : sim.atCp + dir)
}

/** Queue a pan (camera-relative) — the arrow pad and the arrow keys both use this. */
export function panCamera(sim: RiverSim, dx: number, dz: number): void {
  sim.panX += dx
  sim.panZ += dz
}

/** Release the orange float at the current station's upstream pole. */
export function releaseFloat(sim: RiverSim): void {
  if (sim.floatActive) return
  const st = STATION_BY_ID[sim.station]
  sim.floatActive = true
  sim.floatS = st.s - FLOAT_RUN / 2
  sim.floatT = 0
}

export function stepRiver(sim: RiverSim, dt: number): void {
  if (sim.paused) return
  sim.time += dt

  /* map morph */
  sim.mapT += ((sim.mapOn ? 1 : 0) - sim.mapT) * (1 - Math.exp(-dt * 2.4))

  /* time-lapse lens */
  if (sim.lens === 'lapse') sim.years = Math.min(60, sim.years + dt * 1.0)

  /* storm + reservoirs */
  const { runoff, lag } = catchmentNow(sim)
  let rain = 0
  if (sim.stormActive) {
    sim.stormT += dt
    rain = stormRain(sim.stormT) * 18 * runoff
    if (stormRain(sim.stormT) > 0.96 && sim.peakRainAt === 0) sim.peakRainAt = sim.time
    if (sim.stormT > STORM_LEN + lag * 3.2) endStorm(sim)
  }
  sim.rainNow = sim.stormActive ? stormRain(sim.stormT) : 0
  // Storage basin swallows the first surge — until it is full.
  if (sim.defences.has('basin') && rain > 0 && sim.basinStore < 1) {
    const take = Math.min(rain * 0.7, (1 - sim.basinStore) * 6)
    sim.basinStore = Math.min(1, sim.basinStore + (take * dt) / 22)
    rain -= take
  }
  let inflow = rain
  // Dam: caps the wave, stores the excess, lets it out slowly.
  if (sim.defences.has('dam')) {
    const cap = 3.5
    if (inflow > cap) {
      sim.damStore += (inflow - cap) * dt
      inflow = cap
    }
    if (sim.damStore > 0) {
      const release = Math.min(sim.damStore / 12, 0.9)
      inflow += release
      sim.damStore = Math.max(0, sim.damStore - release * dt)
    }
  }
  // Two linear reservoirs; their OUTFLOW is the storm discharge. A short lag
  // (town) passes the peak through high and early; a long lag (forest) queues it.
  sim.stormFast += (inflow - sim.stormFast / lag) * dt
  sim.stormFast = Math.max(0, sim.stormFast)
  sim.stormSlow += (rain * 0.1 - sim.stormSlow / (lag * 6)) * dt
  sim.stormSlow = Math.max(0, sim.stormSlow)
  sim.qStorm = sim.stormFast / lag + sim.stormSlow / (lag * 6)

  sim.q = totalQ(sim, GAUGE_S)
  sim.qVillage = sim.q
  sim.stage = stageAt(sim, GAUGE_S)
  if (sim.q > sim.peakQ) {
    sim.peakQ = sim.q
    sim.peakQAt = sim.time
  }
  const leveeBoost = sim.defences.has('levee') ? LEVEE_H / channelD(GAUGE_S) : 0
  if (sim.stage > 1) sim.flooded = true
  if (sim.stage > 1 + leveeBoost) {
    sim.damage = Math.min(1, sim.damage + dt * 0.055 * (sim.stage - 1 - leveeBoost) * 1.6)
  }
  sim.siltFresh = Math.max(0, sim.siltFresh - dt * 0.01)

  /* lightning during the storm's core */
  if (sim.stormActive && sim.rainNow > 0.55 && sim.time - sim.lightningAt > 2.2 + (sim.time % 3)) {
    sim.lightning = 1
    sim.lightningAt = sim.time
  }
  sim.lightning = Math.max(0, sim.lightning - dt * 3.2)

  /* hydrograph series */
  sim.hydroAccum += dt
  if (sim.hydroAccum >= 0.4) {
    sim.hydroAccum = 0
    sim.hydro.push({ t: sim.time, q: sim.q, rain: sim.rainNow })
    if (sim.hydro.length > 420) sim.hydro.shift()
  }

  /* float run */
  if (sim.floatActive) {
    const v = velocityAt(sim, sim.floatS)
    sim.floatS += v * dt
    sim.floatT += dt
    const st = STATION_BY_ID[sim.station]
    if (sim.floatS >= st.s + FLOAT_RUN / 2) {
      // trueT: integrate exactly (v changes little over 6 m — quote midpoint)
      const vMid = velocityAt(sim, st.s)
      sim.floatSnapshot = { station: sim.station, t: FLOAT_RUN / Math.max(0.05, vMid), v: vMid }
      sim.floatActive = false
      sim.floatDone += 1
    }
  }

  /* kit animations */
  if (sim.tapeT >= 0) sim.tapeT = sim.tapeT > 1.6 ? -1 : sim.tapeT + dt
  if (sim.soundT >= 0) sim.soundT = sim.soundT > 2.6 ? -1 : sim.soundT + dt

  /* pebble */
  tickPebble(sim, dt)

  /* Ploob rides the river (guided demo + the ride) */
  if (sim.ploobActive) {
    const v = velocityAt(sim, sim.ploobS)
    sim.ploobS = Math.min(COURSE - 2, sim.ploobS + Math.max(1.8, v * 2.4) * dt)
    if (sim.rideActive) {
      for (let i = CHECKPOINTS.length - 1; i >= 0; i--) {
        if (sim.ploobS >= CHECKPOINTS[i].s) {
          if (i !== sim.rideCp) {
            sim.rideCp = i
            sim.rideCpAt = sim.time
          }
          break
        }
      }
      if (sim.ploobS >= COURSE - 4) endRide(sim, true)
    }
  }
}

/**
 * Live data card for a checkpoint — read from the same model functions the
 * instruments use, so the minimap and the fieldwork can never disagree.
 */
export function checkpointData(sim: RiverSim, cp: RiverCheckpoint): Array<[string, string]> {
  const s = cp.id === 'falls' ? fallsAt(sim.years) : cp.s
  const drop = profileH(s - 5, sim.years) - profileH(s + 5, sim.years)
  const gradDeg = (Math.atan2(drop, 10) * 180) / Math.PI
  const rows: Array<[string, string]> = [
    ['Distance', `${s.toFixed(0)} m from the source`],
    ['Elevation', `${profileH(s, sim.years).toFixed(1)} m`],
    ['Gradient', `${gradDeg.toFixed(1)}°`],
    ['Catchment', `${(catchmentAt(s) * 100).toFixed(0)}% of the basin`],
    ['Width', `${channelW(s).toFixed(1)} m`],
    ['Depth (bankfull)', `${channelD(s).toFixed(2)} m`],
    ['Velocity now', `${velocityAt(sim, s).toFixed(2)} m/s`],
    ['Discharge now', `${totalQ(sim, s).toFixed(2)} m³/s`],
  ]
  if (cp.id === 'conf') {
    const tb = TRIB_BY_ID.tb4
    rows.push(['Q above the join', `${totalQ(sim, tb.join - 4).toFixed(2)} m³/s`])
    rows.push(['Q below the join', `${totalQ(sim, tb.join + 4).toFixed(2)} m³/s`])
  }
  const last = lastConfluence(s)
  if (last && cp.id !== 'source') rows.push(['Last tributary', `${last.name} (at ${last.join} m)`])
  if (cp.id === 'st3' || cp.id === 'village') rows.push(['Stage', `${(stageAt(sim, s) * 100).toFixed(0)}% of bankfull`])
  return rows
}

/* ------------------------------------------------------------------ */
/* Readings                                                            */
/* ------------------------------------------------------------------ */

export type RiverReadingKind = 'width' | 'section' | 'velocity' | 'discharge' | 'gradient' | 'pebble' | 'hydro'

export interface RiverReading {
  id: number
  kind: RiverReadingKind
  station: 'st1' | 'st2' | 'st3' | '—'
  /** Headline value (m, m², m/s, m³/s, °, roundness 0–1, peak m³/s). */
  value: number
  unit: string
  method: 'hand' | 'sensor' | 'tape' | 'rule' | 'clino'
  trueValue: number
  basin: BasinId
  /** Depth profile for section readings (m at 5 offsets). */
  profile?: number[]
  /** Float-timing raw seconds for velocity readings. */
  seconds?: number
  predicted?: number | string | null
  /** Storm metadata for hydro readings. */
  storm?: StormLog
}

/* ------------------------------------------------------------------ */
/* Missions                                                            */
/* ------------------------------------------------------------------ */

export interface RiverContext {
  readings: RiverReading[]
  sim: RiverSim
  storms: StormLog[]
  oxbowSeen: boolean
  fastestCommitted: boolean
}

export interface RiverMission {
  id: string
  title: string
  brief: string
  reward: string
  minBand: Band
  skill: 'measuring' | 'predicting' | 'controlling' | 'interpreting' | 'explaining'
  check: (ctx: RiverContext) => boolean
}

const BAND_RANK: Record<Band, number> = { explorer: 0, scientist: 1, analyst: 2 }

export const RIVER_MISSIONS: RiverMission[] = [
  {
    id: 'follow-pebble',
    title: 'Follow your pebble',
    brief: 'Wait for high water (or make some rain), watch your tagged pebble travel, and measure it at two different points on its journey.',
    reward: 'Your pebble is being machined. Every bounce chips a corner off — abrasion and attrition — which is why mountain scree is jagged and beach shingle is round. A pebble is a diary of its journey.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (ctx) => {
      const ps = ctx.readings.filter((r) => r.kind === 'pebble')
      if (ps.length < 2) return false
      const sMin = Math.min(...ps.map((r) => r.trueValue))
      const sMax = Math.max(...ps.map((r) => r.trueValue))
      return sMax - sMin > 12
    },
  },
  {
    id: 'first-flood',
    title: 'Make it rain',
    brief: 'Run a storm and watch the gauge. Push the river over its banks, then let it fall again.',
    reward: 'See the brown left behind? A flood is the river delivering free topsoil — silt. That is why the most dangerous land in the valley is also the most fertile, and why people have always lived there anyway.',
    minBand: 'explorer',
    skill: 'measuring',
    check: (ctx) => ctx.storms.some((s) => s.flooded),
  },
  {
    id: 'fastest-water',
    title: 'Where is the river fastest?',
    brief: 'Plant your flag on the station you think is fastest. Then time the float at all three stations and let the numbers vote.',
    reward: 'Almost everyone picks the white-water gorge — and the stopwatch says the calm lower course wins. The torrent wastes its energy fighting boulders; the deep smooth channel barely touches its bed. Never trust "looks fast".',
    minBand: 'scientist',
    skill: 'predicting',
    check: (ctx) => {
      if (!ctx.fastestCommitted) return false
      const vs = ctx.readings.filter((r) => r.kind === 'velocity')
      return ['st1', 'st2', 'st3'].every((st) => vs.some((r) => r.station === st))
    },
  },
  {
    id: 'discharge',
    title: 'Measure the river',
    brief: 'At one station: tape the width, sound the bed for the cross-section, time the float — then let the data lab compute discharge = A × v.',
    reward: 'Discharge — the volume passing you per second — is THE number hydrologists live by. You just produced it the way a field team does: width, depth profile, velocity, multiply. Nobody handed it to you.',
    minBand: 'scientist',
    skill: 'measuring',
    check: (ctx) => ctx.readings.some((r) => r.kind === 'discharge'),
  },
  {
    id: 'lag-time',
    title: 'Two storms, two basins',
    brief: 'Run the same storm over forest, then over town. Compare the two hydrographs: lag time and peak.',
    reward: 'Same rain, different land: the town flashes — short lag, high peak — because roofs and drains give rain a motorway to the river. Forest makes it queue. Urbanisation does not make more rain; it makes rain arrive together.',
    minBand: 'scientist',
    skill: 'controlling',
    check: (ctx) => {
      const forest = ctx.storms.filter((s) => s.landUse === 'forest' && !s.defences.length)
      const town = ctx.storms.filter((s) => s.landUse === 'town' && !s.defences.length)
      return forest.length > 0 && town.length > 0 && Math.max(...town.map((s) => s.peakQ)) > Math.max(...forest.map((s) => s.peakQ)) * 1.25
    },
  },
  {
    id: 'wadi-flood',
    title: 'Flood with no rain',
    brief: 'Turn the basin dial to the desert wadi and run a storm. Watch the sky over the village — and watch the gauge.',
    reward: 'Not a drop fell on the village, and the river still came. The storm fell on the headwaters — floods come from the whole BASIN, not from the sky above you. This is how desert flash floods kill: the danger is upstream, out of sight.',
    minBand: 'scientist',
    skill: 'interpreting',
    check: (ctx) => ctx.storms.some((s) => s.rainAtVillage === 0 && s.flooded),
  },
  {
    id: 'oxbow',
    title: 'Cut the corner',
    brief: 'Earn the time-lapse lens and hold it on the big bend. Watch the meander grow, pinch, and cut itself off.',
    reward: 'The river just abandoned its own channel. The outside of a bend erodes (fastest water), the inside deposits — so every bend migrates and tightens until the neck breaks through. The stranded loop is an ox-bow lake, and the river is now shorter than it was.',
    minBand: 'scientist',
    skill: 'interpreting',
    check: (ctx) => ctx.oxbowSeen,
  },
  {
    id: 'defend-village',
    title: 'Defend the village',
    brief: 'Budget: 150. Choose defences, then survive a wet-ground storm over farmland with zero damage — and read what your choice did downstream.',
    reward: 'You kept the village dry — with someone else’s river. Every hard defence moves water or risk somewhere else, which is why real schemes are arguments, not answers. Cost, protection, downstream harm: you now hold all three at once.',
    minBand: 'analyst',
    skill: 'explaining',
    check: (ctx) =>
      ctx.storms.some(
        (s) =>
          s.defences.length > 0 &&
          s.defences.reduce((c, d) => c + DEFENCE_BY_ID[d].cost, 0) <= FLOOD_BUDGET &&
          s.wet &&
          s.landUse !== 'forest' &&
          s.damage === 0 &&
          s.peakQ > bankfullQ(GAUGE_S, s.basin),
      ),
  },
]

export function riverMissionsForBand(band: Band): RiverMission[] {
  return RIVER_MISSIONS.filter((m) => BAND_RANK[m.minBand] <= BAND_RANK[band])
}

/* ------------------------------------------------------------------ */
/* Guided demo — Ploob the raindrop rides the river                    */
/* ------------------------------------------------------------------ */

export interface RiverDemoApi {
  setBasin: (b: BasinId) => void
  setLandUse: (l: LandUseId) => void
  view: (v: RiverViewId) => void
  setMap: (on: boolean) => void
  storm: () => void
  releaseFloat: () => void
  station: (id: 'st1' | 'st2' | 'st3') => void
  ploob: (on: boolean) => void
  ploobAt: () => number
  vision: (on: boolean) => void
  now: () => number
}

export interface RiverDemoStep {
  ms: number
  text: string
  enter?: (api: RiverDemoApi) => void
  tick?: (api: RiverDemoApi, elapsedMs: number, state: Record<string, unknown>) => boolean | void
}

export const RIVER_DEMO: RiverDemoStep[] = [
  {
    ms: 7000,
    text: 'Hi — Ploob here. I’m a raindrop, and this valley is my home. I just fell on the hills at the top. Everything you can see drains to ONE river — watch me find it.',
    enter: (api) => {
      api.setBasin('temperate')
      api.view('gorge')
      api.ploob(true)
    },
  },
  {
    ms: 9000,
    text: 'Whoa — the gorge! The land is steep here, so I’m cutting DOWN into the rock. See the hard band? I can’t cut it as fast — that ledge is the waterfall.',
    tick: (api) => (api.ploobAt() > 34 ? true : undefined),
  },
  {
    ms: 8000,
    text: 'The valley is opening out. I’ve stopped cutting down and started swinging side to side — these bends are called meanders, and they never stop moving.',
    enter: (api) => api.view('follow'),
    tick: (api) => (api.ploobAt() > 58 ? true : undefined),
  },
  {
    ms: 9000,
    text: 'Quick stop at Station 2 — this is how you’ll measure me. The orange float rides the current between the two poles; time it, and you’ve measured my speed.',
    enter: (api) => {
      api.station('st2')
      api.view('overlook')
      api.releaseFloat()
    },
  },
  {
    ms: 8000,
    text: 'From up here you can see my whole world. Tap the map button sometime — the valley flattens into a paper map and back. Contour lines are just hills, drawn flat.',
    enter: (api) => api.setMap(true),
  },
  {
    ms: 9500,
    text: 'And this is the village, on my floodplain. The gauge post reads how full I am — my hydrograph. When a big storm feeds me faster than I can carry it away…',
    enter: (api) => {
      api.setMap(false)
      api.view('village')
      api.setLandUse('farm')
      api.storm()
    },
  },
  {
    ms: 9000,
    text: '…I flood. I’m not angry — I’m just full. Everything the sky drops on this basin has to leave through me. Your job is to measure me, predict me, and maybe defend them.',
  },
  {
    ms: 7500,
    text: 'I’ll leave you the field kit, my tagged pebble, and the storm button. Measure everything. And remember: never trust "looks fast" — time it. Bye!',
    enter: (api) => {
      api.view('overview')
      api.ploob(false)
    },
  },
]
