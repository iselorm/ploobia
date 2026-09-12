/**
 * Cambridge IGCSE Biology 0610 · Chapter 6 · Plant nutrition
 *
 * The book opens where the campaign opens: on the Factory. Two sections,
 * both read from the Sugar Line. Every braced term names a verb in
 * `lib/sugarverbs.ts` (or a layer of the page's own figure, `figure/*`);
 * the model suite refuses a term that names anything else.
 *
 * Voice: the Explorer layer answers "what happens if I…?", the Scientist
 * layer says the syllabus's own words, the Analyst layer carries the
 * Supplement. The sample text is a draft for reaction (storyboard 11 Sep).
 */

import type { Chapter } from '@/lib/page'

export const CH06: Chapter = {
  id: '0610:6',
  code: '6',
  title: { en: 'Plant nutrition' },
  sections: [
    {
      id: '0610:6.1',
      code: '6.1',
      title: { en: 'Photosynthesis' },
      stage: 'plant',
      statements: ['0610:6.1.1', '0610:6.1.2', '0610:6.1.3', '0610:6.1.4', '0610:6.1.5', '0610:6.1.6', '0610:6.1.7', '0610:6.1.8', '0610:6.1.9', '0610:6.1.10', '0610:6.1.11'],
      pages: [
        {
          id: '6.1.story',
          kind: 'story',
          title: { en: 'The factory in the leaf' },
          figure: 'plant/canopy',
          text: {
            explorer: {
              en: 'A {leaf:plant/canopy} is a factory. It takes in {carbon dioxide:co2/up} from the air and {water:water/pour} from the {roots:plant/roots}, and with the energy in {light:light/up} it builds {sugar:leaf/inside}. The green stuff that catches the light is {chlorophyll:leaf/inside}, packed inside tiny {chloroplasts:leaf/inside}. What the leaf cannot use today it banks as {starch:starch/bank}.',
            },
            scientist: {
              en: 'Photosynthesis is how a plant makes its own food: it synthesises carbohydrates from {carbon dioxide:co2/up} and {water:water/pour}, using energy from {light:light/up}. The energy is caught by {chlorophyll:leaf/inside|the green pigment}, which sits inside the {chloroplasts:leaf/inside} of the {leaf:plant/canopy}. Word equation: carbon dioxide + water → glucose + oxygen, in the presence of light and chlorophyll. Sugar the leaf does not use at once is stored as {starch:starch/bank}, or sent down the phloem as sucrose.',
            },
            analyst: {
              en: 'Photosynthesis synthesises carbohydrates from {carbon dioxide:co2/up} and {water:water/pour} using energy transferred from {light:light/up} by {chlorophyll:leaf/inside}, the green pigment in the {chloroplasts:leaf/inside}. Chlorophyll transfers light energy into chemical energy — the {Calvin cycle:leaf/cycle} spends it building triose sugars. The carbohydrate is stored as {starch:starch/bank}, built into cellulose, respired, or loaded into the phloem as sucrose; nitrate ions go to amino acids, magnesium ions to chlorophyll itself.',
            },
          },
          ext: {
            en: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂. Whichever of {light:light/down}, {carbon dioxide:co2/down} or {temperature:temp/cool} is in shortest supply sets the rate — the {limiting factor:light/up}. Raise the one that is not limiting and the export gauge barely moves.',
          },
        },
        {
          id: '6.1.rule',
          kind: 'rule',
          title: { en: 'Light in, sugar out' },
          figure: 'leaf/inside',
          text: {
            explorer: {
              en: 'Turn the {light:light/up} up and the factory makes more. Turn it {down:light/down} and it makes less. Give it more {carbon dioxide:co2/up} and, if the light is already high, it makes more again — until something else runs short. Make it {cold:temp/cool} and everything slows.',
            },
            scientist: {
              en: 'Rate depends on three things: {light intensity:light/up}, {carbon dioxide concentration:co2/up} and {temperature:temp/warm}. Change one while the others stay fixed and the export gauge answers. The plant does the same test every day of its life — and at {night:night/on} it lives off its {starch:starch/bank}.',
            },
            analyst: {
              en: 'Three variables, one rate. Hold two and vary the third: the curve rises, then flattens where another factor becomes limiting. Raise {light:light/up} to full sun and the {carbon dioxide:co2/up} dial becomes the ceiling; {cool:temp/cool} the leaf and the enzymes of the {Calvin cycle:leaf/cycle} set it instead. At {night:night/on} the {starch:starch/bank} bank is the source.',
            },
          },
        },
        {
          id: '6.1.practical',
          kind: 'practical',
          title: { en: 'The Factory' },
          practical: {
            door: 'plant',
            level: { explorer: 'first-light', scientist: 'land-it', analyst: 'balance-books' },
            stamps: ['0610:6.1.1', '0610:6.1.2', '0610:6.1.4', '0610:6.1.8'],
            line: { en: 'Catch the light, then land the export the order asks for.' },
          },
        },
        {
          id: '6.1.check',
          kind: 'check',
          title: { en: 'What the door could not show' },
          check: {
            explorer: {
              kind: 'pick',
              stamps: ['0610:6.1.6'],
              question: { en: 'Which mineral ion does a plant need to make its green chlorophyll?' },
              options: [{ en: 'Magnesium' }, { en: 'Nitrate' }, { en: 'Iron' }],
              answer: 0,
              reveal: { en: 'Magnesium sits at the heart of every chlorophyll molecule. Nitrate goes to amino acids instead.' },
            },
            scientist: {
              kind: 'pick',
              stamps: ['0610:6.1.5'],
              question: { en: 'Which of these is NOT something the plant does with the carbohydrate it makes?' },
              options: [{ en: 'Builds cellulose for cell walls' }, { en: 'Sends it to the roots as sucrose' }, { en: 'Turns it into chlorophyll' }],
              answer: 2,
              reveal: { en: 'Chlorophyll is made with magnesium, not sugar. The carbohydrate becomes starch, cellulose, sucrose, nectar — or is respired.' },
            },
            analyst: {
              kind: 'write',
              stamps: ['0610:6.1.3', '0610:6.1.6'],
              question: { en: 'Explain why a plant short of magnesium makes less sugar.' },
              marks: 3,
              model: {
                en: 'Magnesium ions are needed to make chlorophyll; with less chlorophyll in the chloroplasts, less light energy is transferred into chemical energy, so less carbohydrate is synthesised.',
              },
              points: [{ en: 'magnesium is needed to make chlorophyll' }, { en: 'less chlorophyll → less light energy captured / transferred' }, { en: 'so less carbohydrate (glucose) is made' }],
            },
          },
        },
      ],
    },
    {
      id: '0610:6.2',
      code: '6.2',
      title: { en: 'Leaf structure' },
      stage: 'hatches',
      statements: ['0610:6.2.1', '0610:6.2.2', '0610:6.2.3'],
      pages: [
        {
          id: '6.2.story',
          kind: 'story',
          title: { en: 'Thin, wide, and full of holes' },
          figure: 'plant/backlit',
          text: {
            explorer: {
              en: 'A leaf is {thin:plant/backlit} so the light gets in, and {wide:plant/canopy} so it catches a lot of it. Underneath are thousands of tiny doors — the {stomata:pore/open} — each held by two {guard cells:pore/skin}. Open, and air comes in. Open, and water gets out.',
            },
            scientist: {
              en: 'Most leaves are {thin:plant/backlit} with a {large surface area:plant/canopy}: light reaches every cell and gases have a short way to diffuse. The {stomata:pore/open} in the lower epidermis are opened and closed by pairs of {guard cells:pore/skin}; inside, {air spaces:pore/open} carry gas to and from every cell.',
            },
            analyst: {
              en: 'Thin lamina, large area: a short diffusion path and a large cross-section for light. The {stomata:pore/open}, each set by two {guard cells:pore/skin}, are the only route in for CO₂ and out for water vapour; the internal {air spaces:pore/open} between spongy mesophyll cells give the leaf an internal surface many times its outside. Hold the leaf against the light — {backlit:plant/backlit} — and the lamina glows through.',
            },
          },
        },
        {
          id: '6.2.rule',
          kind: 'rule',
          title: { en: 'A leaf in section' },
          text: {
            explorer: {
              en: 'Top: a waxy {cuticle:figure/cuticle} and the {upper skin:figure/upperEpidermis|upper epidermis}. Then tall {palisade cells:figure/palisade}, packed with chloroplasts. Then loose {spongy cells:figure/spongy} with {air spaces:figure/airSpaces} between them. Underneath, the {lower skin:figure/lowerEpidermis|lower epidermis} with its {stomata:figure/stoma}. A {vein:figure/vascular|vascular bundle} runs through the middle.',
            },
            scientist: {
              en: 'Under the waxy {cuticle:figure/cuticle} and the {upper epidermis:figure/upperEpidermis} sit the {palisade mesophyll:figure/palisade} cells, tall and packed with chloroplasts. Below them the {spongy mesophyll:figure/spongy} is loose, with {air spaces:figure/airSpaces} that carry gas to and from the {stomata:figure/stoma} in the {lower epidermis:figure/lowerEpidermis}. A {vascular bundle:figure/vascular} — xylem and phloem — runs through the middle.',
            },
            analyst: {
              en: 'The {cuticle:figure/cuticle} is waterproof; the {upper epidermis:figure/upperEpidermis} is transparent, so light reaches the {palisade mesophyll:figure/palisade} — the cells with most chloroplasts, stacked where the light is strongest. The {spongy mesophyll:figure/spongy} and its {air spaces:figure/airSpaces} give a large internal surface for gas exchange; the {stomata:figure/stoma} in the {lower epidermis:figure/lowerEpidermis} set the trade. The {vascular bundle:figure/vascular} brings water by xylem and takes sucrose away by phloem.',
            },
          },
        },
        {
          id: '6.2.practical',
          kind: 'practical',
          title: { en: 'The Hatches' },
          practical: {
            door: 'hatches',
            level: { explorer: 'open-the-hatches', scientist: 'harmattan', analyst: 'desert-night' },
            stamps: ['0610:6.2.2'],
            line: { en: 'Open the hatches enough to feed the leaf, not so far that it wilts.' },
          },
        },
        {
          id: '6.2.check',
          kind: 'check',
          title: { en: 'The parts the door cannot draw' },
          check: {
            explorer: {
              kind: 'pick',
              stamps: ['0610:6.2.1'],
              question: { en: 'Why are most leaves thin and wide?' },
              options: [{ en: 'So light reaches every cell and gases have a short way to go' }, { en: 'So the plant can grow more of them' }, { en: 'So they lose water faster' }],
              answer: 0,
              reveal: { en: 'Wide catches more light; thin means the light reaches every cell and carbon dioxide has a short way to diffuse.' },
            },
            scientist: {
              kind: 'pick',
              stamps: ['0610:6.2.3'],
              question: { en: 'Which feature lets carbon dioxide reach every photosynthesising cell inside the leaf?' },
              options: [{ en: 'The waxy cuticle' }, { en: 'The air spaces between the spongy mesophyll cells' }, { en: 'The vascular bundle' }],
              answer: 1,
              reveal: { en: 'Gas diffuses through the interconnecting air spaces to the palisade cells; the cuticle keeps water in, the bundle carries water and sugar.' },
            },
            analyst: {
              kind: 'write',
              stamps: ['0610:6.2.3'],
              question: { en: 'Explain how the palisade mesophyll layer is adapted for photosynthesis.' },
              marks: 3,
              model: {
                en: 'The palisade cells are near the upper surface where light is strongest; they are tall and packed closely, so many chloroplasts fit in the light; each cell has many chloroplasts to absorb light.',
              },
              points: [{ en: 'near the upper surface / under the transparent epidermis, where light is strongest' }, { en: 'cells tall and closely packed → many cells in the light' }, { en: 'many chloroplasts per cell to absorb light' }],
            },
          },
        },
      ],
    },
  ],
}
