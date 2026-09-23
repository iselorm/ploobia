// Narrow the pelvis band all round (x and z) so the hips stop dominating the front view.
const G='/home/claude/.npm-global/lib/node_modules/@gltf-transform/cli/node_modules';
const { NodeIO } = await import(`${G}/@gltf-transform/core/dist/index.js`);
const { ALL_EXTENSIONS } = await import(`${G}/@gltf-transform/extensions/dist/index.js`);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [src, dst, fx='0.92', fz='0.9', y0='0.55', y1='0.9'] = process.argv.slice(2);
const doc = await io.read(src);
const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION');
const v=[0,0,0]; let n=0; const smooth=(t)=>t<=0?0:t>=1?1:t*t*(3-2*t);
for (let i=0;i<pos.getCount();i++){ pos.getElement(i,v);
  if (v[1] < +y0 || v[1] > +y1) continue;
  if (Math.abs(v[0]) > 0.19) continue; // leave the hands alone
  const w = Math.min(smooth((v[1]-y0)/0.07), smooth((y1-v[1])/0.07));
  v[0] *= 1-(1-+fx)*w; v[2] *= 1-(1-+fz)*w; pos.setElement(i,v); n++; }
await io.write(dst, doc); console.log('narrowed', n);
