export type CellType = 'rbc' | 'wbc' | 'platelet' | 'bodycell'

/**
 * The five white blood cells on the track are not clones — they are the real
 * types, in roughly their real proportions, and tapping one tells you what
 * THAT cell does. Rivals with names beat five identical blobs.
 */
export type WbcType = 'neutrophil' | 'lymphocyte' | 'monocyte' | 'eosinophil'

export interface WbcKind {
  type: WbcType
  name: string
  tagline: string
  /** Cell body tint. */
  color: string
  /** Nameplate accent dot. */
  accent: string
  /** Relative size — a monocyte really is the biggest of them. */
  scale: number
  facts: string[]
}

export const WBC_KINDS: Record<WbcType, WbcKind> = {
  neutrophil: {
    type: 'neutrophil',
    name: 'Neutrophil',
    tagline: 'First responder',
    color: '#F3EAD8',
    accent: '#C9A96A',
    scale: 1,
    facts: [
      'Neutrophils are the most common white blood cell — about 6 in every 10 — and the first to arrive when germs break in.',
      'A neutrophil eats bacteria whole. The process is called phagocytosis: it wraps around the germ and digests it.',
      'Neutrophils live only a few days, so your bone marrow makes about 100 billion fresh ones every single day.',
      'The pus in a spot is mostly used-up neutrophils that died fighting. Grim, but that is your immune system winning.',
    ],
  },
  lymphocyte: {
    type: 'lymphocyte',
    name: 'Lymphocyte',
    tagline: 'Remembers germs',
    color: '#E7DCF0',
    accent: '#9A7FC4',
    scale: 0.82,
    facts: [
      'Lymphocytes are the memory of your immune system. Meet a germ once and they can recognise it years later.',
      'B lymphocytes make antibodies — sticky proteins that latch onto a germ and mark it for destruction.',
      'T lymphocytes hunt down your own cells that have been hijacked by a virus, and destroy them.',
      'Vaccines work by showing lymphocytes a harmless piece of a germ, so they are ready before the real one arrives.',
    ],
  },
  monocyte: {
    type: 'monocyte',
    name: 'Monocyte',
    tagline: 'Becomes a macrophage',
    color: '#F0E2CE',
    accent: '#B98A4E',
    scale: 1.25,
    facts: [
      'The monocyte is the biggest cell in your blood. When it leaves the bloodstream it transforms into a macrophage — "big eater".',
      'A macrophage can swallow over 100 bacteria before it wears out, and it cleans up dead cells too.',
      'Macrophages show pieces of the germs they eat to lymphocytes — that is how the immune system learns what to attack.',
    ],
  },
  eosinophil: {
    type: 'eosinophil',
    name: 'Eosinophil',
    tagline: 'Parasite fighter',
    color: '#F7DCC8',
    accent: '#D9703F',
    scale: 0.95,
    facts: [
      'Eosinophils attack parasites far too big to swallow, so they spray them with chemicals instead.',
      'Eosinophil numbers climb during an allergic reaction — they are part of why hay fever feels the way it does.',
      'Only about 1 to 3 in every 100 white blood cells is an eosinophil, so spotting one is genuinely lucky.',
    ],
  },
}

/** Which kind each of the five white cells on the track is. */
export const WBC_ROSTER: WbcType[] = [
  'neutrophil',
  'neutrophil',
  'lymphocyte',
  'monocyte',
  'eosinophil',
]

export interface Fact {
  type: CellType | 'vessel'
  text: string
}

export const RBC_FACTS: string[] = [
  'A red blood cell can zoom through your entire body and be back at your heart in about 60 seconds!',
  'Red blood cells are shaped like tiny donuts with the hole pinched shut. That dimpled shape lets them fold and squeeze through capillaries thinner than they are!',
  'Every single second, your bone marrow makes about 2 million new red blood cells. Yes — every second!',
  'Red blood cells have no nucleus! They toss it out to make more room for hemoglobin, the protein that grabs onto oxygen.',
  'One red blood cell lives for about 120 days, then gets recycled by your spleen. Circle of life!',
  'Hemoglobin — the stuff inside red blood cells — contains iron. That is part of why your blood is red, and why you need iron in your diet!',
  'You have about 25 trillion red blood cells in your body right now. That is more than the number of stars in the Milky Way!',
  'Red blood cells are bendy acrobats — they can squish down to half their width to slip through the tiniest blood vessels.',
  'One red blood cell carries about 270 million haemoglobin molecules — and each haemoglobin can grab 4 oxygen molecules. That is over a billion O₂ per cell!',
  'Blood full of oxygen is bright red; blood that has delivered some turns darker red. Watch the crowd change colour as you ride the loop — never blue!',
  'Surprise: at rest your red cells hand over only about 1 of their 4 oxygens. Blood in your veins is still three-quarters loaded — a reserve for when you suddenly need it.',
  'When you sprint, warm acidic muscle makes haemoglobin let go far more easily, so each red cell drops 3 of its 4. Same cells, triple the delivery.',
  'Haemoglobin is a pick-up-and-drop-off pro: it grabs O₂ where there is lots of it (the lungs) and lets go where there is little (your busy tissues).',
]

export const WBC_FACTS: string[] = [
  'White blood cells are your body\'s germ-fighting army. Some of them swallow invading germs whole!',
  'White blood cells are much bigger than red blood cells — but you have about 600 times fewer of them. Quality over quantity!',
  'Some white blood cells can squeeze right out of a blood vessel to chase germs hiding in your tissues.',
  'When you get a fever, your body is often making extra white blood cells to battle an infection. That big pale one drifting by is on patrol!',
]

export const PLATELET_FACTS: string[] = [
  'Platelets are tiny cell fragments that rush to a cut and plug the leak — like a living patch kit!',
  'A platelet is only about a quarter the width of a red blood cell. Small but mighty!',
  'Platelets live fast: each one lasts only about 8 to 10 days before your body replaces it.',
  'When you scrape your knee, platelets stick together and weave a net called a clot that stops the bleeding.',
]

export const BODYCELL_FACTS: string[] = [
  'This is a body cell — the tiny living unit your whole body is built from. You are made of about 37 trillion of them!',
  'Every cell is wrapped in a cell membrane — a smart skin that decides what comes in (like oxygen) and what goes out (like CO₂).',
  'The dark blob inside is the nucleus — the cell\'s control centre. It holds your DNA, the instructions for building YOU.',
  'The little orange power stations are mitochondria. They combine oxygen with food to release energy — that is why cells need the oxygen you deliver!',
  'When a cell uses oxygen to release energy, it makes carbon dioxide as waste. That is respiration — and the blood hauls the CO₂ away.',
  'Muscle cells work hard, so they are packed with extra mitochondria — and they order much more oxygen when you run!',
]

export const HEART_FACTS: string[] = [
  'Your heart is two pumps in one. The right side sends blood to the lungs; the left side sends it round the whole body — so blood crosses the heart TWICE each lap.',
  'The left ventricle wall is about three times thicker than the right. It has to push blood to your toes; the right only has to reach the lungs next door.',
  'Valves snap shut behind you so blood cannot flow backwards. That snapping is the "lub-dub" a doctor hears through a stethoscope.',
  'A resting heart beats about 70 times a minute. Sprinting, it can pass 180 — and it pumps more with every beat too.',
]

export const VESSEL_FACTS: string[] = [
  'If you lined up all the blood vessels in your body end to end, they would wrap around planet Earth more than twice!',
  'Your heart beats about 100,000 times a day, pushing blood through this whole network nonstop.',
  'Blood looks bright red when it is full of oxygen and darker red when it is not — it is never blue!',
]

export const ALL_TICKER_FACTS: string[] = [
  ...HEART_FACTS,
  ...RBC_FACTS,
  ...WBC_FACTS,
  ...PLATELET_FACTS,
  ...BODYCELL_FACTS,
  ...VESSEL_FACTS,
]

export const CELL_LABELS: Record<CellType, string> = {
  rbc: 'Red blood cell',
  wbc: 'White blood cell',
  platelet: 'Platelet',
  bodycell: 'Body cell',
}

export const CELL_TAGLINES: Record<CellType, string> = {
  rbc: 'Carries oxygen',
  wbc: 'Fights germs',
  platelet: 'Plugs leaks',
  bodycell: 'Uses oxygen for energy',
}

export const CELL_COLORS: Record<CellType, string> = {
  rbc: '#D43A35',
  wbc: '#C9A96A',
  platelet: '#EFA9A0',
  bodycell: '#C98A5E',
}

/**
 * Deterministic rotating fact picker: shuffles a pool and walks through it
 * without repeating until the pool is exhausted, then reshuffles.
 */
export function createFactRotator(pool: string[]): () => string {
  let remaining: string[] = []
  return () => {
    if (remaining.length === 0) {
      remaining = [...pool]
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[remaining[i], remaining[j]] = [remaining[j], remaining[i]]
      }
    }
    return remaining.pop()!
  }
}

// Test handle for the verification suite.
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__wbcRoster = WBC_ROSTER
}
