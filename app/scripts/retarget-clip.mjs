// World-space retarget: move a clip from one Meshy re-rig onto the idle rig.
// Same mesh, same A-pose, different bone frames — so per bone we take the
// world-rotation delta the source clip applies to the source bind pose and
// apply that delta to our bind pose, then express it locally.
// Usage: node scripts/retarget-clip.mjs <source-rig.glb> <out.glb> <clipName> [nohips] [--idle raw/explorer.glb] [--lean <deg>]
// The walk ships with --lean 18 (chest and shoulders ahead of the waist, head level).
// Needs @gltf-transform/core, /extensions, /functions (npm i -g @gltf-transform/cli puts them
// under the CLI's node_modules; set GLTFT to that path) and three from this app.
const G = process.env.GLTFT ?? '/home/claude/.npm-global/lib/node_modules/@gltf-transform/cli/node_modules';
const { NodeIO, Document, Accessor } = await import(`${G}/@gltf-transform/core/dist/index.js`);
const { ALL_EXTENSIONS } = await import(`${G}/@gltf-transform/extensions/dist/index.js`);
const { prune } = await import(`${G}/@gltf-transform/functions/dist/index.js`);
import * as THREE from 'three';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, dst, clipName, opts] = [process.argv[2], process.argv[3], process.argv[4], process.argv[5] || ''];
// --lean <deg>: extra forward pitch of the torso, spread up the spine (chest and
// shoulders ahead of the waist, the head brought back level). World space, about
// the rig's right axis (+X; the rig faces +Z).
const leanIdx = process.argv.indexOf('--lean');
const LEAN = leanIdx > 0 ? Number(process.argv[leanIdx + 1]) : 0;
const LEAN_SHARE = { Hips: -0.15, Spine02: 0.35, Spine01: 0.35, Spine: 0.3, neck: -0.25, Head: -0.35 };
const FPS = 30;

function skeleton(doc) {
  const nodes = doc.getRoot().listNodes();
  const parent = new Map();
  for (const n of nodes) for (const c of n.listChildren()) parent.set(c, n);
  return { nodes, parent };
}
function structuralRename(doc) {
  const root = doc.getRoot();
  const byName = (n) => root.listNodes().find(x => x.getName() === n);
  const hips = byName('Hips');
  const a = hips.listChildren().find(c => !/Leg/.test(c.getName())); a.setName('Spine02');
  const b = a.listChildren()[0]; b.setName('Spine01');
  const spine = b.listChildren()[0]; spine.setName('Spine');
  const c = spine.listChildren().find(x => !/Shoulder/.test(x.getName())); c.setName('neck');
  c.listChildren()[0].setName('Head');
}
// sample a channel at time t
function sampleRot(ch, t) {
  const inp = ch.getSampler().getInput(), out = ch.getSampler().getOutput();
  const n = inp.getCount(); const ts = []; for (let i=0;i<n;i++) ts.push(inp.getScalar(i));
  let i1 = ts.findIndex(x => x >= t); if (i1 < 0) i1 = n - 1; const i0 = Math.max(0, i1 - 1);
  const q0 = new THREE.Quaternion().fromArray(out.getElement(i0, [0,0,0,0]));
  const q1 = new THREE.Quaternion().fromArray(out.getElement(i1, [0,0,0,0]));
  const f = i1 === i0 ? 0 : (t - ts[i0]) / (ts[i1] - ts[i0]);
  return q0.slerp(q1, THREE.MathUtils.clamp(f, 0, 1));
}
function sampleVec(ch, t) {
  const inp = ch.getSampler().getInput(), out = ch.getSampler().getOutput();
  const n = inp.getCount(); const ts = []; for (let i=0;i<n;i++) ts.push(inp.getScalar(i));
  let i1 = ts.findIndex(x => x >= t); if (i1 < 0) i1 = n - 1; const i0 = Math.max(0, i1 - 1);
  const v0 = new THREE.Vector3().fromArray(out.getElement(i0, [0,0,0]));
  const v1 = new THREE.Vector3().fromArray(out.getElement(i1, [0,0,0]));
  const f = i1 === i0 ? 0 : (t - ts[i0]) / (ts[i1] - ts[i0]);
  return v0.lerp(v1, THREE.MathUtils.clamp(f, 0, 1));
}
// world rotation of every node given local rotations (Map name->Quaternion) and bind translations
function worldRots(sk, localRot) {
  const world = new Map();
  const visit = (n) => {
    if (world.has(n)) return world.get(n);
    const p = sk.parent.get(n);
    const pw = p ? visit(p) : new THREE.Quaternion();
    const lr = localRot.get(n.getName()) ?? new THREE.Quaternion().fromArray(n.getRotation());
    const w = pw.clone().multiply(lr);
    world.set(n, w); return w;
  };
  for (const n of sk.nodes) visit(n);
  return world;
}

const srcDoc = await io.read(src); structuralRename(srcDoc);
const idleIdx = process.argv.indexOf('--idle');
const ourDoc = await io.read(idleIdx > 0 ? process.argv[idleIdx + 1] : 'raw/explorer.glb');
const srcSk = skeleton(srcDoc), ourSk = skeleton(ourDoc);
const anim = srcDoc.getRoot().listAnimations()[0];
const rotCh = new Map(); for (const ch of anim.listChannels()) if (ch.getTargetPath() === 'rotation') rotCh.set(ch.getTargetNode().getName(), ch);
const hipsT = anim.listChannels().find(ch => ch.getTargetPath() === 'translation' && ch.getTargetNode().getName() === 'Hips');
let duration = 0; for (const ch of anim.listChannels()) { const inp = ch.getSampler().getInput(); duration = Math.max(duration, inp.getScalar(inp.getCount()-1)); }
const srcBindW = worldRots(srcSk, new Map());
const ourBindW = worldRots(ourSk, new Map());
const ourByName = new Map(ourSk.nodes.map(n => [n.getName(), n]));
const srcByName = new Map(srcSk.nodes.map(n => [n.getName(), n]));

const times = []; for (let t = 0; t <= duration + 1e-6; t += 1 / FPS) times.push(Math.min(t, duration));
const outRot = new Map(); // name -> flat quaternion array
const outHips = [];
const hipsBind = new THREE.Vector3().fromArray(ourByName.get('Hips').getTranslation());
const srcHipsBind = new THREE.Vector3().fromArray(srcByName.get('Hips').getTranslation());
for (const t of times) {
  const local = new Map(); for (const [name, ch] of rotCh) local.set(name, sampleRot(ch, t));
  const srcW = worldRots(srcSk, local);
  // our world rotations this frame, parents first
  const ourW = new Map();
  const order = []; const visit = (n) => { if (order.includes(n)) return; const p = ourSk.parent.get(n); if (p) visit(p); order.push(n); }; for (const n of ourSk.nodes) visit(n);
  for (const n of order) {
    const name = n.getName(); const s = srcByName.get(name); const p = ourSk.parent.get(n);
    const pw = p ? ourW.get(p) : new THREE.Quaternion();
    let w;
    if (s && rotCh.has(name)) {
      const delta = srcW.get(s).clone().multiply(srcBindW.get(s).clone().invert());
      w = delta.multiply(ourBindW.get(n));
      if (LEAN && LEAN_SHARE[name]) {
        // accumulate: each bone's world rotation gets the sum of shares below it
        const chain = ['Hips','Spine02','Spine01','Spine','neck','Head'];
        let acc = 0; for (const b of chain) { acc += LEAN_SHARE[b] ?? 0; if (b === name) break; }
        const extra = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), THREE.MathUtils.degToRad(LEAN * acc));
        w = extra.multiply(w);
      }
    } else {
      w = pw.clone().multiply(new THREE.Quaternion().fromArray(n.getRotation()));
    }
    ourW.set(n, w);
    if (s && rotCh.has(name)) {
      const lr = pw.clone().invert().multiply(w).normalize();
      if (!outRot.has(name)) outRot.set(name, []);
      outRot.get(name).push(lr.x, lr.y, lr.z, lr.w);
    }
  }
  if (hipsT && !opts.includes('nohips')) {
    const d = sampleVec(hipsT, t).sub(srcHipsBind); // source-space offset; both rigs share the mesh's units and the world y-up
    outHips.push(hipsBind.x + d.x, hipsBind.y + d.y, hipsBind.z + d.z);
  }
}

// Build the output: our skeleton (no mesh) + one animation
const out = new Document(); out.getRoot().getAsset().generator = 'ploobia retarget';
const buf = out.createBuffer();
const copy = new Map();
const mk = (n) => { const m = out.createNode(n.getName()).setTranslation(n.getTranslation()).setRotation(n.getRotation()).setScale(n.getScale()); copy.set(n, m); return m; };
for (const n of ourSk.nodes) if (n.getName() !== 'char1') mk(n);
for (const n of ourSk.nodes) { const p = ourSk.parent.get(n); if (p && copy.has(n) && copy.has(p)) copy.get(p).addChild(copy.get(n)); }
const scene = out.createScene('Scene'); for (const n of ourSk.nodes) if (copy.has(n) && !ourSk.parent.get(n)) scene.addChild(copy.get(n));
const timeAcc = out.createAccessor('t').setType(Accessor.Type.SCALAR).setArray(new Float32Array(times)).setBuffer(buf);
const a = out.createAnimation(clipName);
for (const [name, arr] of outRot) {
  const acc = out.createAccessor(name + '.r').setType(Accessor.Type.VEC4).setArray(new Float32Array(arr)).setBuffer(buf);
  const s = out.createAnimationSampler().setInput(timeAcc).setOutput(acc).setInterpolation('LINEAR');
  const c = out.createAnimationChannel().setTargetNode(copy.get(ourByName.get(name))).setTargetPath('rotation').setSampler(s);
  a.addSampler(s).addChannel(c);
}
if (outHips.length) {
  const acc = out.createAccessor('Hips.t').setType(Accessor.Type.VEC3).setArray(new Float32Array(outHips)).setBuffer(buf);
  const s = out.createAnimationSampler().setInput(timeAcc).setOutput(acc).setInterpolation('LINEAR');
  a.addSampler(s).addChannel(out.createAnimationChannel().setTargetNode(copy.get(ourByName.get('Hips'))).setTargetPath('translation').setSampler(s));
}
await out.transform(prune());
await io.write(dst, out);
console.log(dst, 'frames', times.length, 'bones', outRot.size, 'duration', duration.toFixed(2), 'hips', outHips.length ? 'yes' : 'no');
