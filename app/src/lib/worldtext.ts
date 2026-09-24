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
  foundry: {
    /** The red banners either side of the mouth — lines each. */
    bannerTitle: ['FOUNDRY'],
    bannerMotto: ['PEOPLE', 'MATERIALS', 'POSSIBILITIES'],
    /** The chalkboard by the fuel yard. */
    chalkboard: ['Small tools.', 'Big questions.'],
    /** The rule on the far wall. */
    rule: 'BUILD · TEST · LEARN · REPEAT',
  },
} as const
