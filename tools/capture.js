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
    window.__PP_DEBUG.faceForward();
    document.getElementById('hud').style.display = 'none';
  });
  for (const [angle, name] of [[180, 'front'], [135, 'front34'], [90, 'side'], [0, 'back']]) {
    await p.evaluate((a) => {
      window.__PP_DEBUG.faceForward();
      window.__PP_DEBUG.poseCam(a, 6.4, 1.75, 1.4);
    }, angle);
    await sleep(450);
    await p.screenshot({ path: `${SHOTS}/turn-${name}.png` });
  }
  console.log('turn-{front,front34,side,back}.png');
  await p.close();

  /* --- Head orbit ---------------------------------------------------------
   *
   * Eight frames at 45 degrees, head filling the frame. This is the sheet
   * that answers "does it read as one thing" — the turnaround is framed too
   * wide to show a seam, which is how a head made of three unrelated
   * photographs shipped in the first place.
   */
  p = await open(320, 320, 2);
  await p.keyboard.press('Space');
  await sleep(1500);
  await p.evaluate(() => {
    window.__PP_DEBUG.hideWorld();
    document.getElementById('hud').style.display = 'none';
  });
  for (let i = 0; i < 8; i++) {
    await p.evaluate((a) => {
      window.__PP_DEBUG.faceForward();
      window.__PP_DEBUG.poseCam(a, 2.5, 2.02, 2.02);
    }, i * 45);
    await sleep(320);
    await p.screenshot({ path: `${SHOTS}/head-${i}.png` });
  }
  console.log('head-0..7.png');
  await p.close();

  /* --- Stride strips -----------------------------------------------------
   *
   * A run cycle cannot be judged from one frame. These walk the whole cycle
   * at eight even phases, from the side (where the leg and arm swing read)
   * and from three-quarter behind (the angle actually played). Two speeds,
   * because cadence and lean both move with it.
   */
  for (const [speed, tag] of [[13, 'slow'], [33, 'fast']]) {
    for (const [angle, view] of [[90, 'side'], [35, 'back34']]) {
      p = await open(340, 460, 2);
      await p.keyboard.press('Space');
      await sleep(1200);
      await p.evaluate(() => {
        window.__PP_DEBUG.hideWorld();
        document.getElementById('hud').style.display = 'none';
      });
      for (let i = 0; i < 8; i++) {
        await p.evaluate(([a, u, sp]) => {
          window.__PP_DEBUG.poseCam(a, 6.8, 1.8, 1.25);
          window.__PP_DEBUG.stridePose(u, sp);
        }, [angle, i / 8, speed]);
        await sleep(160);
        await p.screenshot({ path: `${SHOTS}/stride-${tag}-${view}-${i}.png` });
      }
      await p.close();
    }
  }
  console.log('stride-{slow,fast}-{side,back34}-0..7.png');

  /* --- Landing sequence ---------------------------------------------------
   *
   * Deliberately NOT poseCam'd: freezing the camera also pauses the game, and
   * a landing has to actually happen. The world stays visible because the
   * ground is the reference you are judging the squash against; the chase
   * camera is just pulled in close so he is big enough to read.
   */
  p = await open(420, 460, 2);
  await p.keyboard.press('Space');
  await sleep(1200);
  await p.evaluate(() => {
    PP.CFG.CAM_BACK = 5.0;
    PP.CFG.CAM_HEIGHT = 2.6;
    PP.CFG.CAM_LOOK_AHEAD = 5;
    document.getElementById('hud').style.display = 'none';
  });
  await sleep(700);
  await p.keyboard.press('Space');
  for (let i = 0; i < 10; i++) {
    await sleep(70);
    await p.screenshot({ path: `${SHOTS}/land-${i}.png` });
  }
  console.log('land-0..9.png');
  await p.close();

  // --- In-game, at the speeds actually played -----------------------------
  for (const [speed, tag] of [[13, 'start'], [24, 'mid'], [33, 'max']]) {
    p = await open(900, 560);
    await p.keyboard.press('Space');
    await sleep(2500);
    await p.evaluate((sp) => window.__PP_DEBUG.setSpeed(sp), speed);
    await sleep(900);
    await p.screenshot({ path: `${SHOTS}/play-${tag}.png` });
    await p.close();
  }
  console.log('play-{start,mid,max}.png');

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

  /* --- The head wrap, flat ------------------------------------------------
   *
   * One texture now, not three. Reading it unrolled is the quickest way to
   * see whether the artwork is blending into the painted skin or still
   * sitting on it as a rectangle, and whether the two halves of the nape
   * meet at the edges — that join is the head's only seam.
   */
  p = await open(1100, 620);
  await p.keyboard.press('Space');
  await sleep(1800);
  await p.evaluate(() => {
    const tex = PP.Face.headWrap();
    document.body.innerHTML = '';
    document.body.style.cssText = 'background:#f4efe4;padding:12px;margin:0;font:700 13px sans-serif';
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    c.style.cssText = 'border:2px solid #141013;display:block;width:1050px;height:525px';
    const g = c.getContext('2d');
    g.drawImage(tex.image, 0, 0);
    // Mark where the front, sides and seam land
    g.strokeStyle = '#d94a4a'; g.lineWidth = 3;
    [[512, 'FRONT'], [256, 'HIS RIGHT'], [768, 'HIS LEFT']].forEach(([x, label]) => {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 512); g.stroke();
      g.fillStyle = '#d94a4a'; g.font = 'bold 18px sans-serif';
      g.fillText(label, x + 6, 22);
    });
    g.fillText('SEAM', 6, 500);
    document.body.appendChild(c);
    const t = document.createElement('div');
    t.textContent = 'HEAD WRAP — equirectangular, seam at the back of the skull';
    t.style.paddingTop = '6px';
    document.body.appendChild(t);
  });
  await sleep(400);
  await p.screenshot({ path: `${SHOTS}/textures.png` });
  console.log('textures.png');
  await p.close();

  await browser.close();
  server.close();
  console.log('\nWritten to ' + SHOTS + ' — now actually look at them.');
})().catch((e) => { console.error(e); process.exit(1); });
