/* End-to-end suite. Boots the real game in Chromium, drives it with real
 * input, and asserts on live state read back through window.__PP_DEBUG.
 *
 * Run with:  npm test
 *
 * These checks catch behaviour, not appearance. Every visual bug this project
 * has had — the character facing the wrong way, the clippers off-screen,
 * alopecia patches that never punched through — passed the whole suite while
 * broken. Use npm run capture and LOOK at the output when changing visuals.
 */
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./serve');

const PORT = 8777;
const URL = 'http://127.0.0.1:' + PORT + '/index.html';
const SHOTS = process.env.SHOTS || path.resolve(__dirname, '../.shots');
require('fs').mkdirSync(SHOTS, { recursive: true });

// Honour the preinstalled browser when there is one (CI images often set this)
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const LAUNCH = {
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
};
if (EXECUTABLE) LAUNCH.executablePath = EXECUTABLE;

const fail = [];
const ok = (c, m) => { console.log((c ? '  PASS  ' : '! FAIL  ') + m); if (!c) fail.push(m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = await serve(path.resolve(__dirname, '..'), PORT);
  const browser = await chromium.launch(LAUNCH);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [], pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(e.message));

  console.log('\n=== LOAD ===');
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__PP_READY === true', { timeout: 15000 }).catch(() => {});
  await sleep(1200);

  ok(await page.evaluate('window.__PP_READY === true'), 'game reaches __PP_READY');
  ok(pageErrors.length === 0, 'no uncaught page errors' + (pageErrors.length ? ': ' + pageErrors.join(' | ') : ''));
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0,3).join(' | ') : ''));

  const gl = await page.evaluate(() => {
    const c = document.querySelector('#game canvas');
    if (!c) return { ok: false, why: 'no canvas' };
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    return { ok: !!ctx, w: c.width, h: c.height };
  });
  ok(gl.ok && gl.w > 0, `live WebGL canvas (${gl.w}x${gl.h})`);
  await page.screenshot({ path: `${SHOTS}/01-title.png` });

  console.log('\n=== START RUN ===');
  await page.keyboard.press('Space');
  await sleep(600);
  let s = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(s.state === 'play', 'space starts the run (state=' + s.state + ')');
  ok(s.hair === 3, 'starts with full hair (3)');

  console.log('\n=== CHARACTER SELECT ===');
  ok(await page.evaluate(() => window.__PP_DEBUG.rosterCount()) >= 1, 'roster renders cards');
  ok((await page.evaluate(() => window.__PP_DEBUG.character())) === 'petty', 'Petty selected by default');
  const lockedRejected = await page.evaluate(() => {
    const before = window.__PP_DEBUG.character();
    window.__PP_DEBUG.pickCharacter('slot2');
    return window.__PP_DEBUG.character() === before;
  });
  ok(lockedRejected, 'locked slots cannot be selected');
  ok(await page.evaluate(() => !!document.querySelector('.char-card canvas')),
     'character card shows a drawn portrait');

  console.log('\n=== WASD CONTROLS ===');
  let lA = await page.evaluate(() => window.__PP_DEBUG.lane());
  await page.keyboard.press('a'); await sleep(280);
  let lB = await page.evaluate(() => window.__PP_DEBUG.lane());
  ok(lB === lA - 1, 'A moves left (' + lA + ' -> ' + lB + ')');
  await page.keyboard.press('d'); await sleep(280);
  let lC = await page.evaluate(() => window.__PP_DEBUG.lane());
  ok(lC === lB + 1, 'D moves right (' + lB + ' -> ' + lC + ')');
  await page.keyboard.press('d'); await sleep(280);
  await page.keyboard.press('d'); await sleep(280);
  ok((await page.evaluate(() => window.__PP_DEBUG.lane())) === 2, 'D stops at the right edge');
  await page.keyboard.press('a'); await sleep(320);

  await page.keyboard.press('w'); await sleep(200);
  const wy = await page.evaluate(() => window.__PP_DEBUG.playerY());
  ok(wy > 0.3, 'W jumps (y=' + wy + ')');
  await sleep(900);

  await page.keyboard.press('s'); await sleep(150);
  ok((await page.evaluate(() => window.__PP_DEBUG.sliding())) === true, 'S slides');
  await sleep(700);

  console.log('\n=== FRAMING ===');
  const dfov = await page.evaluate(() => window.__PP_DEBUG.fov());
  ok(dfov >= 43 && dfov <= 60, 'desktop FOV stays sane (' + dfov + ')');
  const camZ = await page.evaluate(() => window.__PP_DEBUG.camZ());
  ok(camZ > 0, 'camera trails the player, over-the-shoulder (z=' + camZ + ')');
  const facing = await page.evaluate(() => window.__PP_DEBUG.facingCamera());
  ok(facing < -0.8, 'player runs away from the camera (dot=' + facing + ')');

  console.log('\n=== MUSIC ===');
  ok(await page.evaluate(() => window.__PP_DEBUG.musicPlaying()), 'music plays during a run');
  await page.keyboard.press('p'); await sleep(250);
  ok(!(await page.evaluate(() => window.__PP_DEBUG.musicPlaying())), 'music stops on pause');
  await page.keyboard.press('p'); await sleep(250);
  ok(await page.evaluate(() => window.__PP_DEBUG.musicPlaying()), 'music resumes on unpause');

  console.log('\n=== CLIPPERS NEVER COVER HIM ===');
  // At full menace the clippers must stay clear of the player in screen space,
  // since occluding him is exactly what this layout exists to prevent.
  await page.evaluate(() => window.__PP_DEBUG.setMenace(0.98));
  await sleep(1400);
  const sep = await page.evaluate(() => window.__PP_DEBUG.clipperGap());
  ok(sep > 0.06, 'clippers stay clear of the player at full menace (gap=' + sep + ')');

  console.log('\n=== LOOK-BACK ===');
  // He should glance over his shoulder at the clippers and come back round.
  {
    let minYaw = 0, maxYaw = -9;
    for (let i = 0; i < 30; i++) {
      const y = await page.evaluate(() => window.__PP_DEBUG.headYaw());
      minYaw = Math.min(minYaw, y); maxYaw = Math.max(maxYaw, y);
      await sleep(350);
    }
    ok(minYaw < -1.5, 'glances back over his shoulder (min yaw ' + minYaw.toFixed(2) + ')');
    ok(maxYaw > -0.3, 'and returns to facing forward (max yaw ' + maxYaw.toFixed(2) + ')');
    ok(minYaw < 0, 'turns toward the side the clippers hunt from');
  }

  console.log('\n=== DRIVE A REAL RUN ===');
  const keys = ['a','w','d','w','s','a','w','d','s','w','a','w'];
  for (const k of keys) { await page.keyboard.press(k); await sleep(420); }
  await sleep(1500);
  const mid = await page.evaluate('window.__PP_DEBUG.stats()');
  console.log('  stats: ' + JSON.stringify(mid));
  ok(mid.metres > 20, 'player travels distance (' + mid.metres + 'm)');
  ok(mid.score > 0, 'score accumulates (' + mid.score + ')');
  ok(mid.speed > 13, 'speed ramps up (' + mid.speed + ')');
  ok(mid.obstacles > 0, 'obstacles are streaming (' + mid.obstacles + ')');
  ok(mid.pickups > 0, 'pickups are streaming (' + mid.pickups + ')');
  await page.screenshot({ path: `${SHOTS}/02-run.png` });

  console.log('\n=== PICKUPS ===');
  const before = await page.evaluate('window.__PP_DEBUG.stats()');
  await page.evaluate('window.__PP_DEBUG.givePickup("tuft")');
  const afterTuft = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(afterTuft.score > before.score, 'tuft raises score');

  await page.evaluate('window.__PP_DEBUG.givePickup("pomade")');
  const shielded = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(shielded.shield > 5, 'pomade grants a shield (' + shielded.shield + 's)');

  console.log('\n=== SHIELD EATS A HIT ===');
  await page.evaluate('window.__PP_DEBUG.forceSnip()');
  const afterShieldHit = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(afterShieldHit.hair === 3, 'shielded snip costs no hair (hair=' + afterShieldHit.hair + ')');
  ok(afterShieldHit.shield === 0, 'shield is consumed');

  console.log('\n=== SNIP COSTS EXACTLY ONE HAIR STAGE ===');
  await page.evaluate('window.__PP_DEBUG.forceSnip()');
  await sleep(120);
  const snip1 = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(snip1.hair === 2, 'first snip: 3 -> 2 (got ' + snip1.hair + ')');
  await page.screenshot({ path: `${SHOTS}/03-snipped.png` });

  await page.evaluate('window.__PP_DEBUG.forceSnip()');
  await sleep(120);
  const snip2 = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(snip2.hair === 1, 'second snip: 2 -> 1 (got ' + snip2.hair + ')');

  console.log('\n=== SERUM HEALS ===');
  await page.evaluate('window.__PP_DEBUG.givePickup("serum")');
  const healed = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(healed.hair === 2, 'serum restores one stage (got ' + healed.hair + ')');

  console.log('\n=== BALD = GAME OVER ===');
  await page.evaluate('window.__PP_DEBUG.forceSnip()');
  await sleep(100);
  await page.evaluate('window.__PP_DEBUG.forceSnip()');
  await sleep(700);
  const over = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(over.state === 'over', 'zero hair ends the run (state=' + over.state + ')');
  ok(over.hair === 0, 'hair is 0');
  const overVisible = await page.evaluate(() => document.getElementById('screenOver').classList.contains('on'));
  ok(overVisible, 'game over screen is shown');
  const deathLine = await page.evaluate(() => document.getElementById('deathLine').textContent.trim());
  ok(deathLine.length > 0, 'death line rendered: "' + deathLine + '"');
  ok(over.best > 0, 'best score recorded (' + over.best + ')');
  await page.screenshot({ path: `${SHOTS}/04-gameover.png` });

  console.log('\n=== RETRY ===');
  await page.keyboard.press('Space');
  await sleep(500);
  const retry = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(retry.state === 'play' && retry.hair === 3 && retry.metres < 30, 'retry resets cleanly');

  console.log('\n=== PAUSE ===');
  await page.keyboard.press('p');
  await sleep(250);
  ok((await page.evaluate('window.__PP_DEBUG.state()')) === 'pause', 'P pauses');
  await page.keyboard.press('p');
  await sleep(250);
  ok((await page.evaluate('window.__PP_DEBUG.state()')) === 'play', 'P resumes');

  console.log('\n=== PERSISTENCE ===');
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('pp.best')));
  ok(typeof best === 'number' && best > 0, 'best score persisted to localStorage (' + best + ')');

  console.log('\n=== MOBILE 390x844 ===');
  const mp = await browser.newPage({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
  });
  const mErr = [];
  mp.on('pageerror', e => mErr.push(e.message));
  await mp.goto(URL, { waitUntil: 'load' });
  await mp.waitForFunction('window.__PP_READY === true', { timeout: 15000 }).catch(() => {});
  await sleep(900);
  ok(await mp.evaluate('window.__PP_READY === true'), 'mobile viewport boots');
  ok(mErr.length === 0, 'no mobile page errors' + (mErr.length ? ': ' + mErr.join(' | ') : ''));
  const noHScroll = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(noHScroll, 'no horizontal overflow on phone width');
  const mfov = await mp.evaluate(() => window.__PP_DEBUG.fov());
  ok(mfov > 70, 'phone widens the FOV so lanes stay in frame (' + mfov + ')');
  await mp.screenshot({ path: `${SHOTS}/05-mobile-title.png` });

  // Swipe to start + play (dispatch real touch events; the overlay covers #game)
  const touchAt = async (pg, pts) => pg.evaluate((pts) => {
    const el = document.elementFromPoint(pts[0].x, pts[0].y) || document.body;
    const mk = (type, x, y) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, {
        changedTouches: [t], touches: type === 'touchend' ? [] : [t],
        bubbles: true, cancelable: true
      }));
    };
    mk('touchstart', pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) mk('touchmove', pts[i].x, pts[i].y);
    mk('touchend', pts[pts.length - 1].x, pts[pts.length - 1].y);
  }, pts);

  await touchAt(mp, [{ x: 195, y: 700 }, { x: 195, y: 700 }]);
  await sleep(700);
  const mState = await mp.evaluate('window.__PP_DEBUG.stats()');
  ok(mState.state === 'play', 'tap starts the run on touch (state=' + mState.state + ')');
  // Swipe up = jump
  const beforeJump = await mp.evaluate('window.__PP_DEBUG.stats()');
  await touchAt(mp, [{ x: 195, y: 640 }, { x: 195, y: 560 }, { x: 195, y: 480 }, { x: 195, y: 470 }]);
  await sleep(160);
  const jumped = await mp.evaluate(() => window.__PP_DEBUG.playerY ? window.__PP_DEBUG.playerY() : null);
  ok(jumped === null || jumped > 0.2, 'swipe up makes the player jump (y=' + jumped + ')');

  // Swipe left = lane change
  const laneBefore = await mp.evaluate(() => window.__PP_DEBUG.lane());
  await touchAt(mp, [{ x: 250, y: 600 }, { x: 180, y: 600 }, { x: 120, y: 600 }, { x: 110, y: 600 }]);
  await sleep(300);
  const laneAfter = await mp.evaluate(() => window.__PP_DEBUG.lane());
  ok(laneAfter < laneBefore, 'swipe left changes lane (' + laneBefore + ' -> ' + laneAfter + ')');

  await sleep(800);
  const mRun = await mp.evaluate('window.__PP_DEBUG.stats()');
  ok(mRun.metres > 5, 'mobile run advances (' + mRun.metres + 'm)');
  await sleep(2500);
  await mp.screenshot({ path: `${SHOTS}/06-mobile-run.png` });

  console.log('\n=== FILE:// (no server) ===');
  /* The artwork is baked in as data URIs specifically so the game keeps
   * working when opened straight off disk — a file:// page treats every file
   * as its own origin, so a fetched image would taint the canvases the
   * portrait card draws on. This check is what stops that regressing. */
  {
    const fp = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const fpErr = [];
    fp.on('pageerror', (e) => fpErr.push(e.message));
    fp.on('console', (m) => { if (m.type() === 'error') fpErr.push('console: ' + m.text()); });
    const fileUrl = 'file://' + path.resolve(__dirname, '../index.html');
    await fp.goto(fileUrl, { waitUntil: 'load' });
    const booted = await fp.waitForFunction('window.__PP_READY === true', { timeout: 20000 })
      .then(() => true).catch(() => false);
    await sleep(2000);
    ok(booted, 'boots with no server, straight off disk');
    ok(fpErr.length === 0, 'no errors from file://' + (fpErr.length ? ': ' + fpErr.slice(0, 2).join(' | ') : ''));
    ok(await fp.evaluate(() => !!document.querySelector('.char-card canvas')),
       'character card still renders from file://');
    await fp.keyboard.press('Space');
    await sleep(1500);
    ok((await fp.evaluate(() => window.__PP_DEBUG.stats().state)) === 'play', 'and plays from file://');
    await fp.close();
  }

  console.log('\n=== ERROR TOTALS ===');
  ok(pageErrors.length === 0, 'zero uncaught errors across whole session');

  await browser.close();
  server.close();
  console.log('\n' + (fail.length ? `FAILURES (${fail.length}):\n - ` + fail.join('\n - ') : 'ALL CHECKS PASSED'));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
