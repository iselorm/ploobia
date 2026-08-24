/**
 * The specimen rig: every curve, mount point and piece of geometry the plant
 * stage draws, derived once per specimen.
 *
 * Streams, labels, the tracer, the sink meters and the camera viewpoints all
 * read the same rig, so nothing can drift out of register with anything else —
 * the sugar parcels really do travel down the same curve the phloem tube is
 * drawn along.
 *
 * Scene units: the podium surface is y = 0 and one unit is roughly 10 cm of
 * real plant, which is what the scale bar in the corner is quoting.
 */

import * as THREE from 'three'
import type { Specimen } from '@/lib/specimens'

/** How much real plant one scene unit represents. Drives the scale bar. */
export const METRES_PER_UNIT = 0.1

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

/**
 * A tube whose radius tapers along a curve, optionally with a longitudinal
 * slot cut out of it. The slot is how the stem becomes a cutaway: leave a
 * wedge of the circumference undrawn and the vascular bundles inside are
 * visible from the front, while the back of the stem stays whole.
 */
export function taperedTube(
  curve: THREE.Curve<THREE.Vector3>,
  segs: number,
  radial: number,
  r0: number,
  r1: number,
  thetaStart = 0,
  thetaLength = Math.PI * 2,
): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const P = new THREE.Vector3()

  // A **world-aligned** ring rather than a Frenet frame. Frenet frames twist
  // unpredictably along a gently curving line, and the first version of this
  // put the stem's cutaway slot on whichever side the frame happened to pick —
  // sometimes facing the camera, sometimes facing away, and never in register
  // with the vascular strands that are supposed to sit inside it. With a fixed
  // basis, angle v always means the world direction (sin v, 0, cos v), so
  // v = 0 is reliably "toward the camera" and everything lines up. Plant stems
  // are near enough vertical for the small error this leaves to be invisible.
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    curve.getPointAt(t, P)
    const r = r0 + (r1 - r0) * t
    for (let j = 0; j <= radial; j++) {
      const v = thetaStart + (j / radial) * thetaLength
      const nx = Math.sin(v)
      const nz = Math.cos(v)
      normals.push(nx, 0, nz)
      positions.push(P.x + r * nx, P.y, P.z + r * nz)
      uvs.push(j / radial, t * 3)
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = a + radial + 1
      index.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/**
 * One leaflet: an ovate blade, cupped slightly along its width and arched
 * along its length so it catches light like a real leaf rather than reading as
 * a cut-out. UVs are in leaf space so the venation texture lines up with the
 * midrib whatever the proportions.
 */
export function leafletGeometry(length: number, width: number, cup = 0.12): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.bezierCurveTo(width * 0.64, length * 0.16, width * 0.58, length * 0.66, 0, length)
  shape.bezierCurveTo(-width * 0.58, length * 0.66, -width * 0.64, length * 0.16, 0, 0)
  const geo = new THREE.ShapeGeometry(shape, 24)
  const pos = geo.attributes.position
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    pos.setZ(i, Math.abs(x) * cup + Math.sin((y / length) * Math.PI) * 0.05)
    uv.setXY(i, 0.5 + x / (width * 1.25), y / length)
  }
  uv.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/**
 * A grass blade: long, strap-shaped, arching over as it runs out. Maize's leaf
 * is not a small leaf — it is a metre-long ribbon, and drawing it as an oval
 * would hide why maize intercepts so much more light than a bean.
 */
export function bladeGeometry(length: number, width: number, arch = 0.55): THREE.BufferGeometry {
  const SEG = 26
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    // The blade widens quickly then tapers to a point.
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.06)), 0.7) * (1 - 0.25 * t)
    const y = t * length
    const droop = -arch * t * t * length * 0.42
    const fold = Math.sin(t * Math.PI) * 0.06
    positions.push(-w, y + droop, fold, w, y + droop, fold)
    uvs.push(0, t, 1, t)
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

/**
 * A pinnate frond — leaflets in pairs along a rachis, sweeping forward and
 * drooping as they run out toward the tip.
 *
 * The generator is adapted from ThreeUI's Sylva fern (MIT, Meng To); the shape
 * of a potato or tomato leaf is the same construction with fewer, fatter
 * pairs, so the same code draws both.
 */
export function pinnateGeometry(pairs: number, length: number, spread: number): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const SEG = 4
  const rachis = (s: number, out: THREE.Vector3) => {
    out.set(0, s * length * (1.04 - 0.4 * s * s), 0.3 * s * s * length * 0.3)
    return out
  }
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()

  for (let i = 1; i <= pairs; i++) {
    const s = i / (pairs + 0.55)
    rachis(s, a)
    const leafletLen = spread * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.6)), 0.7) * (1 - 0.16 * s)
    for (let side = -1; side <= 1; side += 2) {
      const base = positions.length / 3
      for (let k = 0; k <= SEG; k++) {
        const f = k / SEG
        const w = 0.34 * leafletLen * Math.pow(Math.sin(Math.PI * Math.min(f * 1.2, 1)), 0.62) * (1 - 0.3 * f)
        rachis(s + f * leafletLen * 0.28, b)
        const x = side * f * leafletLen
        const y = b.y - 0.2 * leafletLen * f * f
        const z = b.z + 0.05 * leafletLen * f
        positions.push(x, y - w, z, x, y + w, z)
        uvs.push(f, 0, f, 1)
      }
      for (let k = 0; k < SEG; k++) {
        const q = base + k * 2
        index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2)
      }
    }
  }

  // The rachis itself, so the frond is not a set of floating leaflets.
  const stipeBase = positions.length / 3
  const STIPE = 10
  for (let j = 0; j <= STIPE; j++) {
    const s = j / STIPE
    rachis(s, a)
    const r = 0.016 * length * (1 - 0.55 * s)
    positions.push(-r, a.y, a.z, r, a.y, a.z)
    uvs.push(0.48, s, 0.52, s)
  }
  for (let j = 0; j < STIPE; j++) {
    const q = stipeBase + j * 2
    index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

/** A flattened ellipsoid — the cactus pad. Baked into the geometry, never a `scale` prop. */
export function padGeometry(width: number, height: number, thickness: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 24, 18)
  geo.scale(width, height, thickness)
  geo.computeVertexNormals()
  return geo
}

/* ------------------------------------------------------------------ */
/* The rig                                                            */
/* ------------------------------------------------------------------ */

export interface LeafNode {
  /** Parameter along the stem curve where this leaf is attached, 0–1. */
  t: number
  /** Where the petiole leaves the stem. */
  base: THREE.Vector3
  /** Azimuth around the stem. */
  azimuth: number
  /** Tilt of the whole leaf away from vertical. */
  droop: number
  scale: number
  /** Where the lamina's own centre ends up — the source point for sugar. */
  source: THREE.Vector3
}

export interface RootBranch {
  curve: THREE.CatmullRomCurve3
  r0: number
  r1: number
}

export interface SugarRig {
  specimenId: string
  /** The stem centreline, from the soil surface to the growing tip. */
  stem: THREE.CatmullRomCurve3
  stemGeometry: THREE.BufferGeometry
  /** The pale pith inside the cutaway. */
  pithGeometry: THREE.BufferGeometry
  /** Where the cutaway slot starts, and how wide it is, in radians. */
  slot: { start: number; length: number }
  /** Xylem strand centrelines — three, running the height of the stem. */
  xylem: THREE.CatmullRomCurve3[]
  /** Phloem strand centrelines, sitting outside the xylem as they really do. */
  phloem: THREE.CatmullRomCurve3[]
  leaves: LeafNode[]
  leafGeometry: THREE.BufferGeometry
  petioleGeometry: THREE.BufferGeometry
  roots: RootBranch[]
  rootGeometry: THREE.BufferGeometry[]
  /** Sink anchor points in scene space, keyed by sink id. */
  sinkAt: Record<string, THREE.Vector3>
  /** Total height of the specimen above the podium. */
  height: number
  /** Where the girdle ring sits on the stem, as a fraction of its length. */
  girdleT: number
  dispose: () => void
}

/** The stem's centreline: a gentle S so the specimen never reads as a diagram. */
function stemCurve(height: number): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.06, 0),
    new THREE.Vector3(0.055 * height * 0.4, height * 0.3, 0.02 * height * 0.4),
    new THREE.Vector3(-0.04 * height * 0.4, height * 0.62, -0.015 * height * 0.4),
    new THREE.Vector3(0.02, height, 0),
  ])
}

/**
 * A strand running parallel to the stem at a fixed offset from its centre,
 * using the same world-aligned convention as `taperedTube`: `angle` is the
 * world direction (sin a, 0, cos a), so a = 0 points at the camera and lands
 * inside the cutaway slot.
 */
function strandAlong(
  stem: THREE.CatmullRomCurve3,
  radius: number,
  angle: number,
  from: number,
  to: number,
  samples = 22,
): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = []
  const P = new THREE.Vector3()
  const dx = Math.sin(angle) * radius
  const dz = Math.cos(angle) * radius
  for (let i = 0; i <= samples; i++) {
    const t = from + (to - from) * (i / samples)
    stem.getPointAt(t, P)
    points.push(new THREE.Vector3(P.x + dx, P.y, P.z + dz))
  }
  return new THREE.CatmullRomCurve3(points)
}

export function buildRig(specimen: Specimen): SugarRig {
  const b = specimen.build
  const height = b.stemHeight
  const stem = stemCurve(height)
  const owned: Array<{ dispose: () => void }> = []

  /* ---- the stem, with a wedge left out of the front ---- */
  // The slot faces +Z, which is where the default camera sits: a cutaway is
  // only a cutaway if you are looking into it.
  const slot = { start: 0.43, length: Math.PI * 2 - 0.86 }
  const stemGeometry = taperedTube(stem, 44, 16, b.stemR0, b.stemR1, slot.start, slot.length)
  // The pith has to stop well short of the vascular ring, or it simply hides
  // the two pipes the whole cutaway exists to show. (It did, in the first cut.)
  const pithGeometry = taperedTube(stem, 44, 14, b.stemR0 * 0.3, b.stemR1 * 0.3)
  owned.push(stemGeometry, pithGeometry)

  /* ---- vascular strands inside the slot ---- */
  // ONE bundle, opened out side by side rather than the true radial stack.
  //
  // In a real stem the phloem sits directly outside the xylem, so from the
  // front one hides the other; drawing three bundles that way filled the whole
  // window with gold and the stem stopped reading as a stem at all. At this
  // scale (a 5 mm stem across ten screen pixels) the honest choice is a
  // schematic: water on the left, sugar on the right, both plainly inside the
  // stem — and the real radial arrangement is drawn properly in the stem
  // stage, where there is room for it to mean something.
  const xylem: THREE.CatmullRomCurve3[] = [strandAlong(stem, b.stemR0 * 0.52, -0.22, 0.02, 0.99)]
  const phloem: THREE.CatmullRomCurve3[] = [strandAlong(stem, b.stemR0 * 0.52, 0.22, 0.02, 0.99)]

  /* ---- leaves up the stem in a phyllotactic spiral ---- */
  const leaves: LeafNode[] = []
  const P = new THREE.Vector3()
  for (let i = 0; i < b.leafNodes; i++) {
    const t = 0.3 + (i / Math.max(1, b.leafNodes - 1)) * 0.62
    stem.getPointAt(t, P)
    // 137.5° — the golden angle, which is what real phyllotaxis uses.
    const azimuth = (i * 137.5 * Math.PI) / 180 + 0.5
    const scale = (1.05 - i * 0.07) * b.leafScale
    const droop = b.arrangement === 'blade' ? 0.5 + i * 0.04 : 0.62 + i * 0.05
    const reach = (b.arrangement === 'blade' ? 0.28 : 0.42) * scale
    leaves.push({
      t,
      base: P.clone(),
      azimuth,
      droop,
      scale,
      source: new THREE.Vector3(
        P.x + Math.cos(azimuth) * reach,
        P.y + 0.12 * scale,
        P.z + Math.sin(azimuth) * reach,
      ),
    })
  }

  let leafGeometry: THREE.BufferGeometry
  if (b.arrangement === 'blade') leafGeometry = bladeGeometry(2.05, 0.2, 0.62)
  else if (b.arrangement === 'pinnate') leafGeometry = pinnateGeometry(4, 1.15, 0.34)
  else if (b.arrangement === 'pad') leafGeometry = padGeometry(0.5, 0.62, 0.12)
  else leafGeometry = leafletGeometry(0.94, 0.66)
  owned.push(leafGeometry)

  const petioleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.14, 0.04, 0),
    new THREE.Vector3(0.3, 0.02, 0),
  ])
  const petioleGeometry = taperedTube(petioleCurve, 8, 7, 0.022, 0.013)
  owned.push(petioleGeometry)

  /* ---- roots ---- */
  const roots: RootBranch[] = []
  const rootCount = 7
  for (let i = 0; i < rootCount; i++) {
    // Fanned toward the camera rather than spread evenly around the axis: a
    // root ball whose every branch hides behind the plant teaches nothing.
    const a = -1.15 + (i / (rootCount - 1)) * 2.3
    const spread = b.rootSpread * (0.5 + ((i * 37) % 10) / 20)
    const depth = b.rootDepth * (0.58 + ((i * 53) % 10) / 17)
    // A wander term, so the root ball is not a wire teepee. Roots grope.
    const wob = ((i * 61) % 13) / 13 - 0.5
    const dir = (t: number, k: number) =>
      new THREE.Vector3(
        Math.sin(a + wob * k * 0.9) * spread * t,
        -depth * (t * 0.98 + 0.02),
        Math.cos(a + wob * k * 0.9) * spread * t * 0.94,
      )
    roots.push({
      curve: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.02, 0),
        dir(0.3, 0.4),
        dir(0.62, 1),
        dir(0.85, 0.5),
        dir(1, 1.4),
      ]),
      r0: b.stemR0 * 0.5,
      r1: b.stemR0 * 0.05,
    })
    // One lateral off every other root — the fine stuff that does the drinking.
    if (i % 2 === 0) {
      const from = dir(0.55, 1)
      roots.push({
        curve: new THREE.CatmullRomCurve3([
          from,
          from.clone().add(new THREE.Vector3(Math.sin(a + 0.7) * spread * 0.2, -depth * 0.14, Math.cos(a + 0.7) * spread * 0.2)),
          from.clone().add(new THREE.Vector3(Math.sin(a + 1.1) * spread * 0.34, -depth * 0.3, Math.cos(a + 1.1) * spread * 0.3)),
        ]),
        r0: b.stemR0 * 0.16,
        r1: b.stemR0 * 0.03,
      })
    }
  }
  const rootGeometry = roots.map((r) => taperedTube(r.curve, 20, 8, r.r0, r.r1))
  rootGeometry.forEach((g) => owned.push(g))

  /* ---- sink anchors ---- */
  const sinkAt: Record<string, THREE.Vector3> = {}
  specimen.sinks.forEach((s) => {
    sinkAt[s.id] = new THREE.Vector3(...s.anchor)
  })
  // The growing tip is always the actual end of the stem, whatever the preset
  // says — an anchor that floats off the plant is the sort of thing nobody
  // notices until a screenshot shows a label hanging in mid-air.
  const tip = specimen.sinks.find((s) => s.id === 'tip')
  if (tip) {
    stem.getPointAt(1, P)
    sinkAt[tip.id] = new THREE.Vector3(P.x, P.y + 0.04, P.z)
  }

  return {
    specimenId: specimen.id,
    stem,
    stemGeometry,
    pithGeometry,
    slot,
    xylem,
    phloem,
    leaves,
    leafGeometry,
    petioleGeometry,
    roots,
    rootGeometry,
    sinkAt,
    height,
    girdleT: 0.26,
    dispose: () => owned.forEach((o) => o.dispose()),
  }
}
