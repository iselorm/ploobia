/**
 * First Physics — the engine.
 *
 * One room, one shelf, and a run of very small episodes: one object, one
 * dial, one question each. This file is everything that is not rendering —
 * the episode data (copy per vocabulary band, prerequisites, prediction
 * tiles, the sentence tiles that close an episode), the mutable sim that
 * the canvas steps every frame, the pure physics each object obeys, and the
 * HUD Equation Card specs that an episode may land on.
 *
 * Design rules, from the cabinet spec (28 Aug 2026):
 *  - An equation is an *event*, not a label. `openCard` refuses to open a
 *    card whose right-hand side has not been measured in this episode.
 *  - The `simple` copy of an episode may only use words introduced by the
 *    episodes before it. `FORBIDDEN_BEFORE` is checked by the verify suite.
 *  - Numbers in the world are honest at every band: real g, real sliding
 *    friction. Explorer just sees fewer of them.
 */

import type { BandCaps } from './bands'
import type { LearningEvent, SkillId } from './events'
import { isType } from './events'
import { WORLD_BY_ID, type WorldId } from './motion'

export type Vocab = BandCaps['vocab']
export type EpisodeId = 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'a7'
export const EPISODE_IDS: EpisodeId[] = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']

/**
 * The beats every episode runs, in order; `done` is the shelf state.
 * `meet` is the orientation: the room shows the object doing its thing by
 * itself while the coach says what you are looking at — before any question.
 */
export type Beat = 'arrive' | 'meet' | 'predict' | 'play' | 'notice' | 'land' | 'done'

/** A scene demonstration the page can run during Meet, driven through the same sim functions the controls use. */
export type DemoAction = 'a1-slide' | 'a2-race' | 'a3-run' | 'a4-push' | 'a5-lean' | 'a6-cycle' | 'a7-hang' | 'none'

export interface MeetStep {
  say: Copy
  /** What the room does by itself while this step is up. */
  do: DemoAction
  /** Scene object to pulse while this step is up. */
  pulse?: string
}

export type Copy = Record<Vocab, string>

export interface PredictOption {
  id: string
  label: Copy
}

export interface Episode {
  id: EpisodeId
  /** Shelf label and eyebrow. */
  title: Copy
  /** ≤ 11 characters: the label under the shelf emblem. */
  short: string
  /** The one question, ≤ 12 words. */
  question: Copy
  /** What the learner does with the one dial. */
  instruction: Copy
  /** Orientation steps, shown one at a time before the prediction. ≤ 4. */
  meet: MeetStep[]
  /** Episodes this one builds on (the engine greys the shelf when missing). */
  requires: EpisodeId[]
  skill: SkillId
  /** Curriculum tags for the mapping layer. */
  maps: string[]
  predict: { prompt: Copy; options: PredictOption[]; correct: string }
  /** The Notice beat's question. */
  notice: Copy
  /** Sentence tiles for a no-equation landing: [right, swapped, wrong]. */
  sayItBack: Record<Vocab, [string, string, string]> | null
  /** The card that lands this episode, if any. */
  equation: CardId | null
  /** The one measured quantity, when the episode has one. */
  variable: string | null
}

/* ------------------------------------------------------------------ */
/* Equation cards                                                     */
/* ------------------------------------------------------------------ */

export type CardId = 'speed' | 'resultant' | 'weight'

export interface CardSymbol {
  key: string
  word: Copy
  symbol: string
  unit: string
  color: string
  /** Scene object the arrow points at. */
  objectId: string
  /** Three-word arrow label. */
  label: Copy
  /** How to print the value. */
  digits: number
}

export interface EquationCardSpec {
  id: CardId
  title: Copy
  lhs: CardSymbol
  rhs: CardSymbol[]
  op: '÷' | '×' | '−' | '+'
  compute: (v: Record<string, number>) => number
  /** [right, swapped, wrong-operation] per vocabulary. */
  sentences: Record<Vocab, [string, string, string]>
  /** Analyst's rearranged form, if any. */
  rearranged?: string
}

export const SYMBOL_COLORS = {
  lhs: '#F2F6FA',
  a: '#F2A25C',
  b: '#7CC283',
  c: '#8FB8E8',
} as const

export const CARDS: Record<CardId, EquationCardSpec> = {
  speed: {
    id: 'speed',
    title: { simple: 'Speed needs two numbers', formal: 'Speed needs two numbers', technical: 'Average speed' },
    lhs: { key: 'v', word: { simple: 'speed', formal: 'speed', technical: 'v' }, symbol: 'v', unit: 'm/s', color: SYMBOL_COLORS.lhs, objectId: 'runner', label: { simple: 'the blue one', formal: 'the runner', technical: 'the runner' }, digits: 2 },
    rhs: [
      { key: 's', word: { simple: 'distance', formal: 'distance', technical: 's' }, symbol: 's', unit: 'm', color: SYMBOL_COLORS.a, objectId: 'ruler', label: { simple: 'how far it went', formal: 'the lane length', technical: 'distance run' }, digits: 1 },
      { key: 't', word: { simple: 'time', formal: 'time', technical: 't' }, symbol: 't', unit: 's', color: SYMBOL_COLORS.b, objectId: 'stopwatch', label: { simple: 'your stopwatch', formal: 'your stopwatch', technical: 'measured time' }, digits: 2 },
    ],
    op: '÷',
    compute: (v) => v.s / v.t,
    sentences: {
      simple: ['Speed is how far it went, shared out over the time it took.', 'Speed is the time it took, shared out over how far it went.', 'Speed is how far it went added to the time it took.'],
      formal: ['Speed is distance divided by time.', 'Speed is time divided by distance.', 'Speed is distance multiplied by time.'],
      technical: ['Average speed is the distance travelled divided by the time taken.', 'Average speed is the time taken divided by the distance travelled.', 'Average speed is distance multiplied by time.'],
    },
    rearranged: 't = s ÷ v',
  },
  resultant: {
    id: 'resultant',
    title: { simple: 'The push that is left over', formal: 'The resultant force', technical: 'Resultant of opposing forces' },
    lhs: { key: 'r', word: { simple: 'left over', formal: 'resultant', technical: 'F' }, symbol: 'F', unit: 'N', color: SYMBOL_COLORS.lhs, objectId: 'knot', label: { simple: 'the knot', formal: 'the knot', technical: 'the knot' }, digits: 0 },
    rhs: [
      { key: 'f1', word: { simple: 'bigger side', formal: 'bigger force', technical: 'F₁' }, symbol: 'F₁', unit: 'N', color: SYMBOL_COLORS.a, objectId: 'teamBig', label: { simple: 'the bigger team', formal: 'the bigger team', technical: 'larger force' }, digits: 0 },
      { key: 'f2', word: { simple: 'smaller side', formal: 'smaller force', technical: 'F₂' }, symbol: 'F₂', unit: 'N', color: SYMBOL_COLORS.b, objectId: 'teamSmall', label: { simple: 'the smaller team', formal: 'the smaller team', technical: 'smaller force' }, digits: 0 },
    ],
    op: '−',
    compute: (v) => v.f1 - v.f2,
    sentences: {
      simple: ['The push left over is the bigger side take away the smaller side.', 'The push left over is the smaller side take away the bigger side.', 'The push left over is the bigger side added to the smaller side.'],
      formal: ['The resultant force is the bigger force minus the smaller force.', 'The resultant force is the smaller force minus the bigger force.', 'The resultant force is the two forces added together.'],
      technical: ['For opposing forces the resultant is F₁ − F₂, in the direction of the larger force.', 'For opposing forces the resultant is F₂ − F₁, in the direction of the smaller force.', 'For opposing forces the resultant is F₁ + F₂.'],
    },
  },
  weight: {
    id: 'weight',
    title: { simple: 'How hard the world pulls', formal: 'Weight', technical: 'Weight and field strength' },
    lhs: { key: 'w', word: { simple: 'weight', formal: 'weight', technical: 'W' }, symbol: 'W', unit: 'N', color: SYMBOL_COLORS.lhs, objectId: 'ball', label: { simple: 'the steel ball', formal: 'the steel ball', technical: 'the steel ball' }, digits: 2 },
    rhs: [
      { key: 'm', word: { simple: 'how much stuff', formal: 'mass', technical: 'm' }, symbol: 'm', unit: 'kg', color: SYMBOL_COLORS.a, objectId: 'ball', label: { simple: 'the ball itself', formal: 'its mass', technical: 'mass' }, digits: 2 },
      { key: 'g', word: { simple: 'the pull', formal: 'field strength', technical: 'g' }, symbol: 'g', unit: 'N/kg', color: SYMBOL_COLORS.b, objectId: 'dial', label: { simple: 'the gravity dial', formal: 'the gravity dial', technical: 'g for this world' }, digits: 2 },
    ],
    op: '×',
    compute: (v) => v.m * v.g,
    sentences: {
      simple: ['Weight is how much stuff there is, times how hard the world pulls on each bit.', 'Weight is how hard the world pulls, shared out over how much stuff there is.', 'Weight is how much stuff there is, and the pull makes no difference.'],
      formal: ['Weight is mass multiplied by gravitational field strength.', 'Weight is gravitational field strength divided by mass.', 'Weight is mass, whatever world you are on.'],
      technical: ['W = mg: weight is proportional to mass, with g the field strength in N/kg.', 'W = g/m: weight falls as mass rises.', 'W = m: weight and mass are the same quantity.'],
    },
    rearranged: 'g = W ÷ m',
  },
}

/* ------------------------------------------------------------------ */
/* Episodes                                                           */
/* ------------------------------------------------------------------ */

export const EPISODES: Record<EpisodeId, Episode> = {
  a1: {
    id: 'a1',
    short: 'Where?',
    title: { simple: 'Where is it?', formal: 'Where is it?', technical: 'Position and distance' },
    question: { simple: 'How far did it go?', formal: 'How far is it from the start?', technical: 'What is distance measured from?' },
    instruction: { simple: 'Drag the Ploob along the line.', formal: 'Drag the Ploob along the line. Watch the ruler.', technical: 'Drag the Ploob. The ruler reads from the post.' },
    meet: [
      { say: { simple: 'This is a Ploob. It is standing at the start post, on a line drawn on the grass.', formal: 'A Ploob at a start post, on a straight line marked on the grass.', technical: 'A Ploob at a reference post, on a straight track.' }, do: 'none', pulse: 'runner' },
      { say: { simple: 'You can drag it along the line. When it moves, a ruler unrolls from the post, and the orange number is how far it is from the post — in metres.', formal: 'Drag it along the line and a ruler unrolls from the post. The orange number is its distance from the post, in metres.', technical: 'Drag it and a ruler unrolls from the post. The reading is the distance from that reference point, in metres.' }, do: 'a1-slide', pulse: 'ruler' },
      { say: { simple: 'See the red flag? It stands at 2.5 metres. Your turn — but guess first.', formal: 'The red flag stands at 2.5 m along the line. Before you drag, make a prediction.', technical: 'The flag marks 2.5 m. Commit a prediction before you move it.' }, do: 'none' },
    ],
    requires: [],
    skill: 'measuring',
    maps: ['0625 1.1'],
    predict: {
      prompt: { simple: 'Drag it past the flag. What does the number do?', formal: 'Past the flag, what happens to the ruler reading?', technical: 'Beyond the flag, how does the reading change?' },
      options: [
        { id: 'bigger', label: { simple: 'Gets bigger', formal: 'Increases', technical: 'Increases' } },
        { id: 'smaller', label: { simple: 'Gets smaller', formal: 'Decreases', technical: 'Decreases' } },
        { id: 'same', label: { simple: 'Stays the same', formal: 'Stays the same', technical: 'Unchanged' } },
      ],
      correct: 'bigger',
    },
    notice: { simple: 'Where is the number measured from?', formal: 'Where does the ruler start counting from?', technical: 'What is the reference point for the reading?' },
    sayItBack: {
      simple: ['Distance is how far it is from the start.', 'Distance is how far it is from the end.', 'Distance is how big the Ploob is.'],
      formal: ['Distance is measured from a start point, in metres.', 'Distance is measured from wherever the Ploob is now.', 'Distance is how long the Ploob took.'],
      technical: ['Distance is measured from a chosen reference point, here the post.', 'Distance is measured from the moving object itself.', 'Distance is a time interval.'],
    },
    equation: null,
    variable: null,
  },
  a2: {
    id: 'a2',
    short: 'How fast?',
    title: { simple: 'How fast?', formal: 'How fast?', technical: 'Speed' },
    question: { simple: 'Which one is faster, and how do you know?', formal: 'Which is faster — and what proves it?', technical: 'What two measurements define speed?' },
    instruction: { simple: 'START begins the race and your stopwatch together. Tap STOP when Blue reaches the finish.', formal: 'START begins the race and the stopwatch together; STOP when Blue crosses the finish.', technical: 'START launches the race and the stopwatch; STOP at Blue\'s finish.' },
    meet: [
      { say: { simple: 'Two Ploobs, two lanes — one each so they do not bump. Same start line, same finish line, 4 metres apart.', formal: 'Two runners in two lanes, one each so they cannot collide. Same start, same finish, 4.0 m apart.', technical: 'Two runners, separate lanes, identical 4.0 m course.' }, do: 'none', pulse: 'ruler' },
      { say: { simple: 'Blue is a quick runner. Gold is not in a hurry. Watch them race once.', formal: 'Blue runs quickly; gold takes its time. Watch one race.', technical: 'Each runner holds a steady speed of its own. Watch one race.' }, do: 'a2-race', pulse: 'runner' },
      { say: { simple: 'To say how fast something is, you need two numbers: how far it went, and how long that took. The ruler gives you the first. A stopwatch will give you the second.', formal: 'Speed needs two measurements: the distance covered and the time it took. The ruler gives the distance; you will take the time yourself.', technical: 'Speed is defined by two measurements — distance and time. The course gives the distance; you measure the time.' }, do: 'none' },
    ],
    requires: ['a1'],
    skill: 'measuring',
    maps: ['0893 8Pf.01', '0625 1.2'],
    predict: {
      prompt: { simple: 'Which Ploob will get to the end first?', formal: 'Which runner reaches the end first?', technical: 'Which runner has the higher speed?' },
      options: [
        { id: 'blue', label: { simple: 'Blue', formal: 'Blue', technical: 'Blue' } },
        { id: 'gold', label: { simple: 'Gold', formal: 'Gold', technical: 'Gold' } },
        { id: 'same', label: { simple: 'Same time', formal: 'Same time', technical: 'Equal' } },
      ],
      correct: 'blue',
    },
    notice: { simple: 'You have how far, and how long. Which one is the speed?', formal: 'You have a distance and a time. Where is the speed?', technical: 'Distance and time are measured. How is speed obtained?' },
    sayItBack: null,
    equation: 'speed',
    variable: 'speed',
  },
  a3: {
    id: 'a3',
    short: 'The line',
    title: { simple: 'The line it leaves behind', formal: 'The line it leaves behind', technical: 'Distance–time graphs' },
    question: { simple: 'What does steep mean? What does flat mean?', formal: 'What do steep and flat mean on the line?', technical: 'What does the gradient of the line represent?' },
    instruction: { simple: 'Turn the speed dial. Tap the Ploob to stop it.', formal: 'Set a speed, run, and tap the runner to stop it.', technical: 'Set a speed and run; tap the runner to halt it mid-run.' },
    meet: [
      { say: { simple: 'One Ploob, one long lane, and a board beside it. Time runs across the board; distance runs up it.', formal: 'One runner, a 6 m lane, and a board: time along the bottom, distance up the side.', technical: 'A 6 m track and a distance–time axis pair beside it.' }, do: 'none', pulse: 'board' },
      { say: { simple: 'When the Ploob runs, a pen draws its journey on the board as a line — see the thin thread tying the pen to the Ploob.', formal: 'As it runs, a pen draws the journey as a line; the thread ties the pen to the runner.', technical: 'The pen plots distance against time live; the guide line links pen and runner.' }, do: 'a3-run', pulse: 'runner' },
      { say: { simple: 'You get a speed dial, and you can tap the Ploob to stop it mid-run. Guess first.', formal: 'You control the speed, and a tap halts the runner mid-run. Predict first.', technical: 'You set the speed and may halt the runner. Predict the effect on the line.' }, do: 'none' },
    ],
    requires: ['a2'],
    skill: 'interpreting',
    maps: ['0893 8Pf.02', '0625 1.2'],
    predict: {
      prompt: { simple: 'Make it go faster. What does the line do?', formal: 'At a higher speed, what happens to the line?', technical: 'At a higher speed, how does the gradient change?' },
      options: [
        { id: 'steeper', label: { simple: 'Gets steeper', formal: 'Steeper', technical: 'Steeper' } },
        { id: 'flatter', label: { simple: 'Gets flatter', formal: 'Flatter', technical: 'Shallower' } },
        { id: 'same', label: { simple: 'Stays the same', formal: 'Unchanged', technical: 'Unchanged' } },
      ],
      correct: 'steeper',
    },
    notice: { simple: 'When you stopped it, what did the line do?', formal: 'While it was stopped, what did the line do?', technical: 'What does a horizontal section of the line mean?' },
    sayItBack: {
      simple: ['Steep means fast. Flat means stopped.', 'Steep means stopped. Flat means fast.', 'Steep means heavy. Flat means light.'],
      formal: ['A steeper line means a higher speed; a flat line means it has stopped.', 'A steeper line means a lower speed; a flat line means top speed.', 'A steeper line means more time; a flat line means less time.'],
      technical: ['The gradient of a distance–time graph is the speed; zero gradient is rest.', 'The gradient of a distance–time graph is the time; zero gradient is top speed.', 'The gradient of a distance–time graph is the distance.'],
    },
    equation: null,
    variable: 'graph-speed',
  },
  a4: {
    id: 'a4',
    short: 'A push',
    title: { simple: 'A push is a force', formal: 'A push is a force', technical: 'Force as a vector' },
    question: { simple: 'What does a longer arrow do?', formal: 'What does a longer arrow change?', technical: 'What two things does the arrow encode?' },
    instruction: { simple: 'Grab the arrow. Stretch it. Let go.', formal: 'Drag the arrow head out from the crate and release.', technical: 'Drag the arrow head to set the force, then release.' },
    meet: [
      { say: { simple: 'A crate, sitting on ice. It will not move by itself.', formal: 'A crate on ice. Nothing happens until something acts on it.', technical: 'A crate on a low-friction surface, at rest.' }, do: 'none', pulse: 'crate' },
      { say: { simple: 'To move it you push it or pull it. We draw every push or pull as an arrow on the thing it acts on. Watch one.', formal: 'A push or a pull moves it. Every push or pull is drawn as an arrow on the object it acts on. Watch one.', technical: 'A push or pull is drawn as an arrow on the object it acts on. Watch one.' }, do: 'a4-push', pulse: 'crate' },
      { say: { simple: 'A longer arrow means a harder push; the arrow points the way it pushes. You can grab the arrow head and stretch it yourself.', formal: 'Length is how hard; direction is which way. The spring balance reads the push in newtons (N). Grab the arrow head and stretch it.', technical: 'Length encodes magnitude (read in newtons on the balance); direction encodes direction. Drag the arrow head to set it.' }, do: 'none' },
    ],
    requires: ['a1'],
    skill: 'explaining',
    maps: ['0625 1.5'],
    predict: {
      prompt: { simple: 'Longer arrow. Does the crate go further, less far, or the same?', formal: 'With a longer arrow, how far does the crate slide?', technical: 'With a larger force, how does the slide distance change?' },
      options: [
        { id: 'further', label: { simple: 'Further', formal: 'Further', technical: 'Further' } },
        { id: 'less', label: { simple: 'Less far', formal: 'Less far', technical: 'Less far' } },
        { id: 'same', label: { simple: 'Same', formal: 'The same', technical: 'Unchanged' } },
      ],
      correct: 'further',
    },
    notice: { simple: 'What two things does the arrow tell you?', formal: 'What two things does the arrow show?', technical: 'Which two properties of the force does the arrow carry?' },
    sayItBack: {
      simple: ['A force is a push or a pull. The arrow shows how big, and which way.', 'A force is how fast it goes. The arrow shows how far.', 'A force is a push or a pull. The arrow shows how heavy it is.'],
      formal: ['A force is a push or a pull, measured in newtons; the arrow shows its size and direction.', 'A force is a speed, measured in newtons; the arrow shows its distance and time.', 'A force is a push or a pull; the arrow shows its mass and its colour.'],
      technical: ['Force is a vector: the arrow’s length is its magnitude in newtons and its direction is the direction of the push.', 'Force is a scalar: the arrow’s length is the distance the crate will travel.', 'Force is a vector whose length is the crate’s speed.'],
    },
    equation: null,
    variable: null,
  },
  a5: {
    id: 'a5',
    short: 'Two pushes',
    title: { simple: 'Two pushes', formal: 'Balanced and unbalanced', technical: 'Resultant force' },
    question: { simple: 'When the arrows are equal, what happens?', formal: 'What happens when the two pulls are equal?', technical: 'When is the resultant force zero?' },
    instruction: { simple: 'Tap a side to add a Ploob. Then tap Go.', formal: 'Add Ploobs to either team, then tap Go.', technical: 'Set the team sizes, then tap Go.' },
    meet: [
      { say: { simple: 'A rope with a red knot in the middle, over a red line on the ground. Two teams of Ploobs, blue on the left and gold on the right.', formal: 'A rope with a knot over a centre line; two teams, blue left and gold right.', technical: 'A rope, a knot over a centre mark, two teams pulling in opposite directions.' }, do: 'none', pulse: 'knot' },
      { say: { simple: 'Every Ploob pulls exactly as hard as every other, and each one wears its own arrow. Two pulls on the same rope, in opposite directions.', formal: 'Every Ploob pulls with the same force, drawn as its own arrow. Two forces on one rope, opposite ways.', technical: 'Each Ploob applies the same force; the arrows show each one. Two opposing forces act on the rope.' }, do: 'a5-lean', pulse: 'teamBig' },
      { say: { simple: 'Right now it is three against two. Guess what the knot does when they pull.', formal: 'Three against two at the moment. Predict what the knot does on Go.', technical: 'Three versus two. Predict the knot\'s motion.' }, do: 'none' },
    ],
    requires: ['a4'],
    skill: 'predicting',
    maps: ['0893 8Pf.03', '0625 1.5'],
    predict: {
      prompt: { simple: 'Which way will the knot go?', formal: 'Which way does the knot move?', technical: 'Which way does the knot accelerate?' },
      options: [
        { id: 'left', label: { simple: 'Left', formal: 'Left', technical: 'Left' } },
        { id: 'right', label: { simple: 'Right', formal: 'Right', technical: 'Right' } },
        { id: 'stays', label: { simple: 'Stays put', formal: 'Stays put', technical: 'No motion' } },
      ],
      correct: 'left',
    },
    notice: { simple: 'Equal teams: what happened? Unequal: what happened?', formal: 'Equal teams versus unequal teams — what was different?', technical: 'What did the knot do when the resultant was zero, and when it was not?' },
    sayItBack: null,
    equation: 'resultant',
    variable: 'resultant',
  },
  a6: {
    id: 'a6',
    short: 'Why stop?',
    title: { simple: 'Why does it stop?', formal: 'Why does it stop?', technical: 'Friction and drag' },
    question: { simple: 'Where did the backwards arrow come from?', formal: 'Where does the backwards arrow come from?', technical: 'What produces the retarding force?' },
    instruction: { simple: 'Turn the floor dial. Push the crate.', formal: 'Change the surface, then push the crate.', technical: 'Select a surface, push, and read the stopping distance.' },
    meet: [
      { say: { simple: 'The same crate, and the same push every time — a set shove that sends it sliding.', formal: 'The same crate, given exactly the same push each time.', technical: 'The same crate, launched at the same speed each time.' }, do: 'none', pulse: 'crate' },
      { say: { simple: 'What changes is the floor: a rough rubber mat, smooth wood, slippery ice, and a rail with no air at all.', formal: 'Only the surface changes: rubber mat, wood, ice, and a frictionless rail in a vacuum.', technical: 'The independent variable is the surface: rubber, wood, ice, and a frictionless rail with no air.' }, do: 'a6-cycle', pulse: 'floor' },
      { say: { simple: 'A sliding crate always stops — so something must be slowing it. We are going to find it. Guess first.', formal: 'A sliding crate stops, so a force must be slowing it. You are going to find it.', technical: 'Stopping implies a retarding force. Identify it, and see what happens without it.' }, do: 'none' },
    ],
    requires: ['a4'],
    skill: 'explaining',
    maps: ['0893 7Pf.04', '0625 1.5'],
    predict: {
      prompt: { simple: 'Same push on the rough mat. Further, less far, or the same?', formal: 'Same push, rough mat: how far does it slide?', technical: 'On a rougher surface, how does stopping distance change?' },
      options: [
        { id: 'further', label: { simple: 'Further', formal: 'Further', technical: 'Further' } },
        { id: 'less', label: { simple: 'Less far', formal: 'Less far', technical: 'Less far' } },
        { id: 'same', label: { simple: 'Same', formal: 'The same', technical: 'Unchanged' } },
      ],
      correct: 'less',
    },
    notice: { simple: 'What happened when the backwards arrow was gone?', formal: 'With no backwards arrow at all, what did the crate do?', technical: 'With no retarding force, what did the motion do?' },
    sayItBack: {
      simple: ['Friction pushes back against sliding. With none, it keeps going.', 'Friction pushes the crate along. With none, it stops.', 'Friction is the push you gave it. With none, it goes faster.'],
      formal: ['Friction is a force that opposes sliding; with no friction the crate keeps a steady speed.', 'Friction is a force that drives sliding; with no friction the crate stops.', 'Friction is the force you applied; without it the crate speeds up.'],
      technical: ['Friction and drag oppose motion; remove them and the crate continues at constant velocity.', 'Friction and drag cause motion; remove them and the crate comes to rest.', 'Friction is the applied force; removing it accelerates the crate.'],
    },
    equation: null,
    variable: 'stop-distance',
  },
  a7: {
    id: 'a7',
    short: 'Gravity',
    title: { simple: 'Gravity is a pull', formal: 'Gravity is a pull', technical: 'Mass, weight and g' },
    question: { simple: 'Heavy or light — which lands first?', formal: 'Heavy or light — which lands first?', technical: 'Does mass affect the time to fall?' },
    instruction: { simple: 'Turn the world dial. Tap Drop.', formal: 'Choose a world on the dial, then tap Drop.', technical: 'Select a world, then release both balls.' },
    meet: [
      { say: { simple: 'A ledge, one metre up. Two balls sit on it: a heavy steel one and a light wooden one.', formal: 'A ledge at 1.0 m with two balls: steel (100 g) and wood (20 g).', technical: 'A 1.0 m ledge holding a 0.100 kg steel ball and a 0.020 kg wooden ball.' }, do: 'none', pulse: 'ball' },
      { say: { simple: 'Each ball wears a red arrow pointing straight down. That is the pull of the world on it — bigger for the heavy ball.', formal: 'Each ball carries a downward arrow: the pull of the planet on it. The heavier ball has the longer arrow.', technical: 'The downward arrows are each ball\'s weight — the gravitational pull on it.' }, do: 'a7-hang', pulse: 'ball' },
      { say: { simple: 'The dial changes which world we are standing on. Guess first, then tap Drop.', formal: 'The dial changes the world. Predict which ball lands first, then drop them.', technical: 'The dial sets g. Predict, then release both.' }, do: 'none', pulse: 'dial' },
    ],
    requires: ['a4'],
    skill: 'predicting',
    maps: ['0893 7Pf.03', '0625 1.3', '0625 1.2'],
    predict: {
      prompt: { simple: 'Which ball lands first?', formal: 'Which ball lands first?', technical: 'Which ball reaches the ground first?' },
      options: [
        { id: 'heavy', label: { simple: 'The heavy one', formal: 'The heavy one', technical: 'Steel (100 g)' } },
        { id: 'light', label: { simple: 'The light one', formal: 'The light one', technical: 'Wood (20 g)' } },
        { id: 'same', label: { simple: 'Together', formal: 'Together', technical: 'Together' } },
      ],
      correct: 'same',
    },
    notice: { simple: 'You turned the dial. What changed — the balls, or the pull on them?', formal: 'On the Moon, what changed: the balls, or the pull on them?', technical: 'Which quantity did the dial change: mass, or weight?' },
    sayItBack: null,
    equation: 'weight',
    variable: 'weight',
  },
}

export const EPISODE_LIST: Episode[] = EPISODE_IDS.map((id) => EPISODES[id])

/**
 * Words the `simple` copy may not use until the episode that introduces
 * them. The verify suite walks every earlier episode's simple strings.
 */
export const FORBIDDEN_BEFORE: Record<string, EpisodeId | 'never'> = {
  speed: 'a2',
  force: 'a4',
  newton: 'a4',
  friction: 'a6',
  weight: 'a7',
  mass: 'a7',
  gravity: 'a7',
  gradient: 'never',
  acceleration: 'never',
  velocity: 'never',
  resultant: 'never',
  vector: 'never',
}

/* ------------------------------------------------------------------ */
/* Physical constants of the room                                     */
/* ------------------------------------------------------------------ */

/** Lane length for A1–A3, metres. */
export const LANE = 4.0
/** The flag the A1 prediction is about. */
export const FLAG_AT = 2.5
/** A2 runner speeds, m/s: blue then gold. Fixed on purpose — the only control is the stopwatch. */
export const RUNNER_SPEEDS: [number, number] = [1.6, 1.0]
/** A3 speed dial range. */
export const A3_SPEED_MIN = 0.3
export const A3_SPEED_MAX = 2.0
export const A3_LANE = 6.0
/** Crate mass, kg (A4–A6). */
export const CRATE_MASS = 2
/** A4: how long the released arrow's force acts, s. */
export const A4_PUSH_TIME = 0.5
export const A4_MAX_FORCE = 20
/** A4 crate slides on ice. */
export const A4_MU = 0.05
/** A5: each Ploob pulls this hard and has this much mass. */
export const PLOOB_PULL = 20
export const PLOOB_MASS = 4
export const A5_MAX_TEAM = 4
/** A6 surfaces — honest *sliding* coefficients, not the Yard's rolling ones. */
export interface FloorMeta {
  id: 'mat' | 'wood' | 'ice' | 'rail'
  label: Copy
  mu: number
  /** The last notch also removes the air. */
  airless: boolean
  color: string
}
export const FLOORS: FloorMeta[] = [
  { id: 'mat', label: { simple: 'Rough mat', formal: 'Rubber mat', technical: 'Rubber mat · μ 0.6' }, mu: 0.6, airless: false, color: '#8A6A4A' },
  { id: 'wood', label: { simple: 'Wood', formal: 'Wood', technical: 'Wood · μ 0.3' }, mu: 0.3, airless: false, color: '#C9A46E' },
  { id: 'ice', label: { simple: 'Ice', formal: 'Ice', technical: 'Ice · μ 0.05' }, mu: 0.05, airless: false, color: '#D6EAF5' },
  { id: 'rail', label: { simple: 'Rail, no air', formal: 'Frictionless rail, no air', technical: 'Frictionless rail, vacuum · μ 0' }, mu: 0, airless: true, color: '#9AA6B4' },
]
/** A6 push speed, m/s. */
export const A6_V0 = 1.5
/** A6 lane half-length; the rail wraps around. */
export const A6_HALF = 3.0
/** A7 ledge height, m, and the two balls. */
export const LEDGE_H = 1.0
export const BALLS = [
  { id: 'steel', label: { simple: 'Steel ball', formal: 'Steel ball · 100 g', technical: 'Steel · 0.100 kg' } as Copy, kg: 0.1, color: '#8E97A3' },
  { id: 'wood', label: { simple: 'Wooden ball', formal: 'Wooden ball · 20 g', technical: 'Wood · 0.020 kg' } as Copy, kg: 0.02, color: '#C99A5B' },
] as const

/* ------------------------------------------------------------------ */
/* Pure physics                                                       */
/* ------------------------------------------------------------------ */

export function fallTime(h: number, g: number): number {
  return Math.sqrt((2 * h) / g)
}

/** Stopping distance of a slide from v0 under kinetic friction μ. Infinity when μ = 0. */
export function stopDistance(v0: number, mu: number, g: number): number {
  if (mu <= 0) return Infinity
  return (v0 * v0) / (2 * mu * g)
}

/** Net force and acceleration of the tug-of-war knot for team sizes (left, right). Positive = right. */
export function tugAcceleration(left: number, right: number): { net: number; a: number } {
  const net = (right - left) * PLOOB_PULL
  const mass = Math.max(1, left + right) * PLOOB_MASS
  return { net, a: net / mass }
}

/* ------------------------------------------------------------------ */
/* The sim                                                            */
/* ------------------------------------------------------------------ */

export interface Point {
  t: number
  x: number
}

export interface PhysicsSim {
  time: number
  started: boolean
  demoMode: boolean
  paused: boolean
  episode: EpisodeId
  beat: Beat
  beatAt: number
  /** Learner's prediction for the current episode, by option id. */
  prediction: string | null
  /** Plays (runs, pushes, drops) in the current episode. */
  runs: number
  world: WorldId
  g: number
  /** The open equation card. */
  card: CardId | null
  /** Ids of episodes landed this session (the shelf also reads events). */
  landed: EpisodeId[]
  /** Monotonic counter the HUD polls to know something changed. */
  seq: number

  a1: { x: number; path: number; lastX: number; maxX: number; dragging: boolean }
  a2: {
    running: boolean
    startAt: number
    x: [number, number]
    finishAt: [number | null, number | null]
    swRunning: boolean
    swStartAt: number
    swElapsed: number
    /** The learner's own timing of the blue runner, once taken. */
    lap: number | null
    runs: number
  }
  a3: { speed: number; running: boolean; x: number; t: number; startAt: number; trace: Point[]; halts: number; ghost: Point[]; peakSpeed: number }
  a4: { force: number; holding: boolean; x: number; v: number; pushUntil: number; pushes: number; maxForce: number; lastStart: number; lastDist: number }
  a5: { left: number; right: number; running: boolean; x: number; v: number; goAt: number; results: Array<{ left: number; right: number; moved: number }> }
  a6: { floor: number; x: number; v: number; sliding: boolean; startX: number; results: Array<{ floor: number; dist: number }>; airDrain: number }
  a7: { dropping: boolean; startAt: number; y: [number, number]; landedAt: [number | null, number | null]; drops: Array<{ world: WorldId; t: number }>; hung: boolean }
}

export function createPhysicsSim(): PhysicsSim {
  return {
    time: 0,
    started: false,
    demoMode: false,
    paused: false,
    episode: 'a1',
    beat: 'arrive',
    beatAt: 0,
    prediction: null,
    runs: 0,
    world: 'earth',
    g: WORLD_BY_ID.earth.g,
    card: null,
    landed: [],
    seq: 0,
    a1: { x: 0, path: 0, lastX: 0, maxX: 0, dragging: false },
    a2: { running: false, startAt: 0, x: [0, 0], finishAt: [null, null], swRunning: false, swStartAt: 0, swElapsed: 0, lap: null, runs: 0 },
    a3: { speed: 1.0, running: false, x: 0, t: 0, startAt: 0, trace: [], halts: 0, ghost: [], peakSpeed: 0 },
    a4: { force: 0, holding: false, x: 0, v: 0, pushUntil: 0, pushes: 0, maxForce: 0, lastStart: 0, lastDist: 0 },
    a5: { left: 3, right: 2, running: false, x: 0, v: 0, goAt: 0, results: [] },
    a6: { floor: 0, x: -A6_HALF + 0.5, v: 0, sliding: false, startX: -A6_HALF + 0.5, results: [], airDrain: 0 },
    a7: { dropping: false, startAt: 0, y: [LEDGE_H, LEDGE_H], landedAt: [null, null], drops: [], hung: false },
  }
}

function bump(sim: PhysicsSim): void {
  sim.seq++
}

export function setBeat(sim: PhysicsSim, beat: Beat): void {
  sim.beat = beat
  sim.beatAt = sim.time
  bump(sim)
}

/** Arrive an episode: clear the floor, reset that episode's state, open on the first beat. */
export function arriveEpisode(sim: PhysicsSim, id: EpisodeId): void {
  const fresh = createPhysicsSim()
  sim.episode = id
  sim.prediction = null
  sim.runs = 0
  sim.card = null
  sim[id] = fresh[id] as never
  if (id !== 'a7') setWorld(sim, 'earth')
  setBeat(sim, 'arrive')
}

/** After the Meet demos: clear what the room did by itself, keep the beat. */
export function resetEpisodeState(sim: PhysicsSim): void {
  const fresh = createPhysicsSim()
  const id = sim.episode
  sim[id] = fresh[id] as never
  sim.runs = 0
  if (id !== 'a7') setWorld(sim, 'earth')
  bump(sim)
}

export function setWorld(sim: PhysicsSim, world: WorldId): void {
  sim.world = world
  sim.g = WORLD_BY_ID[world].g
  bump(sim)
}

export function commitPrediction(sim: PhysicsSim, option: string): void {
  sim.prediction = option
  setBeat(sim, 'play')
}

/**
 * Whether the episode has produced enough to move on from Play. Each
 * episode's rule is written out so the coach chip can name what is missing.
 */
export function playComplete(sim: PhysicsSim): boolean {
  switch (sim.episode) {
    case 'a1':
      return sim.a1.maxX >= FLAG_AT + 0.3
    case 'a2':
      return sim.a2.lap !== null
    case 'a3':
      return sim.a3.halts >= 1 && sim.a3.peakSpeed >= 1.2 && sim.runs >= 2
    case 'a4':
      return sim.a4.pushes >= 2 && sim.a4.maxForce >= 12
    case 'a5':
      return sim.a5.results.some((r) => r.left === r.right) && sim.a5.results.some((r) => r.left !== r.right)
    case 'a6':
      return sim.a6.results.some((r) => r.floor === 0) && sim.a6.results.some((r) => r.floor === 3)
    case 'a7':
      return sim.a7.drops.some((d) => d.world === 'earth') && sim.a7.drops.some((d) => d.world !== 'earth')
  }
}

/** What the coach should say during Play, given what is still missing. */
export function playHint(sim: PhysicsSim, vocab: Vocab): string {
  const s = vocab === 'simple'
  switch (sim.episode) {
    case 'a1':
      return s ? 'Drag it all the way past the flag.' : 'Drag the Ploob beyond the flag.'
    case 'a2':
      if (sim.a2.swRunning) return s ? 'Now tap STOP the moment Blue crosses the finish line.' : 'Tap STOP as Blue crosses the finish.'
      if (sim.a2.lap === null && sim.a2.runs > 0) return s ? 'Not quite a race time. Tap START to try again.' : 'That was not a race time. START again.'
      return s ? 'Tap START. The race and your stopwatch begin together.' : 'Tap START: the race and the stopwatch begin together.'
    case 'a3':
      if (sim.a3.peakSpeed < 1.2) return s ? 'Turn the dial up and run it again.' : 'Try a higher speed.'
      if (sim.a3.halts < 1) return s ? 'Tap the Ploob while it runs to stop it.' : 'Tap the runner mid-run to halt it.'
      return s ? 'Run it once more.' : 'One more run.'
    case 'a4':
      if (sim.a4.maxForce < 12) return s ? 'Stretch the arrow much longer, then let go.' : 'Pull the arrow to a bigger force and release.'
      return s ? 'Try a short arrow too.' : 'Now try a smaller force.'
    case 'a5':
      if (!sim.a5.results.some((r) => r.left === r.right)) return s ? 'Make the teams equal. Then Go.' : 'Make the teams equal and tap Go.'
      return s ? 'Now make one side bigger. Go.' : 'Now make the teams unequal and tap Go.'
    case 'a6':
      if (!sim.a6.results.some((r) => r.floor === 0)) return s ? 'Push it on the rough mat.' : 'Push the crate on the mat.'
      return s ? 'Turn the dial to the last notch. Push again.' : 'Select the rail with no air, and push.'
    case 'a7':
      if (!sim.a7.drops.some((d) => d.world === 'earth')) return s ? 'Tap Drop on Earth.' : 'Drop both balls on Earth.'
      return s ? 'Turn the dial to the Moon. Drop again.' : 'Choose another world and drop again.'
  }
}

/* ---- A1 ---- */
export function dragA1(sim: PhysicsSim, x: number): void {
  const nx = Math.max(0, Math.min(LANE, x))
  sim.a1.path += Math.abs(nx - sim.a1.lastX)
  sim.a1.lastX = nx
  sim.a1.x = nx
  sim.a1.maxX = Math.max(sim.a1.maxX, nx)
  if (sim.beat === 'play' && playComplete(sim)) setBeat(sim, 'notice')
}

/* ---- A2 ---- */
export function goA2(sim: PhysicsSim): void {
  const a = sim.a2
  if (a.running) return
  a.running = true
  a.startAt = sim.time
  a.x = [0, 0]
  a.finishAt = [null, null]
  a.runs++
  sim.runs++
  bump(sim)
}

/** Stopwatch taps are stamped by the caller on pointerdown (the Motion Lab trap). */
export function tapWatchA2(sim: PhysicsSim, at = sim.time): 'start' | 'stop' {
  const a = sim.a2
  if (!a.swRunning) {
    a.swRunning = true
    a.swStartAt = at
    a.swElapsed = 0
    bump(sim)
    return 'start'
  }
  a.swRunning = false
  a.swElapsed = Math.max(0, at - a.swStartAt)
  // A lap counts as timing the runner if it was taken during (or just around) a run.
  if (a.runs >= 1 && a.swElapsed > 0.8 && a.swElapsed < 8) a.lap = a.swElapsed
  if (sim.beat === 'play' && playComplete(sim)) setBeat(sim, 'notice')
  bump(sim)
  return 'stop'
}

/**
 * The stopwatch tile for A2: the first tap starts the race *and* the watch,
 * the second stops the watch. Timing something means starting the clock when
 * it starts — so the room does that for the learner the first time.
 */
export function tapRaceA2(sim: PhysicsSim, at = sim.time): 'start' | 'stop' {
  if (!sim.a2.swRunning) {
    if (sim.a2.running) return 'start'
    goA2(sim)
    return tapWatchA2(sim, at)
  }
  return tapWatchA2(sim, at)
}

export function resetWatchA2(sim: PhysicsSim): void {
  sim.a2.swRunning = false
  sim.a2.swElapsed = 0
  bump(sim)
}

/* ---- A3 ---- */
export function setSpeedA3(sim: PhysicsSim, v: number): void {
  sim.a3.speed = Math.max(A3_SPEED_MIN, Math.min(A3_SPEED_MAX, v))
  bump(sim)
}

export function runA3(sim: PhysicsSim): void {
  const a = sim.a3
  if (a.trace.length) a.ghost = a.trace
  a.running = true
  a.x = 0
  a.t = 0
  a.startAt = sim.time
  a.trace = [{ t: 0, x: 0 }]
  a.peakSpeed = Math.max(a.peakSpeed, a.speed)
  sim.runs++
  bump(sim)
}

/** Tap the runner: halt it (time keeps going) or set it off again. */
export function tapRunnerA3(sim: PhysicsSim): void {
  const a = sim.a3
  if (a.t === 0 && !a.running) return
  if (a.running) {
    a.running = false
    a.halts++
  } else if (a.x < A3_LANE) {
    a.running = true
  }
  bump(sim)
}

/* ---- A4 ---- */
export function holdArrowA4(sim: PhysicsSim, force: number): void {
  sim.a4.holding = true
  sim.a4.force = Math.max(-A4_MAX_FORCE, Math.min(A4_MAX_FORCE, force))
  bump(sim)
}

export function releaseArrowA4(sim: PhysicsSim): void {
  const a = sim.a4
  if (!a.holding) return
  a.holding = false
  if (Math.abs(a.force) < 0.5) return
  a.pushUntil = sim.time + A4_PUSH_TIME
  a.pushes++
  a.maxForce = Math.max(a.maxForce, Math.abs(a.force))
  a.lastStart = a.x
  sim.runs++
  bump(sim)
}

/* ---- A5 ---- */
export function setTeamA5(sim: PhysicsSim, side: 'left' | 'right', n: number): void {
  const v = Math.max(0, Math.min(A5_MAX_TEAM, Math.round(n)))
  sim.a5[side] = v
  bump(sim)
}

export function goA5(sim: PhysicsSim): void {
  const a = sim.a5
  if (a.running) return
  a.running = true
  a.x = 0
  a.v = 0
  a.goAt = sim.time
  sim.runs++
  bump(sim)
}

/* ---- A6 ---- */
export function setFloorA6(sim: PhysicsSim, i: number): void {
  sim.a6.floor = Math.max(0, Math.min(FLOORS.length - 1, i))
  if (!sim.a6.sliding) {
    sim.a6.x = -A6_HALF + 0.5
    sim.a6.startX = sim.a6.x
  }
  bump(sim)
}

export function pushA6(sim: PhysicsSim): void {
  const a = sim.a6
  if (a.sliding) return
  a.x = -A6_HALF + 0.5
  a.startX = a.x
  a.v = A6_V0
  a.sliding = true
  sim.runs++
  bump(sim)
}

/* ---- A7 ---- */
export function dropA7(sim: PhysicsSim): void {
  const a = sim.a7
  if (a.dropping) return
  a.dropping = true
  a.startAt = sim.time
  a.y = [LEDGE_H, LEDGE_H]
  a.landedAt = [null, null]
  sim.runs++
  bump(sim)
}

export function resetA7(sim: PhysicsSim): void {
  const a = sim.a7
  a.dropping = false
  a.y = [LEDGE_H, LEDGE_H]
  a.landedAt = [null, null]
  bump(sim)
}

/* ---- Frame step ---- */
export function stepPhysics(sim: PhysicsSim, dt: number): void {
  if (sim.paused) return
  sim.time += dt
  const g = sim.g
  switch (sim.episode) {
    case 'a2': {
      const a = sim.a2
      if (a.running) {
        const t = sim.time - a.startAt
        let allDone = true
        for (let i = 0; i < 2; i++) {
          const x = Math.min(LANE, RUNNER_SPEEDS[i] * t)
          a.x[i] = x
          if (x >= LANE) {
            if (a.finishAt[i] === null) a.finishAt[i] = a.startAt + LANE / RUNNER_SPEEDS[i]
          } else allDone = false
        }
        if (allDone) {
          a.running = false
          bump(sim)
        }
      }
      if (a.swRunning) a.swElapsed = sim.time - a.swStartAt
      break
    }
    case 'a3': {
      const a = sim.a3
      if (a.t > 0 || a.running) {
        a.t += dt
        if (a.running) {
          a.x = Math.min(A3_LANE, a.x + a.speed * dt)
          if (a.x >= A3_LANE) {
            a.running = false
            bump(sim)
          }
        }
        const last = a.trace[a.trace.length - 1]
        if (!last || a.t - last.t >= 0.05) a.trace.push({ t: a.t, x: a.x })
        if (a.t > 12) {
          a.running = false
        }
      }
      break
    }
    case 'a4': {
      const a = sim.a4
      const pushing = sim.time < a.pushUntil
      if (pushing) a.v += (a.force / CRATE_MASS) * dt
      else if (a.v !== 0) {
        const decel = A4_MU * g * dt
        if (Math.abs(a.v) <= decel) {
          a.v = 0
          a.lastDist = Math.abs(a.x - a.lastStart)
          bump(sim)
        } else a.v -= Math.sign(a.v) * decel
      }
      a.x += a.v * dt
      if (Math.abs(a.x) > 3.2) {
        a.x = Math.sign(a.x) * 3.2
        a.v = 0
      }
      break
    }
    case 'a5': {
      const a = sim.a5
      if (a.running) {
        const { a: acc } = tugAcceleration(a.left, a.right)
        a.v += acc * dt
        a.x += a.v * dt
        const t = sim.time - a.goAt
        if (t >= 2.4 || Math.abs(a.x) >= 1.6) {
          a.running = false
          a.results.push({ left: a.left, right: a.right, moved: a.x })
          a.v = 0
          if (sim.beat === 'play' && playComplete(sim)) setBeat(sim, 'notice')
          bump(sim)
        }
      }
      break
    }
    case 'a6': {
      const a = sim.a6
      const floor = FLOORS[a.floor]
      a.airDrain += ((floor.airless ? 1 : 0) - a.airDrain) * (1 - Math.exp(-dt * 1.6))
      if (a.sliding) {
        const decel = floor.mu * g * dt
        if (a.v <= decel) {
          a.v = 0
          a.sliding = false
          a.results.push({ floor: a.floor, dist: a.x - a.startX })
          if (sim.beat === 'play' && playComplete(sim)) setBeat(sim, 'notice')
          bump(sim)
        } else {
          a.v -= decel
          a.x += a.v * dt
          if (floor.mu === 0) {
            // The rail wraps: the crate goes off the edge of the room and comes round again.
            if (a.x > A6_HALF) {
              a.x -= 2 * A6_HALF
              a.startX -= 2 * A6_HALF
              if (!a.results.some((r) => r.floor === 3)) {
                a.results.push({ floor: 3, dist: Infinity })
                if (sim.beat === 'play' && playComplete(sim)) setBeat(sim, 'notice')
              }
              bump(sim)
            }
          } else if (a.x > A6_HALF) {
            a.x = A6_HALF
            a.v = 0
            a.sliding = false
            a.results.push({ floor: a.floor, dist: a.x - a.startX })
            bump(sim)
          }
        }
      }
      break
    }
    case 'a7': {
      const a = sim.a7
      if (a.dropping) {
        const t = sim.time - a.startAt
        const y = Math.max(0, LEDGE_H - 0.5 * g * t * t)
        a.y = [y, y]
        if (y <= 0 && a.landedAt[0] === null) {
          const tl = fallTime(LEDGE_H, g)
          a.landedAt = [tl, tl]
          a.drops.push({ world: sim.world, t: tl })
          a.dropping = false
          if (sim.beat === 'play' && playComplete(sim)) setBeat(sim, 'notice')
          bump(sim)
        }
      }
      break
    }
    default:
      break
  }
}

/* ------------------------------------------------------------------ */
/* Landing                                                            */
/* ------------------------------------------------------------------ */

/**
 * The measured values a card binds to. `null` when the episode has not yet
 * produced them — which is exactly when the card must not open.
 */
export function measuredFor(sim: PhysicsSim, card: CardId): Record<string, number> | null {
  switch (card) {
    case 'speed': {
      if (sim.episode !== 'a2' || sim.a2.lap === null) return null
      return { s: LANE, t: sim.a2.lap }
    }
    case 'resultant': {
      if (sim.episode !== 'a5') return null
      const last = [...sim.a5.results].reverse().find((r) => r.left !== r.right)
      if (!last) return null
      const big = Math.max(last.left, last.right) * PLOOB_PULL
      const small = Math.min(last.left, last.right) * PLOOB_PULL
      return { f1: big, f2: small }
    }
    case 'weight': {
      if (sim.episode !== 'a7' || sim.a7.drops.length === 0) return null
      return { m: BALLS[0].kg, g: sim.g }
    }
  }
}

/** The one way a card opens. Throws when the right-hand side is unmeasured. */
export function openCard(sim: PhysicsSim, card: CardId): Record<string, number> {
  const values = measuredFor(sim, card)
  if (!values) throw new Error(`Equation card "${card}" cannot open: its quantities have not been measured yet.`)
  sim.card = card
  bump(sim)
  return values
}

export function closeCard(sim: PhysicsSim): void {
  sim.card = null
  bump(sim)
}

/** Move from Notice to Land: opens the card when the episode has one. */
export function land(sim: PhysicsSim): void {
  const ep = EPISODES[sim.episode]
  if (ep.equation) openCard(sim, ep.equation)
  setBeat(sim, 'land')
}

/** Finish the episode: it goes on the shelf. */
export function finishEpisode(sim: PhysicsSim): void {
  if (!sim.landed.includes(sim.episode)) sim.landed.push(sim.episode)
  sim.card = null
  setBeat(sim, 'done')
}

export function nextEpisode(id: EpisodeId): EpisodeId | null {
  const i = EPISODE_IDS.indexOf(id)
  return i >= 0 && i < EPISODE_IDS.length - 1 ? EPISODE_IDS[i + 1] : null
}

/* ------------------------------------------------------------------ */
/* Shelf — derived from the event log, never stored                   */
/* ------------------------------------------------------------------ */

export function completedEpisodes(events: LearningEvent[]): Set<EpisodeId> {
  const out = new Set<EpisodeId>()
  for (const e of events) {
    if (e.cabinet !== 'physics' || !isType(e, 'mission.completed')) continue
    const id = e.payload.missionId as EpisodeId
    if (EPISODE_IDS.includes(id)) out.add(id)
  }
  return out
}

/** Prerequisites an episode is missing, in ladder order. */
export function missingFor(id: EpisodeId, done: Set<EpisodeId>): EpisodeId[] {
  const out: EpisodeId[] = []
  const walk = (e: EpisodeId) => {
    for (const r of EPISODES[e].requires) {
      if (!done.has(r) && !out.includes(r)) {
        walk(r)
        out.push(r)
      }
    }
  }
  walk(id)
  return EPISODE_IDS.filter((e) => out.includes(e))
}

/** The Yard's benches open after A3. */
export const YARD_DOOR_AFTER: EpisodeId = 'a3'

/** Was the committed prediction the right one? */
export function predictionCorrect(sim: PhysicsSim): boolean | null {
  if (sim.prediction === null) return null
  return sim.prediction === EPISODES[sim.episode].predict.correct
}

/** Parse `#/physics/a5` → 'a5'. */
export function episodeFromParam(p: string | undefined): EpisodeId | null {
  if (!p) return null
  const id = p.toLowerCase() as EpisodeId
  return EPISODE_IDS.includes(id) ? id : null
}

/* ------------------------------------------------------------------ */
/* Say it back — the sentences for a landing                          */
/* ------------------------------------------------------------------ */

export interface SentenceTile {
  id: 'right' | 'swapped' | 'wrong'
  text: string
}

/** Shuffled deterministically by episode so a suite can find the right one. */
export function sentencesFor(sim: PhysicsSim, vocab: Vocab): SentenceTile[] {
  const ep = EPISODES[sim.episode]
  const src = ep.equation ? CARDS[ep.equation].sentences[vocab] : ep.sayItBack ? ep.sayItBack[vocab] : null
  if (!src) return []
  const tiles: SentenceTile[] = [
    { id: 'right', text: src[0] },
    { id: 'swapped', text: src[1] },
    { id: 'wrong', text: src[2] },
  ]
  const rot = EPISODE_IDS.indexOf(sim.episode) % 3
  return [...tiles.slice(rot), ...tiles.slice(0, rot)]
}

export function fmt(v: number, digits: number): string {
  if (!Number.isFinite(v)) return '∞'
  return v.toFixed(digits)
}
