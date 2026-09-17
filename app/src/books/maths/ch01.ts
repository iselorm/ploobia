/**
 * The Stall Book · Chapter 1 · Number at the market
 *
 * Cambridge IGCSE Mathematics 0580, Number — read from The Numberworks,
 * Door 1. This is a field JOURNAL, not a textbook (review 2, 13 Sep): every
 * page opens with what the learner discovered, in the learner's own figures,
 * then names it in one sentence, and only then — folded behind
 * "Show me how →" — gives the method, the prose and the Analyst's notation.
 *
 * A page nobody has earned shows its name and nothing else. The formula is
 * never printed before the day that produced it.
 *
 * Every braced term names a verb the Market registers (`board/price`,
 * `alley/replay`, `till/count`, `basin/count`, `scale/weigh`) — tapping it
 * sends the reader back into the world, which is the whole point of the
 * terms: the book is a remote control for the stall.
 *
 * `${key}` is filled from `discoveriesOf` in `lib/market.ts`; a page with no
 * discovery is locked, so a `${key}` never reaches a learner unfilled.
 */

import type { Chapter } from '@/lib/page'

export const CH01: Chapter = {
  id: '0580:1',
  code: '1',
  title: { en: 'Number at the market' },
  sections: [
    {
      id: '0580:1.market',
      code: '1',
      title: { en: 'The Market' },
      stage: 'market',
      statements: ['0580:C1.6', '0580:C1.16', '0580:C1.11', '0580:C1.12', '0580:C1.13', '0580:C1.17'],
      pages: [
        {
          id: 'how-many',
          kind: 'journal',
          title: { en: 'How many' },
          journal: {
            discovery: { en: '${sum}' },
            provenance: { en: '${note}' },
            names: {
              explorer: { en: 'This is called {dividing:basin/count|sharing a total into parts of the same size} — you shared what the till needs into parts the size of one tomato’s price.' },
              analyst: { en: 'This is {division:basin/count|sharing a total into parts of the same size}: the target shared into parts the size of the unit {price:board/price}.' },
            },
            how: {
              explorer: { en: 'To find how many you must sell, share the target by the price: ${target} ÷ ${price} = ${need}. You said ${said}.' },
              scientist: {
                en: 'To find how many you must sell, share the target by the price: ${target} ÷ ${price} = ${need}. You said ${said}. Round UP, never down — you cannot sell part of a tomato, and one short of the target is short.',
              },
            },
            notation: { en: 'n = T ÷ p, rounded up. T is the target, p the unit price.' },
            tryIt: [
              { label: { en: 'the board' }, verb: 'board/price' },
              { label: { en: 'count the basin' }, verb: 'basin/count' },
            ],
            locked: { en: 'How many' },
            stamps: ['0580:C1.6', '0580:C1.16'],
          },
        },
        {
          id: 'the-till',
          kind: 'journal',
          title: { en: 'The till' },
          journal: {
            discovery: { en: '${sum}' },
            provenance: { en: '${note}' },
            names: {
              explorer: { en: 'This is called {revenue:till/count|everything the till takes in a day} — the {price:board/price} times the number that {sold:alley/replay}.' },
            },
            how: {
              explorer: { en: 'price × sold = till. ${price} × ${sold} = ${till}. Not the number in the basin, and not the number who walked past — only what went.' },
              scientist: {
                en: 'price × sold = till. ${price} × ${sold} = ${till}. Not the number in the basin, and not the number who walked past. ${buyers} people carried those ${sold} away — buyers are people, sales are tomatoes. When the price changes during the day, add the two products.',
              },
            },
            notation: { en: 'R = p × q. With two prices in one day, R = p₁q₁ + p₂q₂.' },
            tryIt: [
              { label: { en: 'count the till' }, verb: 'till/count' },
              { label: { en: 'replay the alley' }, verb: 'alley/replay' },
            ],
            locked: { en: 'The till' },
            stamps: ['0580:C1.6', '0580:C1.16'],
          },
        },
        {
          id: 'the-alley',
          kind: 'journal',
          title: { en: 'The alley' },
          journal: {
            discovery: { en: '${sum}' },
            provenance: { en: '${note}' },
            names: {
              explorer: { en: 'How many stop is not up to you — it is up to the {price:board/price}. This is called {demand:alley/replay|how many will buy at a price}.' },
              analyst: { en: 'How many stop is set by the {price:board/price}, not by you. This is {demand:alley/replay|how many will buy at a price}: dearer, fewer; cheaper, more.' },
            },
            how: {
              explorer: { en: 'Buyers to passers at ${cheap}: ${cheapBuyers} : ${cheapPassed}. At ${dear}: ${dearBuyers} : ${dearPassed}. The same ${crowd} people walked past both times.' },
              scientist: {
                en: 'Buyers to passers at ${cheap}: ${cheapBuyers} : ${cheapPassed}. At ${dear}: ${dearBuyers} : ${dearPassed}. The same ${crowd} people walked the alley both times — what changed was the board. A buyer takes one to four, so the tomatoes that go are always more than the people who stop.',
              },
            },
            notation: { en: 'q = f(p), falling. Door 6 will ask you to draw it.' },
            tryIt: [
              { label: { en: 'replay the alley' }, verb: 'alley/replay' },
              { label: { en: 'the board' }, verb: 'board/price' },
            ],
            locked: { en: 'The alley' },
            stamps: ['0580:C1.11', '0580:C1.12'],
          },
        },
        {
          id: 'four-oclock',
          kind: 'journal',
          title: { en: 'Four o’clock' },
          journal: {
            discovery: { en: '${sum}' },
            provenance: { en: '${note}' },
            names: {
              explorer: { en: 'Taking a part of the {price:board/price} off is called a {discount:board/price|a percentage taken off the price}.' },
            },
            how: {
              explorer: { en: '${pct} % of ${price} taken off leaves ${after}. ${lateN} tomatoes went after four, and the till closed on ${till}.' },
              scientist: {
                en: '${pct} % of ${price} taken off leaves ${after}: a percentage decrease. ${lateN} tomatoes went after four, and the till closed on ${till}. A tomato left in the basin is worth nothing; one sold cheaper is worth ${after}.',
              },
            },
            notation: { en: 'new = old × (1 − r), where r is the fraction taken off.' },
            tryIt: [
              { label: { en: 'the board' }, verb: 'board/price' },
              { label: { en: 'count the till' }, verb: 'till/count' },
            ],
            locked: { en: 'Four o’clock' },
            stamps: ['0580:C1.13'],
          },
        },
        {
          id: 'best-for-what',
          kind: 'journal',
          title: { en: 'Best for what' },
          journal: {
            discovery: { en: '${sum}' },
            provenance: { en: '${note}' },
            names: {
              explorer: { en: '“Best” is not a number until you say best for what. Each way of measuring picks its own day — and sometimes two days {tie:till/count|the same figure on both}.' },
            },
            how: {
              explorer: { en: '${till}. ${target}. ${each}. ${left}. Four questions, four answers — the same three days.' },
              scientist: {
                en: '${till}. ${target}. ${each}. ${left}. One set of days, four measures, and they do not agree. Money per tomato is a RATE: the till shared by what went. Nearest the target is a difference. Least left over is waste.',
              },
            },
            notation: { en: 'Compare rates, not totals, when the amounts differ: till ÷ sold.' },
            tryIt: [
              { label: { en: 'count the till' }, verb: 'till/count' },
              { label: { en: 'count the basin' }, verb: 'basin/count' },
            ],
            locked: { en: 'Best for what' },
            stamps: ['0580:C1.12', '0580:C1.6'],
          },
        },
        {
          id: 'profit',
          kind: 'journal',
          title: { en: 'Profit' },
          journal: {
            discovery: { en: '${sum}' },
            provenance: { en: '${note}' },
            names: {
              explorer: { en: 'What is left after you pay for the basin is {profit:till/count|the till less what the stock cost you} — and as a share of what you paid, a percentage.' },
            },
            how: {
              explorer: { en: '${till} − ${paid} = ${profit}. Then ${profit} ÷ ${paid} = ${pct} %.' },
              scientist: { en: '${till} − ${paid} = ${profit}. Then ${profit} ÷ ${paid} = ${pct} % — the profit as a percentage of what the stock cost, not of the till.' },
            },
            notation: { en: '(R − C) ÷ C × 100.' },
            tryIt: [
              { label: { en: 'count the till' }, verb: 'till/count' },
              { label: { en: 'weigh a kilo' }, verb: 'scale/weigh' },
            ],
            locked: { en: 'Profit' },
            stamps: ['0580:C1.13'],
          },
        },
        {
          id: 'friday',
          kind: 'journal',
          title: { en: 'Friday' },
          journal: {
            discovery: { en: '${sum}' },
            provenance: { en: '${note}' },
            names: {
              explorer: { en: 'A price that grows by the same fraction every day does not climb in a straight line — each step is bigger than the last. That is {growth:scale/weigh|multiplying by the same number again and again}.' },
            },
            how: {
              explorer: { en: '${p0} × ${r} four times over is ${friday}. You said ${said}.' },
              scientist: { en: '${p0} × ${r}⁴ = ${friday}. You said ${said}. A straight line through the first four mornings undershoots, because the steps are growing.' },
            },
            notation: { en: 'pₙ = p₀ × rⁿ.' },
            tryIt: [{ label: { en: 'weigh a kilo' }, verb: 'scale/weigh' }],
            locked: { en: 'Friday' },
            stamps: ['0580:C1.17'],
          },
        },
      ],
    },
  ],
}
