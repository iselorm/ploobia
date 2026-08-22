/**
 * Sponsorship — the arcade's version of public-broadcast underwriting.
 *
 * A sponsor buys a plaque on a cabinet ("The Rate Lab is brought to you by…")
 * and a line on the impact page. It is non-tracking and reads as pride, not
 * advertising. Nothing here ever appears inside a running simulation. Data
 * is a static table for now; the shell's backend will serve it later.
 */

export interface Sponsor {
  name: string
  /** Short line shown under the name. */
  line: string
  url?: string
  /** 'cabinet' plaque, or 'classroom' (a school's seats covered by a donor). */
  kind: 'cabinet' | 'classroom'
}

/** cabinetId → sponsor. Empty means "looking for a sponsor". */
export const CABINET_SPONSORS: Record<string, Sponsor | undefined> = {
  // photosynthesis: { name: 'Example Foundation', line: 'Supporting STEM in Ghana', kind: 'cabinet' },
}

export const SPONSOR_CONTACT = 'mailto:sponsors@schoolarcade.org?subject=Sponsoring%20a%20cabinet'
export const SUPPORT_URL = '#/home?support=1'

/** Suggested one-tap amounts, in Ghana cedis (mobile money) and USD (card / PayPal). */
export const SUPPORT_AMOUNTS = {
  GHS: [10, 25, 50, 100],
  USD: [3, 5, 10, 25],
} as const
