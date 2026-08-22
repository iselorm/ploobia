import { chromium } from 'playwright'
const b = await chromium.launch({ args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
for (const [name, path] of [['module throws','/tmp/boot-broken.html'],['module never runs','/tmp/boot-gone.html'],['healthy','/tmp/w/repo/app/dist/index.html']]) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true })
  const p = await ctx.newPage()
  await p.goto('file://'+path, { waitUntil:'load' })
  await p.waitForTimeout(name==='healthy' ? 9000 : 14000)
  const vis = await p.evaluate(()=>{const s=document.getElementById('boot-shell');return s? (s.className==='gone'?'hidden':'showing'):'absent'})
  const failVisible = await p.evaluate(()=>{const f=document.getElementById('boot-fail');return f? !f.hidden : false})
  const why = await p.evaluate(()=>document.getElementById('boot-why')?.textContent||'')
  const detail = await p.evaluate(()=>document.getElementById('boot-detail')?.textContent||'')
  console.log(`\n== ${name} ==`)
  console.log('  shell:', vis, '| failure card:', failVisible)
  if (why) console.log('  why:', why.slice(0,150))
  if (detail) console.log('  detail:\n    ' + detail.split('\n').slice(0,9).join('\n    '))
  await p.screenshot({ path:`/tmp/arcade/shots/boot-${name.replace(/ /g,'-')}.png` })
  await ctx.close()
}
await b.close()
