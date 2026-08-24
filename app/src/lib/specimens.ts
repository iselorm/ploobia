/**
 * The specimen library.
 *
 * Five crops, chosen because each one solves the same problem — make sugar,
 * move it somewhere useful — with visibly different hardware, and because a
 * learner has eaten all five. The differences are not decoration: leaf area,
 * photosynthetic pathway, stem length, sieve-tube bore and above all *where
 * the sugar is going* are the parameters the model actually runs on.
 *
 * A potato is a plant that answered "where do I put the surplus?" with a
 * tuber. A maize plant answered it with a cob. A prickly pear answered a
 * different question entirely — "how do I do any of this without water?" —
 * and pays for that answer with a rate a tenth of everyone else's.
 *
 * Physiology numbers are realistic orders of magnitude from crop-physiology
 * literature, rounded to teachable values.
 */

import type { LeafPreset } from './leaves'

/* ------------------------------------------------------------------ */
/* Sinks                                                              */
/* ------------------------------------------------------------------ */

export type SinkKind = 'store' | 'fruit' | 'growth'

export interface SinkPreset {
  id: string
  /** What a learner calls it. */
  label: string
  /** The botanical term, shown alongside. */
  term: string
  kind: SinkKind
  /** How hard it pulls, relative to the plant's other sinks. */
  demand: number
  /** How much sugar it can hold, mg. */
  capacity: number
  /** What it starts with, mg. */
  startStore: number
  /** Fraction of arriving sugar burnt building tissue rather than banked. */
  growthCost: number
  /** Sugar burnt just staying alive, mg h⁻¹ at 20 °C. */
  maintenance: number
  /**
   * 1 when filling it up makes it stop pulling (a storage organ), 0 when it
   * consumes everything that arrives and never fills (a growing tip).
   */
  saturates: 0 | 1
  /** Sucrose concentration at the unloading end when the sink is empty, g L⁻¹. */
  sinkCMin: number
  /** Where it sits on the plant, in the scene's local units. */
  anchor: [number, number, number]
  /** One line: what this organ is FOR. */
  note: string
}

/* ------------------------------------------------------------------ */
/* Specimens                                                          */
/* ------------------------------------------------------------------ */

export type LeafArrangement = 'trifoliate' | 'blade' | 'pinnate' | 'lobed' | 'pad'

export interface Specimen {
  id: string
  /** Common name, as the atlas heading. */
  name: string
  /** Binomial, set in italics under the name. */
  binomial: string
  /** Family, for the key-facts block. */
  family: string
  /** One paragraph of why this plant is interesting here. */
  blurb: string
  /** The single most surprising true thing about it. */
  headline: string

  /** Everything the leaf-level solve needs. */
  leaf: LeafPreset

  /* ---- whole-plant architecture ---- */
  /** Total leaf area of the whole plant, m². */
  leafAreaM2: number
  /** Distance sugar has to travel from the leaves to the main sink, m. */
  pathLengthM: number
  /** Combined sieve-tube lumen cross-section, m². */
  phloemAreaM2: number

  /* ---- phloem loading ---- */
  /** Ceiling on how fast companion cells can pump sucrose in, mg h⁻¹. */
  loadingMax: number
  /** Free leaf sugar at which loading runs at half its ceiling, mg. */
  loadingKm: number
  /** Sieve-tube sucrose concentration when the leaf is empty, g L⁻¹. */
  sourceCMin: number
  /** …and when it is fully loaded, g L⁻¹. */
  sourceCMax: number

  /* ---- the leaf's own overnight bank ---- */
  starchMax: number
  /** Fraction of any surplus that goes to starch rather than staying free. */
  starchShare: number
  leafSugarStart: number
  leafStarchStart: number

  sinks: SinkPreset[]

  /* ---- how the 3D plant is built ---- */
  build: {
    /** Height of the main stem, scene units. */
    stemHeight: number
    /** Stem radius at the base and at the tip. */
    stemR0: number
    stemR1: number
    arrangement: LeafArrangement
    /** How many leaf stations run up the stem. */
    leafNodes: number
    /** Scale multiplier on each leaf. */
    leafScale: number
    /** Root system spread and depth. */
    rootSpread: number
    rootDepth: number
    colors: {
      stem: string
      leaf: string
      leafBack: string
      vein: string
      fruit: string
      fruitRipe: string
      root: string
    }
  }

  /** Short atlas facts, shown as label/value rows. */
  keyFacts: Array<[string, string]>
  /** Longer facts for the ticker and the fact card. */
  facts: string[]
}

/* ------------------------------------------------------------------ */

function sink(p: SinkPreset): SinkPreset {
  return p
}

export const SPECIMENS: Specimen[] = [
  {
    id: 'bean',
    name: 'Common bean',
    binomial: 'Phaseolus vulgaris',
    family: 'Fabaceae',
    blurb:
      'The textbook plant, and a fair one: ordinary C3 photosynthesis, ordinary leaves, and pods that go from nothing to the plant’s biggest customer in about three weeks.',
    headline:
      'A bean plant will happily starve its own roots to fill its pods. Once seeds are setting, they outbid every other organ for sugar.',
    leaf: {
      id: 'bean',
      name: 'Bean leaflet',
      plant: 'Common bean',
      pathway: 'C3',
      form: 'broad',
      nativeBiome: 'temperate',
      leafArea: 1,
      stomatalDensity: 0.62,
      cuticle: 0.3,
      pmax: 17,
      kLight: 330,
      kCo2: 250,
      tOpt: 26,
      tMax: 45,
      tMin: 4,
      rd25: 1.3,
      rootDepth: 0.55,
      waterStore: 0.25,
      adaptations: [],
      waterStory: '',
      colors: { leaf: '#54A45B', leafDry: '#A08C3E', accent: '#3E7C43' },
    },
    leafAreaM2: 0.028,
    pathLengthM: 0.42,
    phloemAreaM2: 7e-8,
    loadingMax: 26,
    loadingKm: 34,
    sourceCMin: 85,
    sourceCMax: 245,
    starchMax: 95,
    starchShare: 0.55,
    leafSugarStart: 26,
    leafStarchStart: 14,
    sinks: [
      sink({
        id: 'pods',
        label: 'Pods',
        term: 'developing fruit',
        kind: 'fruit',
        demand: 1,
        capacity: 900,
        startStore: 90,
        growthCost: 0.3,
        maintenance: 0.7,
        saturates: 1,
        sinkCMin: 55,
        anchor: [0.3, 1.3, 0.16],
        note: 'Seeds under construction. Every one is a packed lunch for a plant that does not exist yet.',
      }),
      sink({
        id: 'roots',
        label: 'Roots',
        term: 'storage root',
        kind: 'store',
        demand: 0.45,
        capacity: 620,
        startStore: 210,
        growthCost: 0.18,
        maintenance: 1.4,
        saturates: 1,
        sinkCMin: 45,
        anchor: [0.02, -0.42, 0.22],
        note: 'The roots cannot photosynthesise at all. Everything they run on arrived down the phloem.',
      }),
      sink({
        id: 'tip',
        label: 'Growing tip',
        term: 'apical meristem',
        kind: 'growth',
        demand: 0.3,
        capacity: 60,
        startStore: 10,
        growthCost: 0.82,
        maintenance: 0.3,
        saturates: 0,
        sinkCMin: 38,
        anchor: [0.03, 2.42, 0],
        note: 'New cells, made continuously. It banks almost nothing — sugar arrives and becomes plant.',
      }),
    ],
    build: {
      stemHeight: 2.4,
      stemR0: 0.105,
      stemR1: 0.046,
      arrangement: 'trifoliate',
      leafNodes: 5,
      leafScale: 1,
      rootSpread: 0.72,
      rootDepth: 0.85,
      colors: {
        stem: '#5C8A4A',
        leaf: '#54A45B',
        leafBack: '#7FBB74',
        vein: '#3B7A42',
        fruit: '#7FB25B',
        fruitRipe: '#C9B24A',
        root: '#C7A277',
      },
    },
    keyFacts: [
      ['Pathway', 'C3'],
      ['Leaf area', '280 cm²'],
      ['Transport path', '0.42 m'],
      ['Main sink', 'Pods'],
      ['Optimum', '26 °C'],
    ],
    facts: [
      'Bean pods are sinks so strong that a heavily podded plant will pull sugar out of its own roots to fill them.',
      'The leaves are trifoliate — three leaflets to a stalk — which lets the plant fold them edge-on to a punishing afternoon sun.',
      'Beans host nitrogen-fixing bacteria in root nodules, and pay them in sugar. Some of the glucose you are watching is rent.',
    ],
  },

  {
    id: 'maize',
    name: 'Maize',
    binomial: 'Zea mays',
    family: 'Poaceae',
    blurb:
      'A C4 plant: it pumps CO₂ into a sealed inner compartment before fixing it, so RuBisCO never gets the chance to grab oxygen by mistake. That one extra step is why maize thrives in heat that makes wheat and rice struggle.',
    headline:
      'C4 photosynthesis costs extra energy per molecule of CO₂ — and still wins, because it abolishes photorespiration.',
    leaf: {
      id: 'maize',
      name: 'Maize blade',
      plant: 'Maize',
      pathway: 'C4',
      form: 'blade',
      nativeBiome: 'savanna',
      leafArea: 1.15,
      stomatalDensity: 0.55,
      cuticle: 0.45,
      pmax: 32,
      kLight: 620,
      kCo2: 45,
      tOpt: 33,
      tMax: 50,
      tMin: 8,
      rd25: 1.5,
      rootDepth: 0.75,
      waterStore: 0.2,
      adaptations: [],
      waterStory: '',
      colors: { leaf: '#67A93F', leafDry: '#B79A3C', accent: '#4C7F2E' },
    },
    leafAreaM2: 0.046,
    pathLengthM: 0.86,
    phloemAreaM2: 1.35e-7,
    loadingMax: 62,
    loadingKm: 46,
    sourceCMin: 110,
    sourceCMax: 280,
    starchMax: 130,
    starchShare: 0.5,
    leafSugarStart: 34,
    leafStarchStart: 20,
    sinks: [
      sink({
        id: 'cob',
        label: 'Cob',
        term: 'developing grain',
        kind: 'fruit',
        demand: 1.25,
        capacity: 2600,
        startStore: 180,
        growthCost: 0.24,
        maintenance: 1.1,
        saturates: 1,
        sinkCMin: 50,
        anchor: [0.3, 1.55, 0.14],
        note: 'Every kernel is a starch warehouse being built to order. This is the sink the whole plant exists to fill.',
      }),
      sink({
        id: 'roots',
        label: 'Roots',
        term: 'fibrous root system',
        kind: 'store',
        demand: 0.4,
        capacity: 700,
        startStore: 240,
        growthCost: 0.2,
        maintenance: 1.9,
        saturates: 1,
        sinkCMin: 45,
        anchor: [0.02, -0.4, 0.22],
        note: 'A dense mat of roots, plus prop roots at the base. All of it runs on imported sugar.',
      }),
      sink({
        id: 'tip',
        label: 'Growing tip',
        term: 'apical meristem',
        kind: 'growth',
        demand: 0.35,
        capacity: 80,
        startStore: 12,
        growthCost: 0.85,
        maintenance: 0.4,
        saturates: 0,
        sinkCMin: 38,
        anchor: [0.02, 3.05, 0],
        note: 'Maize grows fast and tall, which makes the tip an expensive customer all season.',
      }),
    ],
    build: {
      stemHeight: 3.05,
      stemR0: 0.14,
      stemR1: 0.078,
      arrangement: 'blade',
      leafNodes: 6,
      leafScale: 1.25,
      rootSpread: 0.85,
      rootDepth: 0.7,
      colors: {
        stem: '#7FA152',
        leaf: '#67A93F',
        leafBack: '#93C263',
        vein: '#4C7F2E',
        fruit: '#D8C24F',
        fruitRipe: '#E8B72E',
        root: '#C9A375',
      },
    },
    keyFacts: [
      ['Pathway', 'C4'],
      ['Leaf area', '460 cm²'],
      ['Transport path', '0.86 m'],
      ['Main sink', 'Cob'],
      ['Optimum', '33 °C'],
    ],
    facts: [
      'Maize concentrates CO₂ inside a sealed sheath of cells before fixing it, so photorespiration — which wastes up to a third of a bean’s work on a hot day — simply does not happen.',
      'The transport path in maize is nearly a metre. The same pressure has to push sugar twice as far as in a bean, which is why maize builds wider sieve tubes.',
      'A maize cob can pull in more than half of everything the whole plant fixes in a day.',
    ],
  },

  {
    id: 'potato',
    name: 'Potato',
    binomial: 'Solanum tuberosum',
    family: 'Solanaceae',
    blurb:
      'The clearest case of a storage sink there is. A tuber is not a root — it is a swollen underground stem, and it is made almost entirely of sugar that arrived down the phloem and was locked away as starch.',
    headline:
      'A potato is last summer’s sunlight, filed underground. The plant made it purely so next spring has something to spend.',
    leaf: {
      id: 'potato',
      name: 'Potato leaflet',
      plant: 'Potato',
      pathway: 'C3',
      form: 'broad',
      nativeBiome: 'temperate',
      leafArea: 1.1,
      stomatalDensity: 0.66,
      cuticle: 0.26,
      pmax: 18,
      kLight: 300,
      kCo2: 245,
      tOpt: 22,
      tMax: 40,
      tMin: 2,
      rd25: 1.25,
      rootDepth: 0.4,
      waterStore: 0.28,
      adaptations: [],
      waterStory: '',
      colors: { leaf: '#4E9455', leafDry: '#9A8B41', accent: '#37703D' },
    },
    leafAreaM2: 0.033,
    pathLengthM: 0.3,
    phloemAreaM2: 8.5e-8,
    loadingMax: 32,
    loadingKm: 36,
    sourceCMin: 90,
    sourceCMax: 250,
    starchMax: 110,
    starchShare: 0.6,
    leafSugarStart: 28,
    leafStarchStart: 16,
    sinks: [
      sink({
        id: 'tubers',
        label: 'Tubers',
        term: 'stem tuber',
        kind: 'store',
        demand: 1.15,
        capacity: 4200,
        startStore: 260,
        growthCost: 0.16,
        maintenance: 0.8,
        saturates: 1,
        sinkCMin: 40,
        anchor: [0.12, -0.5, 0.34],
        note: 'A swollen underground stem. Sucrose arrives, is converted to starch, and stops being osmotically active — which is exactly why the tuber can keep taking more.',
      }),
      sink({
        id: 'roots',
        label: 'Roots',
        term: 'fibrous root system',
        kind: 'store',
        demand: 0.3,
        capacity: 380,
        startStore: 120,
        growthCost: 0.2,
        maintenance: 1.1,
        saturates: 1,
        sinkCMin: 45,
        anchor: [-0.3, -0.44, 0.2],
        note: 'Shallow and thirsty. Potatoes suffer in a drought faster than most crops.',
      }),
      sink({
        id: 'tip',
        label: 'Growing tip',
        term: 'apical meristem',
        kind: 'growth',
        demand: 0.28,
        capacity: 60,
        startStore: 9,
        growthCost: 0.82,
        maintenance: 0.3,
        saturates: 0,
        sinkCMin: 38,
        anchor: [0.02, 2.2, 0],
        note: 'Once tubers start filling, the plant quietly stops investing in new shoot.',
      }),
    ],
    build: {
      stemHeight: 2.2,
      stemR0: 0.112,
      stemR1: 0.05,
      arrangement: 'pinnate',
      leafNodes: 5,
      leafScale: 1.05,
      rootSpread: 0.8,
      rootDepth: 0.75,
      colors: {
        stem: '#5F8B4C',
        leaf: '#4E9455',
        leafBack: '#79B36F',
        vein: '#37703D',
        fruit: '#C9A06A',
        fruitRipe: '#D8B071',
        root: '#C29C72',
      },
    },
    keyFacts: [
      ['Pathway', 'C3'],
      ['Leaf area', '330 cm²'],
      ['Transport path', '0.30 m'],
      ['Main sink', 'Tubers'],
      ['Store capacity', '4.2 g sugar'],
    ],
    facts: [
      'Converting sucrose to starch inside the tuber is what keeps the tuber able to accept more: starch is insoluble, so it does not raise the concentration and does not push back on the phloem.',
      'A potato tuber is a stem, not a root. The "eyes" are buds — which is why a forgotten potato sprouts shoots rather than roots.',
      'The transport path is the shortest of any specimen here, which is why potatoes fill their stores so efficiently in a cool, dull summer.',
    ],
  },

  {
    id: 'tomato',
    name: 'Tomato',
    binomial: 'Solanum lycopersicum',
    family: 'Solanaceae',
    blurb:
      'A plant with a single, greedy, visible sink. Watch a truss ripen and you are watching several days of a whole plant’s photosynthesis being poured into six fruits.',
    headline:
      'Growers remove side shoots and thin the trusses for exactly one reason: fewer sinks means more sugar in each survivor.',
    leaf: {
      id: 'tomato',
      name: 'Tomato leaf',
      plant: 'Tomato',
      pathway: 'C3',
      form: 'broad',
      nativeBiome: 'temperate',
      leafArea: 1.05,
      stomatalDensity: 0.7,
      cuticle: 0.24,
      pmax: 16.5,
      kLight: 320,
      kCo2: 255,
      tOpt: 25,
      tMax: 42,
      tMin: 6,
      rd25: 1.35,
      rootDepth: 0.5,
      waterStore: 0.24,
      adaptations: [],
      waterStory: '',
      colors: { leaf: '#4F9A4E', leafDry: '#9E8C3E', accent: '#377038' },
    },
    leafAreaM2: 0.035,
    pathLengthM: 0.56,
    phloemAreaM2: 7.5e-8,
    loadingMax: 29,
    loadingKm: 35,
    sourceCMin: 88,
    sourceCMax: 250,
    starchMax: 85,
    starchShare: 0.5,
    leafSugarStart: 27,
    leafStarchStart: 13,
    sinks: [
      sink({
        id: 'truss',
        label: 'Fruit truss',
        term: 'developing fruit',
        kind: 'fruit',
        demand: 1.5,
        capacity: 1700,
        startStore: 130,
        growthCost: 0.26,
        maintenance: 0.9,
        saturates: 1,
        sinkCMin: 52,
        anchor: [0.32, 1.38, 0.18],
        note: 'The strongest sink in this library. A ripening truss will out-compete the roots, the tip and everything else.',
      }),
      sink({
        id: 'roots',
        label: 'Roots',
        term: 'tap and lateral roots',
        kind: 'store',
        demand: 0.34,
        capacity: 420,
        startStore: 150,
        growthCost: 0.2,
        maintenance: 1.3,
        saturates: 1,
        sinkCMin: 45,
        anchor: [0.02, -0.42, 0.22],
        note: 'Under-fed all through fruiting, which is why a heavily cropped tomato wilts so readily.',
      }),
      sink({
        id: 'tip',
        label: 'Growing tip',
        term: 'apical meristem',
        kind: 'growth',
        demand: 0.42,
        capacity: 70,
        startStore: 11,
        growthCost: 0.85,
        maintenance: 0.35,
        saturates: 0,
        sinkCMin: 38,
        anchor: [0.02, 2.55, 0],
        note: 'A tomato never stops trying to grow taller. Left alone it will keep going for metres.',
      }),
    ],
    build: {
      stemHeight: 2.55,
      stemR0: 0.109,
      stemR1: 0.048,
      arrangement: 'pinnate',
      leafNodes: 6,
      leafScale: 1,
      rootSpread: 0.7,
      rootDepth: 0.8,
      colors: {
        stem: '#5E8B48',
        leaf: '#4F9A4E',
        leafBack: '#7CB671',
        vein: '#377038',
        fruit: '#8FBB55',
        fruitRipe: '#D8452F',
        root: '#C49E73',
      },
    },
    keyFacts: [
      ['Pathway', 'C3'],
      ['Leaf area', '350 cm²'],
      ['Transport path', '0.56 m'],
      ['Main sink', 'Fruit truss'],
      ['Optimum', '25 °C'],
    ],
    facts: [
      'The sweetness of a tomato is decided at the leaf, days earlier. A dull week during ripening produces a watery fruit no amount of sun afterwards can fix.',
      'Tomatoes are picked green and gassed with ethylene to ripen in transit. Ripening changes the colour and softness — it cannot add sugar the plant never sent.',
      'Removing side shoots concentrates the sugar supply into fewer fruits. That is sink competition, used deliberately.',
    ],
  },

  {
    id: 'opuntia',
    name: 'Prickly pear',
    binomial: 'Opuntia ficus-indica',
    family: 'Cactaceae',
    blurb:
      'A CAM plant. It opens its stomata at night, banks the CO₂ as an acid, and spends it in daylight behind sealed doors. Slow, thrifty, and almost impossible to kill.',
    headline:
      'Chew a cactus pad at dawn and it is sour; by dusk it is not. You are tasting the CO₂ store being spent.',
    leaf: {
      id: 'opuntia',
      name: 'Cactus pad',
      plant: 'Prickly pear',
      pathway: 'CAM',
      form: 'pad',
      nativeBiome: 'desert',
      leafArea: 0.55,
      stomatalDensity: 0.16,
      cuticle: 0.95,
      pmax: 7.5,
      kLight: 260,
      kCo2: 120,
      tOpt: 30,
      tMax: 52,
      tMin: 4,
      rd25: 0.55,
      rootDepth: 0.85,
      waterStore: 0.95,
      adaptations: [],
      waterStory: '',
      colors: { leaf: '#6FA36A', leafDry: '#A8A05E', accent: '#4E7C50' },
    },
    leafAreaM2: 0.013,
    pathLengthM: 0.26,
    phloemAreaM2: 3.6e-8,
    loadingMax: 9,
    loadingKm: 22,
    sourceCMin: 70,
    sourceCMax: 210,
    starchMax: 70,
    starchShare: 0.65,
    leafSugarStart: 16,
    leafStarchStart: 22,
    sinks: [
      sink({
        id: 'pad',
        label: 'New pad',
        term: 'cladode',
        kind: 'growth',
        demand: 0.8,
        capacity: 300,
        startStore: 40,
        growthCost: 0.6,
        maintenance: 0.25,
        saturates: 1,
        sinkCMin: 48,
        anchor: [0.34, 1.62, 0.14],
        note: 'A new pad is both a sink now and a source later. Cacti grow by budding whole flattened stems.',
      }),
      sink({
        id: 'roots',
        label: 'Roots',
        term: 'shallow spreading roots',
        kind: 'store',
        demand: 0.55,
        capacity: 520,
        startStore: 240,
        growthCost: 0.15,
        maintenance: 0.5,
        saturates: 1,
        sinkCMin: 42,
        anchor: [0.02, -0.4, 0.22],
        note: 'Wide and shallow — built to grab a rain shower within hours, before it evaporates.',
      }),
      sink({
        id: 'tip',
        label: 'Areoles',
        term: 'areole meristem',
        kind: 'growth',
        demand: 0.2,
        capacity: 40,
        startStore: 6,
        growthCost: 0.8,
        maintenance: 0.15,
        saturates: 0,
        sinkCMin: 38,
        anchor: [0.05, 2.05, 0],
        note: 'The little cushions the spines grow from. Spines are leaves — the plant gave up on blades entirely.',
      }),
    ],
    build: {
      stemHeight: 1.9,
      stemR0: 0.155,
      stemR1: 0.115,
      arrangement: 'pad',
      leafNodes: 3,
      leafScale: 1.15,
      rootSpread: 0.95,
      rootDepth: 0.45,
      colors: {
        stem: '#6E9E68',
        leaf: '#6FA36A',
        leafBack: '#8CBA82',
        vein: '#4E7C50',
        fruit: '#B4553F',
        fruitRipe: '#C4482F',
        root: '#C0A07C',
      },
    },
    keyFacts: [
      ['Pathway', 'CAM'],
      ['Leaf area', '130 cm²'],
      ['Transport path', '0.26 m'],
      ['Main sink', 'New pad'],
      ['Water store', 'Very high'],
    ],
    facts: [
      'A CAM plant keeps its stomata shut all day. It is running on CO₂ it banked overnight as malic acid, which is why today’s air barely matters to it.',
      'Everything about a cactus is slow: a tenth of a maize plant’s rate, and a phloem that moves a fraction as much sugar. Slow is the strategy, not a fault.',
      'The spines are modified leaves. The flattened green pads are stems doing the photosynthesis instead.',
    ],
  },
]

export const SPECIMEN_BY_ID: Record<string, Specimen> = Object.fromEntries(
  SPECIMENS.map((s) => [s.id, s]),
)

export const DEFAULT_SPECIMEN = 'bean'
