import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
const tmp = mkdtempSync(path.join(os.tmpdir(), 'ploobia-arrival-'))
try {
  execFileSync(path.resolve('node_modules/.bin/esbuild'), ['src/lib/arrival.ts', '--bundle', '--format=esm', `--outfile=${tmp}/arrival.mjs`], { stdio: 'pipe' })
  const { arrivalPose, arrivalBeat, ARRIVAL_SECONDS, PLANE_DOCK, dockCamera } = await import(`${tmp}/arrival.mjs`)
  for (let t = 0; t <= ARRIVAL_SECONDS; t += 0.05) {
    const p = arrivalPose(t)
    assert.ok([...p.plane, ...p.camera, ...p.look].every(Number.isFinite))
    assert.ok(p.plane[1] >= -0.10001, 'floats never sink below the landing waterline')
    if (t < 19.5) assert.ok(p.plane[1] > -0.1, 'touchdown follows the descent')
  }
  for (const t of [5, 12, 20, 26]) {
    const a = arrivalPose(t - 0.001), b = arrivalPose(t + 0.001)
    for (const key of ['plane', 'camera', 'look']) assert.ok(Math.hypot(...a[key].map((v, i) => v - b[key][i])) < 0.01, `continuous ${key} at ${t}s`)
  }
  assert.deepEqual(arrivalPose(30).plane, PLANE_DOCK)
  assert.deepEqual(arrivalPose(30).camera, dockCamera().camera)
  assert.deepEqual(arrivalPose(30).look, dockCamera().look)
  assert.deepEqual(arrivalPose(100), arrivalPose(30))
  assert.deepEqual(arrivalPose(-10), arrivalPose(0))
  assert.match(arrivalBeat(29).line, /path/)
  console.log('PASS route sampling, touchdown, continuous shots, exact dock handover, bounds and final clue')
} finally { rmSync(tmp, { recursive: true, force: true }) }
