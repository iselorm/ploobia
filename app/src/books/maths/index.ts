/**
 * The Stall Book — Cambridge IGCSE Mathematics 0580, read from The
 * Numberworks. One chapter for now (Number, at Door 1); Algebra Machines
 * brings the next.
 *
 * The lens (Cambridge / Ghana NaCCA) is a dial on the ledger, not a second
 * book: the same pages, the same words, a different strand name in the
 * corner and different codes in the grown-ups' view (review 2, D5).
 */

import type { Book } from '@/lib/page'
import { CH01 } from './ch01'

export const BOOK_0580: Book = {
  id: 'maths-0580',
  subject: 'Mathematics',
  syllabus: '0580',
  cabinet: 'numberworks',
  chapters: [CH01],
}

export { CH01 }
