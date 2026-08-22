/**
 * Leaves and climates.
 *
 * The same photosynthesis machinery runs in every leaf — what differs is the
 * hardware the plant evolved. Swapping the leaf changes real parameters
 * (photosynthetic pathway, light and CO₂ half-saturation constants, optimum
 * temperature, cuticle thickness, stomatal density, root reach, water store),
 * which is why a rainforest leaf dies in a desert and a cactus barely notices.
 *
 * Numbers are realistic orders of magnitude drawn from plant-physiology
 * literature, rounded to teachable values.
 */

export type Pathway = 'C3' | 'C4' | 'CAM'
export type LeafForm = 'broad' | 'blade' | 'needle' | 'pad'
export type BiomeId = 'rainforest' | 'temperate' | 'savanna' | 'desert' | 'boreal'

export interface LeafPreset {
  id: string
  /** Short name used in menus. */
  name: string
  /** A real plant that works this way. */
  plant: string
  pathway: Pathway
  form: LeafForm
  /** The climate this leaf actually evolved in. */
  nativeBiome: BiomeId

  /* ---- morphology (also drives the 3D form and the water budget) ---- */
  /** Leaf surface area, relative to a typical temperate leaf (= 1). */
  leafArea: number
  /** Stomata per mm², normalised 0–1 (real range ≈ 40–800 mm⁻²). */
  stomatalDensity: number
  /** Waxy cuticle thickness 0–1. High = waterproof. */
  cuticle: number

  /* ---- physiology ---- */
  /** Light-saturated photosynthetic capacity, µmol CO₂ m⁻² s⁻¹. */
  pmax: number
  /** Light half-saturation constant, µmol photons m⁻² s⁻¹. Low = shade plant. */
  kLight: number
  /** CO₂ half-saturation constant, ppm. C4 plants concentrate CO₂, so theirs is tiny. */
  kCo2: number
  /** Optimum temperature, °C. */
  tOpt: number
  /** Temperature at which enzymes are fully denatured, °C. */
  tMax: number
  /** Chilling limit — below this the leaf's membranes stop working, °C. */
  tMin: number
  /** Dark respiration at 25 °C, µmol CO₂ m⁻² s⁻¹. */
  rd25: number
  /** How deep/wide the roots reach, 0–1. High = finds water others cannot. */
  rootDepth: number
  /** Internal water reservoir, 0–1. Succulents are almost all reservoir. */
  waterStore: number

  /* ---- content ---- */
  adaptations: string[]
  /** One line answering "why does this plant need this much water?" */
  waterStory: string
  colors: { leaf: string; leafDry: string; accent: string }
}

export const LEAVES: LeafPreset[] = [
  {
    id: 'rainforest',
    name: 'Rainforest broadleaf',
    plant: 'Monstera / understorey fig',
    pathway: 'C3',
    form: 'broad',
    nativeBiome: 'rainforest',
    leafArea: 1.55,
    stomatalDensity: 0.85,
    cuticle: 0.12,
    pmax: 12,
    kLight: 210,
    kCo2: 260,
    tOpt: 28,
    tMax: 47,
    tMin: 8,
    rd25: 1.1,
    rootDepth: 0.25,
    waterStore: 0.2,
    adaptations: [
      'Enormous, thin, flat blade — it is fighting for scraps of light on a dark forest floor, so it builds the biggest solar panel it can afford.',
      'Saturates at low light (around 210 µmol m⁻² s⁻¹). It is built for dappled shade, and full desert sun does not make it any faster.',
      'Barely any waxy cuticle and stomata packed densely across the underside. In air that is already 85% humid, losing water costs almost nothing.',
      'A pointed "drip tip" sheds rain so the surface dries and fungi cannot take hold.',
    ],
    waterStory:
      'It drinks enormously — but rain arrives almost daily and the air is so humid that evaporation from the leaf is slow. Cheap water means it never had to evolve to save any.',
    colors: { leaf: '#3F9E52', leafDry: '#8A8A45', accent: '#1E8A7B' },
  },
  {
    id: 'temperate',
    name: 'Temperate broadleaf',
    plant: 'Oak / bean plant',
    pathway: 'C3',
    form: 'broad',
    nativeBiome: 'temperate',
    leafArea: 1,
    stomatalDensity: 0.6,
    cuticle: 0.35,
    pmax: 16,
    kLight: 330,
    kCo2: 250,
    tOpt: 24,
    tMax: 45,
    tMin: 2,
    rd25: 1.3,
    rootDepth: 0.6,
    waterStore: 0.3,
    adaptations: [
      'The all-rounder — moderate size, moderate everything. This is the leaf every textbook diagram is drawn from.',
      'Drops its leaves in winter rather than paying to defend them against frost.',
      'A moderate cuticle: waterproof enough for a dry August, thin enough not to waste resources.',
    ],
    waterStory:
      'Middling thirst for middling weather. Rain is reliable but not constant, so it closes its stomata during a dry spell and reopens them after rain.',
    colors: { leaf: '#57A75B', leafDry: '#A08C3E', accent: '#3E7C43' },
  },
  {
    id: 'savanna',
    name: 'Savanna grass blade',
    plant: 'Maize / sorghum (C4)',
    pathway: 'C4',
    form: 'blade',
    nativeBiome: 'savanna',
    leafArea: 0.75,
    stomatalDensity: 0.5,
    cuticle: 0.5,
    pmax: 30,
    kLight: 720,
    kCo2: 45,
    tOpt: 33,
    tMax: 50,
    tMin: 6,
    rd25: 1.6,
    rootDepth: 0.75,
    waterStore: 0.2,
    adaptations: [
      'C4 photosynthesis: it pumps CO₂ into a sealed inner compartment before fixing it, so the enzyme always sees a rich CO₂ supply.',
      'Because of that pump it almost never photorespirates — the wasteful reaction that cripples ordinary C3 leaves in heat and bright light.',
      'Needs blazing sun to reach full speed (saturates near 720 µmol m⁻² s⁻¹) and peaks at 33 °C, a temperature that is already damaging an oak leaf.',
      'Narrow upright blade sheds midday heat and can roll up lengthwise to hide its stomata in a drought.',
    ],
    waterStory:
      'It gets far more sugar per litre of water than a C3 plant, because its CO₂ pump lets it keep its stomata narrower. Same thirst, twice the harvest.',
    colors: { leaf: '#7FB03F', leafDry: '#C4A94F', accent: '#B97D10' },
  },
  {
    id: 'desert',
    name: 'Desert succulent pad',
    plant: 'Prickly pear (CAM)',
    pathway: 'CAM',
    form: 'pad',
    nativeBiome: 'desert',
    leafArea: 0.35,
    stomatalDensity: 0.2,
    cuticle: 0.95,
    pmax: 7,
    kLight: 520,
    kCo2: 120,
    tOpt: 32,
    tMax: 52,
    tMin: 3,
    rd25: 0.7,
    rootDepth: 0.85,
    waterStore: 0.95,
    adaptations: [
      'CAM: it opens its stomata at NIGHT, when the air is cool and damp, stores the CO₂ as an acid, then works through the day with everything sealed shut.',
      'A thick waxy cuticle and very few, deeply sunken stomata. Water essentially cannot escape.',
      'Fat water-storing tissue — the pad is a canteen. It can photosynthesise for weeks on a single rainfall.',
      'Tiny surface area for its volume, and spines instead of leaves: less area to heat up, less area to leak from, and nothing worth eating.',
      'Wide shallow roots that grab a desert cloudburst before it evaporates.',
    ],
    waterStory:
      'It barely drinks at all — the trade-off is that it is slow. Sealing the doors saves water but starves the leaf of CO₂, which is exactly why a cactus grows a few centimetres a year and a vine grows metres.',
    colors: { leaf: '#6FA97E', leafDry: '#B6A277', accent: '#C1743B' },
  },
  {
    id: 'boreal',
    name: 'Conifer needle',
    plant: 'Spruce / pine',
    pathway: 'C3',
    form: 'needle',
    nativeBiome: 'boreal',
    leafArea: 0.3,
    stomatalDensity: 0.35,
    cuticle: 0.85,
    pmax: 9,
    kLight: 420,
    kCo2: 250,
    tOpt: 17,
    tMax: 40,
    tMin: -8,
    rd25: 0.8,
    rootDepth: 0.5,
    waterStore: 0.4,
    adaptations: [
      'Keeps working at temperatures near freezing — its optimum is only 17 °C, far cooler than an oak.',
      'A needle is a leaf with almost no surface area and a thick waxy skin, because frozen ground means water is unavailable even when snow is everywhere.',
      'Evergreen: it never pays to rebuild leaves for a growing season only three months long.',
      'Denatures early, by about 40 °C — it has never needed heat tolerance, so it never evolved any.',
    ],
    waterStory:
      'Frozen water might as well be no water. A needle is shaped like a desert leaf because a frozen winter is a drought.',
    colors: { leaf: '#4A7E5E', leafDry: '#8F7F4F', accent: '#2E6DA8' },
  },
]

export const LEAF_BY_ID: Record<string, LeafPreset> = Object.fromEntries(
  LEAVES.map((l) => [l.id, l]),
)

export const PATHWAY_NOTE: Record<Pathway, string> = {
  C3: 'C3 — the ordinary route. Simple and efficient when it is cool and CO₂ is plentiful, but it wastes energy on photorespiration when it is hot and bright.',
  C4: 'C4 — a CO₂ pump feeds a sealed inner chamber, so photorespiration almost never happens. Costs extra energy to run, which only pays off in heat and strong light.',
  CAM: 'CAM — stomata open at night to collect CO₂ as an acid, then stay shut all day. Saves enormous amounts of water at the cost of a low top speed.',
}

/* ------------------------------------------------------------------ */
/* Climates                                                           */
/* ------------------------------------------------------------------ */

export interface BiomePreset {
  id: BiomeId
  name: string
  /** One-word label for chips. */
  short: string
  /** Typical midday light as a fraction of full sun (2000 µmol m⁻² s⁻¹). */
  light: number
  /** Typical daytime air temperature, °C. */
  temp: number
  /** Relative humidity 0–1 — this is what decides how fast a leaf loses water. */
  humidity: number
  /** Annual rainfall, mm (display only). */
  rainfall: number
  /** Starting soil water, 0–1. */
  soilWater: number
  /** How fast soil water is replenished, 0–1 per minute of sim time. */
  rainRate: number
  sky: { bright: string; dim: string }
  ground: string
  hills: string
  note: string
}

export const BIOMES: BiomePreset[] = [
  {
    id: 'rainforest',
    name: 'Tropical rainforest',
    short: 'Rainforest',
    light: 0.55,
    temp: 27,
    humidity: 0.88,
    rainfall: 2600,
    soilWater: 0.92,
    rainRate: 0.55,
    sky: { bright: '#BFE3D6', dim: '#5A7A6B' },
    ground: '#5E8F4A',
    hills: '#4F7F41',
    note: 'Hot, soaking wet, and surprisingly dim at ground level — the canopy steals most of the light before it lands.',
  },
  {
    id: 'temperate',
    name: 'Temperate woodland',
    short: 'Woodland',
    light: 0.65,
    temp: 20,
    humidity: 0.6,
    rainfall: 900,
    soilWater: 0.7,
    rainRate: 0.2,
    sky: { bright: '#AEDEF0', dim: '#5E7B8C' },
    ground: '#8FC97E',
    hills: '#7CB56B',
    note: 'Mild and reliably damp, with a real winter. The default conditions almost every school experiment assumes.',
  },
  {
    id: 'savanna',
    name: 'Savanna grassland',
    short: 'Savanna',
    light: 0.95,
    temp: 32,
    humidity: 0.35,
    rainfall: 620,
    soilWater: 0.4,
    rainRate: 0.09,
    sky: { bright: '#E9D9A8', dim: '#8A7A55' },
    ground: '#C9AE5F',
    hills: '#B79A4E',
    note: 'Brilliant sun and serious heat, with rain arriving in one short season and nothing for the rest of the year.',
  },
  {
    id: 'desert',
    name: 'Hot desert',
    short: 'Desert',
    light: 1,
    temp: 41,
    humidity: 0.14,
    rainfall: 140,
    soilWater: 0.12,
    rainRate: 0.02,
    sky: { bright: '#F0DCBA', dim: '#9B8360' },
    ground: '#D8B583',
    hills: '#C79E6C',
    note: 'The most punishing combination on Earth: maximum light, brutal heat, and air so dry that an open stoma is an open tap.',
  },
  {
    id: 'boreal',
    name: 'Boreal forest',
    short: 'Boreal',
    light: 0.6,
    temp: 8,
    humidity: 0.58,
    rainfall: 450,
    soilWater: 0.62,
    rainRate: 0.16,
    sky: { bright: '#C6DCEA', dim: '#6B7F8E' },
    ground: '#8FA88A',
    hills: '#7C9880',
    note: 'Cold and pale. Water is everywhere but frozen solid for much of the year, so a leaf here faces a drought made of ice.',
  },
]

export const BIOME_BY_ID: Record<BiomeId, BiomePreset> = Object.fromEntries(
  BIOMES.map((b) => [b.id, b]),
) as Record<BiomeId, BiomePreset>
