/* Render budget.
 *
 * Prints draw calls, triangles and live mesh count at three speeds. Run it
 * before and after any change that adds objects to the world.
 *
 * Draw calls are the number that matters: every object here costs two — the
 * toon pass and its inverted-hull outline — and a mobile GPU starts to
 * struggle well before a thousand. The city overhaul took this from 1,137 to
 * 538 while making the street about eight times busier, by merging each
 * building and each obstacle into a single vertex-coloured geometry.
 *
 *     CHROMIUM_PATH=/path/to/chrome npm run budget
 */
const path=require('path');const {chromium}=require('playwright');const {serve}=require('./serve');
const L={args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],executablePath:process.env.CHROMIUM_PATH};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const s=await serve(path.resolve(__dirname,'..'),8799);const b=await chromium.launch(L);
const p=await b.newPage({viewport:{width:1280,height:720}});
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://127.0.0.1:8799/index.html',{waitUntil:'load'});
await p.waitForFunction('window.__PP_READY===true');
await p.keyboard.press('Space');
for (const [label, wait, speed] of [['start',3000,13],['mid',2000,24],['max',2000,33]]) {
  await sleep(wait);
  if (speed>13) await p.evaluate(v=>window.__PP_DEBUG.setSpeed(v), speed);
  await sleep(1200);
  const r = await p.evaluate('window.__PP_DEBUG.render()');
  const st = await p.evaluate('window.__PP_DEBUG.stats()');
  console.log(label.padEnd(6), 'calls', String(r.calls).padStart(5),
    ' tris', String(r.triangles).padStart(7),
    ' meshes', String(r.meshes).padStart(5),
    ' geos', String(r.geometries).padStart(5),
    ' obstacles', st.obstacles);
}
await b.close();process.exit(0);})();
