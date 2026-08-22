import { mountPloob } from './ploob-viewer.js'
import ploobModel from './assets/ploob.glb?url'
import heroFallback from './assets/hero-front.webp'
import regionGold from './assets/region-gold.webp'
import regionGreen from './assets/region-green.webp'
import regionRed from './assets/region-red.webp'
import regionBlue from './assets/region-blue.webp'
import regionViolet from './assets/region-violet.webp'

/**
 * Where the arcade itself lives. The site is deployed at the domain root and
 * the single-file app sits in /app/ beside it; change this one line if it
 * lands somewhere else.
 */
const APP_URL = './app/'

/* ------------------------------------------------------------------ */
/* Content — mirrors src/lib/cabinets.ts in the app                    */
/* ------------------------------------------------------------------ */

const REGIONS = [
  {
    region: 'The Meadow', title: 'Photosynthesis Rate Lab', subject: 'Biology', tint: '#4E9A4A', route: '#/photosynthesis',
    dare: 'Mount a leaf, pick a climate, measure the oxygen it breathes out. Find the plateau — then say what is holding the rate back.',
    topics: ['Limiting factors', 'Rate of reaction', 'Diffusion & osmosis'],
  },
  {
    region: 'The Bloodstream', title: 'Blood Voyage', subject: 'Biology', tint: '#D2554C', route: '#/blood',
    dare: 'Ride the whole oxygen loop — lungs, heart, capillary, living cell — and watch your red cell load up and let go.',
    topics: ['Circulation', 'Gas exchange', 'Cells & respiration'],
  },
  {
    region: 'The Yard', title: 'Motion Yard', subject: 'Physics', tint: '#4A8FD0', route: '#/motion',
    dare: 'Race it, launch it, drop it. Every flight wears its own numbers — and turning gravity down retunes the whole world.',
    topics: ['Motion graphs', 'Projectiles', 'Falling & gravity'],
  },
  {
    region: 'The Foundry', title: 'Atom Foundry', subject: 'Chemistry', tint: '#D69A2A', route: '#/atoms',
    dare: 'Stack protons, pour electrons, watch the shells fill — and forge the periodic table onto the wall one atom at a time.',
    topics: ['Atomic structure', 'Periodic trends', 'Isotopes & ions'],
  },
  {
    region: 'The River Basin', title: 'River & Flood Bench', subject: 'Geography', tint: '#3FA3C7', route: '#/rivers',
    dare: 'One river, source to sea. Time the float, follow your pebble, read the gauge — then make it rain and defend the village.',
    topics: ['River processes', 'Hydrographs', 'Flood management'],
  },
  {
    region: 'The Workshop', title: 'Circuit Workshop', subject: 'Physics', tint: '#E8A33D', route: null,
    dare: 'The mist has not lifted here yet. Build it, measure it, break it — Ohm’s law you can hold.',
    topics: ['Current & voltage', 'Resistance', 'Series & parallel'],
  },
]

const DOORS = [
  { label: 'Explorer', ages: '10–12', tint: '#E8A33D', q: 'What happens if I…?',
    blurb: 'Poke everything. Watch the world react. Collect readings and compare them.' },
  { label: 'Scientist', ages: '13–15', tint: '#3E7C43', q: 'Why did that happen?',
    blurb: 'Change one variable, control the rest, predict the result, then plot the curve.' },
  { label: 'Analyst', ages: '16–17', tint: '#2E6DA8', q: 'Can I model it and defend a conclusion?',
    blurb: 'Repeat readings, quantify uncertainty, spot anomalies, compare competing explanations, write it up.' },
]

const COMPANIONS = [
  { src: regionGold, cap: 'the border' },
  { src: regionGreen, cap: 'the meadow' },
  { src: regionRed, cap: 'the bloodstream' },
  { src: regionBlue, cap: 'the river basin' },
  { src: regionViolet, cap: 'somewhere uncharted' },
]

/* ------------------------------------------------------------------ */
/* Wordmark eyes — the two o's in Ploobia                              */
/* ------------------------------------------------------------------ */

const EYES_SVG = `
<svg viewBox="0 0 120 64" aria-hidden="true">
  <defs><radialGradient id="pe" cx="38%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#FFF3CF"/><stop offset="45%" stop-color="#F5C862"/><stop offset="100%" stop-color="#C97A1F"/>
  </radialGradient></defs>
  <circle cx="32" cy="32" r="28" fill="url(#pe)" stroke="#8A5410" stroke-width="4"/>
  <circle cx="88" cy="32" r="28" fill="url(#pe)" stroke="#8A5410" stroke-width="4"/>
  <ellipse cx="22" cy="20" rx="6" ry="9" fill="#fff" opacity=".6"/>
  <ellipse cx="78" cy="20" rx="6" ry="9" fill="#fff" opacity=".6"/>
  <ellipse cx="35" cy="35" rx="10" ry="12" fill="#fff"/><ellipse cx="91" cy="35" rx="10" ry="12" fill="#fff"/>
  <circle cx="37" cy="37" r="6" fill="#2A1A08"/><circle cx="93" cy="37" r="6" fill="#2A1A08"/>
  <circle cx="39" cy="34.5" r="2" fill="#fff"/><circle cx="95" cy="34.5" r="2" fill="#fff"/>
</svg>`

function paintEyes() {
  let uid = 0
  document.querySelectorAll('[data-eyes]').forEach((el) => {
    const h = el.dataset.eyes
    const size = /em|px|rem/.test(h) ? h : `${h}px`
    el.innerHTML = EYES_SVG.replace(/pe/g, `pe${uid}`)
    const svg = el.querySelector('svg')
    svg.style.height = size
    svg.style.width = `calc(${size} * 1.875)`
    svg.style.marginInline = `calc(${size} * 0.02)`
    svg.style.marginBottom = `calc(${size} * 0.06)`
    el.style.display = 'inline-flex'
    el.style.alignItems = 'flex-end'
    uid += 1
  })
}

/* ------------------------------------------------------------------ */
/* Build the page                                                      */
/* ------------------------------------------------------------------ */

function buildRegions() {
  const grid = document.getElementById('regionGrid')
  grid.innerHTML = REGIONS.map((r) => {
    const open = Boolean(r.route)
    const tag = open ? 'a' : 'div'
    const href = open ? ` href="${APP_URL}${r.route}"` : ''
    return `<${tag} class="region rv ${open ? '' : 'soon'}"${href} style="--t:${r.tint}">
      <div class="top">
        <span class="subject">${r.subject}</span>
        <span class="pill">${open ? 'OPEN' : 'NOT YET DISCOVERED'}</span>
      </div>
      <h3>${r.region}</h3>
      <div class="real">${r.title}</div>
      <p>${r.dare}</p>
      <div class="topics">${r.topics.join(' · ')}</div>
      ${open ? '<span class="go">Enter →</span>' : ''}
    </${tag}>`
  }).join('')
  document.getElementById('regionCount').textContent = String(REGIONS.filter((r) => r.route).length)
}

function buildDoors() {
  document.getElementById('doorGrid').innerHTML = DOORS.map(
    (d) => `<div class="door rv" style="--c:${d.tint}; border-color:${d.tint}33; background:${d.tint}14">
      <div class="ages">Ages ${d.ages}</div>
      <h3>${d.label}</h3>
      <div class="q">“${d.q}”</div>
      <p>${d.blurb}</p>
    </div>`,
  ).join('')
}

function buildCompanions() {
  document.getElementById('companion').innerHTML = COMPANIONS.map(
    (c) => `<figure><img src="${c.src}" alt="Ploob" loading="lazy" /><figcaption>${c.cap}</figcaption></figure>`,
  ).join('')
}

function wireAppLinks() {
  document.querySelectorAll('[data-app]').forEach((a) => { a.href = APP_URL })
}

function wireHeader() {
  const hdr = document.getElementById('hdr')
  const onScroll = () => hdr.classList.toggle('stuck', window.scrollY > 24)
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
}

function wireReveal() {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }),
    { rootMargin: '0px 0px -8% 0px' },
  )
  document.querySelectorAll('.rv').forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`
    io.observe(el)
  })
}

async function wirePloob() {
  const stage = document.getElementById('stage')
  const canvas = document.getElementById('ploob')
  const handle = await mountPloob(canvas, { modelUrl: ploobModel, onReady: () => stage.classList.add('ready') })
  if (!handle) {
    // No WebGL (or the model failed): a still Ploob is better than a hole.
    canvas.remove()
    const img = new Image()
    img.src = heroFallback
    img.alt = 'Ploob, a jelly Ploobian'
    img.className = 'fallback'
    stage.prepend(img)
    stage.classList.add('ready')
    stage.querySelector('.hint')?.remove()
  }
}

paintEyes()
buildRegions()
buildDoors()
buildCompanions()
wireAppLinks()
wireHeader()
wireReveal()
wirePloob()
