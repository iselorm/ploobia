/**
 * The guided demo.
 *
 * A learner who opens the Rate Lab cold sees four sliders, a specimen tray, a
 * climate picker and a graph, and has no idea which of those matters. So the
 * lab runs one complete investigation by itself first — moving the real
 * controls, in the real scene — and then hands over. Nothing here is a video or
 * a screenshot: the demo drives exactly the same functions the buttons do.
 */

import type { VarId } from './ratelab'

export interface DemoApi {
  /** Light as a fraction of full sun, 0–1. */
  setLight: (v: number) => void
  setCo2: (v: number) => void
  setTemp: (c: number) => void
  setXVar: (v: VarId) => void
  setPrediction: (v: number | null) => void
  startTrial: () => void
  resetView: () => void
  setAutoOrbit: (on: boolean) => void
}

export interface DemoStep {
  /** What the narrator says. */
  text: string
  /** How long the step lasts, in ms. Ignored when `awaitTrial` is set. */
  ms: number
  /** Hold here until the running measurement finishes. */
  awaitTrial?: boolean
  /** Fired once when the step begins. */
  enter?: (api: DemoApi) => void
  /** Smoothly driven across the step's duration, so the slider visibly moves. */
  tween?: { from: number; to: number; apply: (api: DemoApi, value: number) => void }
}

export const DEMO_STEPS: DemoStep[] = [
  {
    text: 'Watch first. I will run one complete investigation using these controls, then hand them over to you.',
    ms: 3600,
    enter: (api) => {
      api.resetView()
      api.setAutoOrbit(true)
    },
  },
  {
    text: 'Here is the leaf. CO₂ drifts in from the air, H₂O climbs from the roots, O₂ leaves, and glucose builds up. Every molecule carries its own formula — drag to orbit, scroll to zoom.',
    ms: 6500,
  },
  {
    text: 'Now watch what happens when I take the light away…',
    ms: 3000,
    enter: (api) => api.setAutoOrbit(false),
    tween: { from: 0.65, to: 0.03, apply: (api, v) => api.setLight(v) },
  },
  {
    text: 'The oxygen stops. No light, no photosynthesis — and notice the plant is still respiring the whole time.',
    ms: 3800,
  },
  {
    text: 'Back up to full sun, and the bubbles come racing back.',
    ms: 2800,
    tween: { from: 0.03, to: 1, apply: (api, v) => api.setLight(v) },
  },
  {
    text: 'I am investigating light, so light is the only thing I am allowed to change. CO₂, temperature and water stay fixed — those are my controlled variables.',
    ms: 5200,
    enter: (api) => {
      api.setXVar('light')
      api.setCo2(425 / 1500)
      api.setTemp(22)
    },
  },
  {
    text: 'Before measuring, I commit a prediction on the graph. Guessing after the fact proves nothing.',
    ms: 4200,
    enter: (api) => api.setPrediction(46),
  },
  {
    text: 'Now the trial. The tube collects the oxygen coming off the leaf for a fixed time — exactly like counting bubbles from pondweed in a real lab.',
    ms: 1200,
    awaitTrial: true,
    enter: (api) => api.startTrial(),
  },
  {
    text: 'That is one point on the graph, recorded with the exact conditions it was measured under.',
    ms: 3600,
  },
  {
    text: 'Now I change one thing — dim the light — and measure again.',
    ms: 2600,
    tween: { from: 1, to: 0.18, apply: (api, v) => api.setLight(v) },
  },
  {
    text: 'Predict, then measure.',
    ms: 1200,
    awaitTrial: true,
    enter: (api) => {
      api.setPrediction(18)
      api.startTrial()
    },
  },
  {
    text: 'Two points, and a curve is already taking shape. Four or five more and you can find where extra light stops helping.',
    ms: 4200,
  },
  {
    text: 'Your turn. Pick one factor, predict, measure, repeat — and the missions will tell you what to hunt for.',
    ms: 4200,
    enter: (api) => {
      api.setLight(0.65)
      api.setPrediction(null)
    },
  },
]
