/* Visual capture. Renders the views that automated assertions can't judge —
 * a character turnaround, the hair-loss stages, the chase at several menace
 * levels, and the raw head textures — into .shots/ so they can be looked at.
 *
 * Run with:  npm run capture
 *
 * This exists because every visual regression in this project's history
 * passed the test suite. Assertions prove the game runs; only looking proves
 * it looks right.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { serve } = require('./serve');

const PORT = 8778;
const URL = 'http://127.0.0.1:' + PORT + '/index.html';
const SHOTS = process.env.SHOTS || path.resolve(__dirname, '../.shots');
const LAUNCH = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] };
if (process.env.CHROMIUM_PATH) LAUNCH.executablePath = process.env.CHROMIUM_PATH;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve(path.resolve(__dirname, '..'), PORT);
  const browser = await chromium.launch(LAUNCH);

  const open = async (w, h, scale) => {
    const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale || 1 });
    p.on('pageerror', (e) => console.log('  ERROR:', e.message));
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForFunction('window.__PP_READY === true', { timeout: 20000 });
    return p;
  };

  // --- Title screen, with the character select panel ---------------------
  let p = await open(1100, 900);
  await sleep(1000);
  await p.screenshot({ path: `${SHOTS}/title.png` });
  console.log('title.png');
  await p.close();

  // --- Turnaround --------------------------------------------------------
  p = await open(420, 620, 2);
  await p.keyboard.press('Space');
  await sleep(1500);
  await p.evaluate(() => {
    window.__PP_DEBUG.hideWorld();
    document.getElementById('hud').style.display = 'none';
  });
  for (const [angle, name] of [[180, 'front'], [135, 'front34'], [90, 'side'], [0, 'back']]) {
    await p.evaluate((a) => window.__PP_DEBUG.poseCam(a, 6.4, 1.7, 1.35), angle);
    await sleep(450);
    await p.screenshot({ path: `${SHOTS}/turn-${name}.png` });
  }
  console.log('turn-{front,front34,side,back}.png');
  await p.close();

  // --- Hair stages -------------------------------------------------------
  p = await open(520, 520);
  await p.keyboard.press('Space');
  await sleep(1200);
  for (const stage of [3, 2, 1, 0]) {
    await p.evaluate((st) => { window.__PP_DEBUG.setHair(st); window.__PP_DEBUG.headCam(); }, stage);
    await sleep(500);
    await p.screenshot({ path: `${SHOTS}/hair-${stage}.png` });
  }
  console.log('hair-{3,2,1,0}.png');
  await p.close();

  // --- The chase at several pressure levels ------------------------------
  p = await open(1000, 640);
  await p.keyboard.press('Space');
  await sleep(7000);
  for (const m of [0, 0.5, 0.95]) {
    await p.evaluate((v) => window.__PP_DEBUG.setMenace(v), m);
    await sleep(1600);
    await p.screenshot({ path: `${SHOTS}/menace-${m}.png` });
  }
  console.log('menace-{0,0.5,0.95}.png');
  await p.close();

  // --- Raw head textures --------------------------------------------------
  p = await open(1100, 400);
  await p.evaluate(() => {
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#f4efe4;display:flex;gap:10px;padding:10px;margin:0';
    const add = (tex, label) => {
      const wrap = document.createElement('div');
      const c = document.createElement('canvas');
      c.width = 340; c.height = 340;
      c.style.cssText = 'border:2px solid #141013;display:block';
      c.getContext('2d').drawImage(tex.image, 0, 0, 340, 340);
      const t = document.createElement('div');
      t.textContent = label;
      t.style.cssText = 'font:700 13px sans-serif;text-align:center;padding-top:4px';
      wrap.appendChild(c); wrap.appendChild(t);
      document.body.appendChild(wrap);
    };
    add(PP.Face.get('panic'), 'FRONT');
    add(PP.Face.side(), 'SIDE');
    add(PP.Face.back(), 'BACK');
  });
  await sleep(400);
  await p.screenshot({ path: `${SHOTS}/textures.png` });
  console.log('textures.png');
  await p.close();

  await browser.close();
  server.close();
  console.log('\nWritten to ' + SHOTS + ' — now actually look at them.');
})().catch((e) => { console.error(e); process.exit(1); });
