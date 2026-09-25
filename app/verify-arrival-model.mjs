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
  for (const t of [5, 12, 20, 26]) {
    const h = 0.0001, before = arrivalPose(t - h), at = arrivalPose(t), after = arrivalPose(t + h)
    for (const key of ['plane', 'camera', 'look']) for (let axis = 0; axis < 3; axis++) {
      const incoming = (at[key][axis] - before[key][axis]) / h
      const outgoing = (after[key][axis] - at[key][axis]) / h
      assert.ok(Math.abs(incoming - outgoing) < 0.001, `continuous velocity: ${key}, ${axis}, ${t}s`)
    }
  }
  for (const t of [5, 12]) {
    const a = arrivalPose(t - 0.001).plane, b = arrivalPose(t + 0.001).plane
    assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) / 0.002 > 1, 'aircraft keeps moving through reveal waypoints')
  }
  const output = arrivalPose(0)
  assert.equal(arrivalPose(12, output), output, 'frame-loop output can be reused')
  assert.deepEqual(output, arrivalPose(12))
  assert.deepEqual(arrivalPose(30).plane, PLANE_DOCK)
  assert.deepEqual(arrivalPose(30).camera, dockCamera().camera)
  assert.deepEqual(arrivalPose(30).look, dockCamera().look)
  assert.deepEqual(arrivalPose(100), arrivalPose(30))
  assert.deepEqual(arrivalPose(-10), arrivalPose(0))
  assert.match(arrivalBeat(29).line, /path/)
  console.log('PASS route sampling, touchdown, continuous shots, exact dock handover, bounds and final clue')
} finally { rmSync(tmp, { recursive: true, force: true }) }
