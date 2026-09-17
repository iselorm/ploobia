/**
 * Cambridge IGCSE Biology 0610 · Chapter 8 · Transport in plants
 *
 * Four sections on the Sugar Line: 8.1 and 8.4 at the Line (door 3), 8.3 at
 * the Hatches (door 2), and 8.2 pointing at the Roots — a door nobody has
 * discovered yet, said exactly that way, with the stain investigation
 * running at the Line's xylem until it is.
 */

import type { Chapter } from '@/lib/page'

export const CH08: Chapter = {
  id: '0610:8',
  code: '8',
  title: { en: 'Transport in plants' },
  sections: [
    {
      id: '0610:8.1',
      code: '8.1',
      title: { en: 'Xylem and phloem' },
      stage: 'stem',
      statements: ['0610:8.1.1', '0610:8.1.2', '0610:8.1.3'],
      pages: [
        {
          id: '8.1.story',
          kind: 'story',
          title: { en: 'The two pipes' },
          figure: 'stem/section',
          text: {
            explorer: {
              en: 'A plant has two kinds of pipe. {Xylem:stem/xylem} carries {water:xylem/flow} up from the {roots:plant/roots}, and it holds the plant {up:stem/support}. {Phloem:stem/phloem} carries {sugar:phloem/flow} to wherever it is needed. Cut the {bark ring:phloem/cut} and the sugar stops; cut the {wood:xylem/cut} and the leaf goes limp.',
            },
            scientist: {
              en: 'Two tissues, opposite jobs. {Xylem:stem/xylem} transports {water and mineral ions:xylem/flow} from the {roots:plant/roots} upward, and gives {support:stem/support}. {Phloem:stem/phloem} transports {sucrose and amino acids:phloem/flow} from where they are made to where they are used or stored. In a stem the xylem sits inside the {phloem:phloem/cut|the ring cut takes only the phloem}; in a root the xylem is at the centre.',
            },
            analyst: {
              en: '{Xylem:stem/xylem}: {water and mineral ions:xylem/flow} up from the {roots:plant/roots}, and mechanical {support:stem/support}. {Phloem:stem/phloem}: {sucrose and amino acids:phloem/flow}, source to sink, through living sieve tubes with their {sieve plates:stem/plate}. Girdle the stem — {cut the ring:phloem/cut} — and sugar piles up above the cut while water keeps rising; {cut the wood:xylem/cut} and the leaf transpires what it holds, then wilts.',
            },
          },
          ext: {
            en: 'Xylem vessels have no cell contents and no cross walls, so each is one continuous tube; their walls are thickened with {lignin:stem/xylem}, which makes them strong and waterproof.',
          },
        },
        {
          id: '8.1.rule',
          kind: 'rule',
          title: { en: 'Which pipe carries what' },
          figure: 'stem/section',
          text: {
            explorer: {
              en: 'Blue pipe: {xylem:stem/xylem}, water going up from the {roots:plant/roots}. Gold pipe: {phloem:stem/phloem}, sugar going wherever the plant sends it — down to the roots tonight. Tap a name and its pipe lights; tap {sugar:phloem/flow} and a parcel sets off.',
            },
            scientist: {
              en: '{Xylem:stem/xylem} — water and mineral ions, root to leaf; also support. {Phloem:stem/phloem} — sucrose and amino acids, source to sink. Position in a stem section: xylem inside, phloem outside, in a ring of vascular bundles; in a root, xylem at the centre; in a leaf, both in the veins.',
            },
            analyst: {
              en: '{Xylem:stem/xylem} moves water and ions by transpiration pull through dead, open vessels; {phloem:stem/phloem} moves sucrose by pressure flow through living sieve tubes, {sieve plates:stem/plate} and companion cells. The {tracer:phloem/flow} shows the direction: a labelled parcel released at the leaf runs toward the root at roughly a metre an hour.',
            },
          },
        },
        {
          id: '8.1.practical',
          kind: 'practical',
          title: { en: 'The Line' },
          practical: {
            door: 'stem',
            level: { explorer: 'night-shift', scientist: 'cut-the-ring', analyst: 'time-the-sugar' },
            // A hit at the Line is evidence for what the pipes do (8.1.1), not
            // for identifying them in sections of roots, stems AND leaves
            // (8.1.2): the stem stage shows a stem. Until a page asks for the
            // identification and commits an answer, the ledger says "not here".
            stamps: ['0610:8.1.1'],
            line: { en: 'Route the sugar: send it, stop it, or time it.' },
          },
        },
        {
          id: '8.1.check',
          kind: 'check',
          title: { en: 'Inside a vessel' },
          check: {
            analyst: {
              kind: 'write',
              stamps: ['0610:8.1.3'],
              question: { en: 'Relate the structure of a xylem vessel to its function.' },
              marks: 3,
              model: {
                en: 'The walls are thickened with lignin, which makes them strong (support) and waterproof; the cells are dead with no cell contents, so water flows freely; the cells are joined end to end with no cross walls, forming one long continuous tube.',
              },
              points: [{ en: 'thick walls with lignin → strength / waterproof' }, { en: 'no cell contents → nothing in the way of the water' }, { en: 'no cross walls, joined end to end → a continuous tube' }],
            },
          },
        },
      ],
    },
    {
      id: '0610:8.2',
      code: '8.2',
      title: { en: 'Water uptake' },
      stage: 'plant',
      statements: ['0610:8.2.1', '0610:8.2.2', '0610:8.2.3', '0610:8.2.4'],
      pages: [
        {
          id: '8.2.story',
          kind: 'story',
          title: { en: 'Where the water starts' },
          figure: 'plant/roots',
          text: {
            explorer: {
              en: 'Water starts in the soil. The {roots:plant/roots} are covered in tiny hairs, and each hair drinks. The water crosses the root, climbs the {xylem:xylem/flow} up the stem, and reaches the cells of the {leaf:plant/canopy}. Let the pot run {dry:water/dry} and the whole line stops at the first step.',
            },
            scientist: {
              en: 'Root hair cells take up {water:water/pour} and mineral ions from the soil; their large surface area is what makes the {roots:plant/roots} good at it. The pathway: root hair cells → root cortex cells → {xylem:xylem/flow} → mesophyll cells of the {leaf:plant/canopy}. A stain in the water shows the route — it turns up in the xylem, never the phloem.',
            },
            analyst: {
              en: 'Root hairs multiply the absorbing surface of the {roots:plant/roots}; water enters by osmosis, ions partly by active transport. From root hair cell to cortex to {xylem:xylem/flow}, then up to the {mesophyll:plant/canopy}. The stain investigation is the evidence for the route: a cut stem stood in dyed water colours only the xylem. {Dry:water/dry} the pot and turgor falls first at the leaf, last at the root.',
            },
          },
        },
        {
          id: '8.2.rule',
          kind: 'rule',
          title: { en: 'A root in section' },
          text: {
            explorer: {
              en: 'The {soil:figure/soil} holds water between its grains. {Root hairs:figure/rootHair} reach into it and drink — thousands of them, so the root has a huge surface. The water crosses the {cortex:figure/cortex} cell by cell and reaches the {xylem:figure/rootXylem} in the middle of the root. From there it is on the line up to the leaves.',
            },
            scientist: {
              en: 'Water and mineral ions in the {soil:figure/soil} enter the {root hair cells:figure/rootHair}, whose length gives the root a very large surface area for uptake. The water then passes through the {root cortex cells:figure/cortex} to the {xylem:figure/rootXylem}, which sits at the centre of a root — unlike a stem, where the vascular bundles form a ring. The pathway: root hair cells → root cortex cells → xylem → mesophyll cells.',
            },
            analyst: {
              en: 'Root hair cells ({root hairs:figure/rootHair}) are extensions of epidermal cells: a large surface area, a thin wall, and a water potential lower than the {soil:figure/soil} solution, so water enters by osmosis while mineral ions are taken up partly by active transport. Water crosses the {cortex:figure/cortex} and enters the central {xylem:figure/rootXylem}; a stain stood in the water later colours only the xylem, never the phloem between its arms — the evidence for the route.',
            },
          },
        },
        {
          id: '8.2.practical',
          kind: 'practical',
          title: { en: 'The Roots' },
          practical: {
            door: 'roots',
            level: {},
            stamps: [],
            line: { en: 'Nobody has discovered what is behind this door yet. The stain runs at the Line: tap water above.' },
          },
        },
        {
          id: '8.2.check',
          kind: 'check',
          title: { en: 'The pathway' },
          check: {
            explorer: {
              kind: 'pick',
              stamps: ['0610:8.2.1', '0610:8.2.2'],
              question: { en: 'What do root hairs do for the plant?' },
              options: [{ en: 'Take up water and mineral ions from the soil' }, { en: 'Make sugar from light' }, { en: 'Hold the leaves up' }],
              answer: 0,
              reveal: { en: 'Root hair cells are the plant\'s drinking surface — thousands of them, so the area is huge.' },
            },
            scientist: {
              kind: 'pick',
              stamps: ['0610:8.2.3'],
              question: { en: 'Which is the pathway water takes through a plant?' },
              options: [
                { en: 'root hair cells → root cortex cells → xylem → mesophyll cells' },
                { en: 'root hair cells → phloem → xylem → mesophyll cells' },
                { en: 'mesophyll cells → xylem → root cortex cells → root hair cells' },
              ],
              answer: 0,
              reveal: { en: 'In through the hairs, across the cortex, up the xylem, out into the leaf cells. The phloem is not on the route.' },
            },
            analyst: {
              kind: 'write',
              stamps: ['0610:8.2.1', '0610:8.2.2', '0610:8.2.3'],
              question: { en: 'Explain how root hair cells are adapted for their function, and outline the pathway water then takes to a leaf cell.' },
              marks: 3,
              model: {
                en: 'A root hair is a long, thin extension of the cell that greatly increases surface area for uptake of water (by osmosis) and mineral ions; water then passes through the root cortex cells into the xylem, up the stem and out of the xylem into the mesophyll cells of the leaf.',
              },
              points: [{ en: 'root hair = extension of the cell → large surface area for uptake' }, { en: 'water and mineral ions taken up (osmosis / active transport)' }, { en: 'root hair → cortex → xylem → mesophyll' }],
            },
          },
        },
      ],
    },
    {
      id: '0610:8.3',
      code: '8.3',
      title: { en: 'Transpiration' },
      stage: 'hatches',
      statements: ['0610:8.3.1', '0610:8.3.2', '0610:8.3.3', '0610:8.3.4', '0610:8.3.5', '0610:8.3.6', '0610:8.3.7'],
      pages: [
        {
          id: '8.3.story',
          kind: 'story',
          title: { en: 'Where the water goes' },
          figure: 'pore/open',
          text: {
            explorer: {
              en: 'A leaf breathes out water. Inside, water turns to vapour and slips out through the {stomata:pore/open} — that is {transpiration:pore/open}. On a {hot:temp/warm}, {dry:air/dry} day the leaf loses water faster. Lose too much and it {wilts:leaf/wilt}.',
            },
            scientist: {
              en: 'Transpiration is the loss of water vapour from leaves. Water {evaporates:air/dry} from the surfaces of the mesophyll cells into the {air spaces:pore/open}, then {diffuses:pore/open} out through the {stomata:pore/open} as vapour. {Warmer:temp/warm} air and wind speed it up; {humid:air/humid} air slows it. The pull of all that leaving water is what lifts the next water up the {xylem:xylem/flow}.',
            },
            analyst: {
              en: 'Transpiration: water vapour lost from the leaf. Evaporation from the mesophyll surfaces into the {air spaces:pore/open} — a large internal surface — then diffusion out through the {stomata:pore/open}, whose number and aperture set the rate. {Temperature:temp/warm} raises evaporation and diffusion; wind strips the humid boundary layer ({dry:air/dry} air does the same); {humidity:air/humid} lowers the gradient. The water column is drawn up the {xylem:xylem/flow} by transpiration pull, held together by cohesion. When loss outruns uptake, turgor falls and the leaf {wilts:leaf/wilt}.',
            },
          },
        },
        {
          id: '8.3.rule',
          kind: 'rule',
          title: { en: 'The trade at the hatch' },
          figure: 'pore/open',
          text: {
            explorer: {
              en: 'Open the {hatches:pore/open} and carbon dioxide comes in — and water goes out. Close them ({shut:pore/close}) and the leaf keeps its water but starves. Every leaf makes this trade all day.',
            },
            scientist: {
              en: 'The stomata are the leaf\'s only doors: {open:pore/open}, CO₂ diffuses in for photosynthesis and water vapour diffuses out; {closed:pore/close}, both stop. Temperature and wind raise the rate of loss — the syllabus investigation, run here as a day on the hatches.',
            },
            analyst: {
              en: '{Open:pore/open}: CO₂ in, vapour out, both by diffusion down their gradients. {Closed:pore/close}: Cᵢ collapses and photosynthesis with it. A {cactus:specimen/cactus} inverts the day — CAM opens at {night:night/on}, when the vapour gradient is small — and pays for it in growth rate.',
            },
          },
        },
        {
          id: '8.3.practical',
          kind: 'practical',
          title: { en: 'The Hatches' },
          practical: {
            door: 'hatches',
            level: { explorer: 'open-the-hatches', scientist: 'harmattan', analyst: 'desert-night' },
            stamps: ['0610:8.3.1', '0610:8.3.2', '0610:8.3.3'],
            line: { en: 'Run a day on the hatches; keep the leaf firm and the sugar coming.' },
          },
        },
        {
          id: '8.3.check',
          kind: 'check',
          title: { en: 'What pulls the water up' },
          check: {
            analyst: {
              kind: 'write',
              stamps: ['0610:8.3.4', '0610:8.3.5'],
              question: { en: 'Explain how water moves upward through the xylem, and how the leaf\'s internal structure affects the rate of water loss.' },
              marks: 4,
              model: {
                en: 'Water evaporating from the mesophyll into the air spaces and diffusing out of the stomata creates a transpiration pull; because water molecules are held together by forces of attraction (cohesion), a continuous column is drawn up the xylem. The interconnecting air spaces give a large internal surface for evaporation, and the size and number of stomata set how fast vapour can leave.',
              },
              points: [{ en: 'evaporation / diffusion out of stomata creates a pull' }, { en: 'cohesion between water molecules → continuous column drawn up' }, { en: 'large internal surface area of air spaces → more evaporation' }, { en: 'size and number of stomata set the rate' }],
            },
          },
        },
      ],
    },
    {
      id: '0610:8.4',
      code: '8.4',
      title: { en: 'Translocation' },
      stage: 'stem',
      statements: ['0610:8.4.1', '0610:8.4.2', '0610:8.4.3'],
      pages: [
        {
          id: '8.4.story',
          kind: 'story',
          title: { en: 'Sources and sinks' },
          figure: 'stem/section',
          text: {
            explorer: {
              en: 'A {leaf:plant/canopy} in daylight is a {source:light/up}: it makes more sugar than it uses. A {root:plant/roots} or a growing tip is a {sink:phloem/flow}. The {phloem:stem/phloem} carries the sugar from source to sink. At {night:night/on} the leaf\'s {starch bank:starch/bank} becomes the source.',
            },
            scientist: {
              en: 'Translocation is the movement of sucrose and amino acids in the {phloem:stem/phloem}, from regions of production — {sources:light/up} — to regions of storage or use — {sinks:phloem/flow}. A source releases sucrose; a sink uses or stores it. A {leaf:plant/canopy} in the light is a source, a {root:plant/roots} a sink; at {night:night/on} the leaf\'s {starch:starch/bank} is broken down and the leaf is still the source.',
            },
            analyst: {
              en: 'Sucrose and amino acids move in the {phloem:stem/phloem} from {source:light/up} to {sink:phloem/flow} by pressure flow: loading at the source raises the sap\'s solute concentration, water follows by osmosis, and the pressure pushes the sap toward the sink where it is unloaded. The {tracer:phloem/flow} times it. A potato tuber is a sink in summer, storing starch, and a source in spring, feeding the new shoot; at {night:night/on} the leaf feeds the line from its {starch:starch/bank}.',
            },
          },
        },
        {
          id: '8.4.practical',
          kind: 'practical',
          title: { en: 'The Line · night shift' },
          practical: {
            door: 'stem',
            level: { explorer: 'night-shift', scientist: 'cut-the-ring', analyst: 'time-the-sugar' },
            stamps: ['0610:8.4.1', '0610:8.4.2'],
            line: { en: 'Send the night\'s sugar from the bank to the roots.' },
          },
        },
        {
          id: '8.4.check',
          kind: 'check',
          title: { en: 'Both at once' },
          check: {
            explorer: {
              kind: 'pick',
              stamps: ['0610:8.4.3'],
              question: { en: 'In summer a potato tuber stores starch. What is it then?' },
              options: [{ en: 'A sink' }, { en: 'A source' }, { en: 'A leaf' }],
              answer: 0,
              reveal: { en: 'Storing makes it a sink. In spring, when it feeds the new shoot, the same tuber is a source.' },
            },
            scientist: {
              kind: 'pick',
              stamps: ['0610:8.4.3'],
              question: { en: 'Which part of a plant can be a source at one time and a sink at another?' },
              options: [{ en: 'A potato tuber — sink in summer, source in spring' }, { en: 'A root hair — always a source' }, { en: 'A guard cell — always a sink' }],
              answer: 0,
              reveal: { en: 'A storage organ fills (sink) and later empties (source). The leaf too: source by day, and at night its starch feeds the line.' },
            },
            analyst: {
              kind: 'write',
              stamps: ['0610:8.4.3'],
              question: { en: 'Explain why a potato tuber can act as both a source and a sink at different times of the year.' },
              marks: 4,
              model: {
                en: 'In summer the leaves photosynthesise and export sucrose; the tuber receives it and stores it as starch, so it is a sink. In spring, before the new shoot has leaves, the tuber breaks its starch down to sucrose and exports it to the growing shoot, so it is then a source.',
              },
              points: [{ en: 'summer: receives sucrose from leaves' }, { en: 'stores it as starch → sink' }, { en: 'spring: starch → sucrose, exported to the new shoot' }, { en: 'so it is a source then' }],
            },
          },
        },
      ],
    },
  ],
}
