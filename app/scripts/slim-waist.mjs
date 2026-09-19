// Flatten the front of the waist band (the hoodie knot and belt pouches sit ahead of the chest).
const G='/home/claude/.npm-global/lib/node_modules/@gltf-transform/cli/node_modules';
const { NodeIO } = await import(`${G}/@gltf-transform/core/dist/index.js`);
const { ALL_EXTENSIONS } = await import(`${G}/@gltf-transform/extensions/dist/index.js`);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, dst, factor='0.68', y0='0.64', y1='1.0', z0='0.08'] = process.argv.slice(2);
const F=+factor, Y0=+y0, Y1=+y1, Z0=+z0;
const doc = await io.read(src);
const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
const v=[0,0,0]; let n=0;
const smooth=(t)=>t<=0?0:t>=1?1:t*t*(3-2*t);
for (let i=0;i<pos.getCount();i++){ pos.getElement(i,v);
  if (v[2] <= Z0 || v[1] < Y0 || v[1] > Y1) continue;
  // window: full effect mid-band, easing out over 6 cm at each edge
  const w = Math.min(smooth((v[1]-Y0)/0.06), smooth((Y1-v[1])/0.06));
  const f = 1 - (1-F)*w;
  v[2] = Z0 + (v[2]-Z0)*f; pos.setElement(i,v); n++; }
await io.write(dst, doc);
console.log('slimmed', n, 'vertices');
