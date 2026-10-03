/**
 * The words on the Archipelago's signage. Every painted sign in the world is
 * lettering-free; these strings are drawn onto it at runtime, so a language
 * file can replace them without touching an asset. English first (the
 * languages note: Twi and Hausa next, Swahili and Arabic down the line).
 */
export const WORLD_TEXT = {
  /** People. Fantasy names are fixed across languages (the bible); only their lines localise. */
  people: {
    /** The foundry foreman. Selorm 2026-09-22: the Swahili name — sefu, "sword". */
    foreman: { name: 'Sefu', title: 'the Foreman' },
    /** The grower at the Landing — her mother's last cutting is the stake of S0. */
    nara: { name: 'Nara', title: 'the Grower' },
    /** The one who sends the child across the water. */
    sela: { name: 'Sela', title: 'of the Watch' },
  },
  landing: {
    /** The empty plot's name plate, before a name. */
    plotUnnamed: ['Your plot'],
    /** The Codex page by the well — author: the Stall. Words drawn on the parchment at runtime. */
    codexPage: {
      title: 'A soaked bed wants air before it wants water.',
      line: 'Look before you feed it.',
      author: 'the Stall',
      rule: 'Roots need air as well as water; without enough air they stop taking water up.',
      discovered: 'You discovered: check before you pour.',
    },
  },
  /** S1 — The Handoff: the words on its buttons and labels (lines live in lib/nara.ts). */
  keep: {
    /** Explorer's five choices, short. The say-back (nara.ts SAY_BACK) is the full sentence. */
    choice: {
      right: 'Probe first. Soaked or damp, wait. Dry, one can. Check again tomorrow.',
      daily: 'A can every morning.',
      droop: 'A can the morning after the leaves go down.',
      leave: 'Leave it and let it sort itself out.',
      supervised: "Keep doing what I showed you — with Sela's people helping.",
    },
    confirm: 'Yes, that',
    revise: 'No — let me say it again',
    begin: 'Begin dispatch · 14 days',
    notYet: 'Not yet',
    practice: 'Try another fortnight · practice · no new crates',
    practiceRain: 'Same rain as last time',
    replay: 'Watch it again',
    dates: 'Every day',
    next: 'So — what should I do next time?',
    /** The economy line, labelled as authored, never as a measured fact. */
    economyNote: 'One crate per packing worker per fortnight — how the Landing counts it, not a measurement.',
    crates: 'Crates at the jetty',
    rain: 'Rain on the night you left',
  },
  foundry: {
    /** The red banners either side of the mouth — lines each. */
    bannerTitle: ['FOUNDRY'],
    bannerMotto: ['PEOPLE', 'MATERIALS', 'POSSIBILITIES'],
    /** The chalkboard by the fuel yard. */
    chalkboard: ['Small tools.', 'Big questions.'],
    /** Sela's order slate, on the bench beside Sefu (S2). */
    slate: ['Jetty gate', 'straps + pins', 'that will not rust', '— Sela'],
    /** The rule on the far wall. */
    rule: 'BUILD · TEST · LEARN · REPEAT',
  },
} as const
