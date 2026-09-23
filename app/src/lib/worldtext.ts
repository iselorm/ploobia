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
