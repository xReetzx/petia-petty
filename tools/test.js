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
  /* Wait for the landing rather than sleeping a fixed time. Under the
   * software renderer the frame rate is low and dt is clamped, so game time
   * runs slower than wall time — a fixed sleep here was within one frame of
   * failing, and a jump-tuning change duly tipped it over. */
  await page.waitForFunction('window.__PP_DEBUG.airborne() === false', { timeout: 5000 });
  await sleep(120);

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
    /* Sampled per animation frame inside the page, not on a wall-clock sleep.
     * The glance cycle runs on GAME time, and with dt clamped to 1/30 a busy
     * scene on a software renderer advances game time well behind the wall —
     * so fixed sleeps walk off the end of the cycle and miss the forward
     * phase. Sampling frames tracks the cycle no matter how slowly it runs. */
    const yaws = await page.evaluate(async () => {
      const out = [];
      for (let i = 0; i < 420; i++) {
        out.push(window.__PP_DEBUG.headYaw());
        await new Promise(r => requestAnimationFrame(r));
      }
      return out;
    });
    minYaw = Math.min(...yaws); maxYaw = Math.max(...yaws);
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
  // No shield, or a snip is absorbed instead of costing hair. The street is
  // dense enough now that a pomade can be collected mid-run by accident.
  await page.evaluate('window.__PP_DEBUG.clearShield()');
  await page.evaluate('window.__PP_DEBUG.forceSnip()');
  await sleep(120);
  const snip1 = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(snip1.hair === 2, 'first snip: 3 -> 2 (got ' + snip1.hair + ')');
  await page.screenshot({ path: `${SHOTS}/03-snipped.png` });

  await page.evaluate('window.__PP_DEBUG.clearShield()');
  await page.evaluate('window.__PP_DEBUG.forceSnip()');
  await sleep(120);
  const snip2 = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(snip2.hair === 1, 'second snip: 2 -> 1 (got ' + snip2.hair + ')');

  console.log('\n=== SERUM HEALS ===');
  await page.evaluate('window.__PP_DEBUG.givePickup("serum")');
  const healed = await page.evaluate('window.__PP_DEBUG.stats()');
  ok(healed.hair === 2, 'serum restores one stage (got ' + healed.hair + ')');

  console.log('\n=== BALD = GAME OVER ===');
  await page.evaluate('window.__PP_DEBUG.clearShield()');
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

  // Wait for distance rather than for a duration, for the same reason
  const advanced = await mp.waitForFunction('window.__PP_DEBUG.stats().metres > 12',
    { timeout: 15000 }).then(() => true).catch(() => false);
  const mRun = await mp.evaluate('window.__PP_DEBUG.stats()');
  ok(advanced, 'mobile run advances (' + mRun.metres + 'm)');
  await sleep(2500);
  await mp.screenshot({ path: `${SHOTS}/06-mobile-run.png` });


  console.log('\n=== RUN CYCLE ===');
  /* The cycle is periodic maths applied every frame, so it is one of the few
   * visual things that CAN be asserted. Each of these corresponds to a real
   * bug the rebuild fixed — leave them in.
   */
  await page.evaluate('window.__PP_DEBUG.start()');
  await sleep(600);

  // Sample a couple of stride's worth of frames
  const sample = async (frames) => page.evaluate(async (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(window.__PP_DEBUG.rig());
      await new Promise(r => requestAnimationFrame(r));
    }
    return out;
  }, frames);

  const slow = await sample(60);
  const bobs = slow.map(f => f.bob);
  const bobRange = Math.max(...bobs) - Math.min(...bobs);
  /* The old bob was a 3-6Hz target pushed through a damp() that only
   * responded at 14/s, which flattened it to almost nothing. A number this
   * far from zero is the whole point. */
  ok(bobRange > 0.04, 'body actually rises and falls while running (' + bobRange.toFixed(3) + 'u)');

  const hip = slow.map(f => f.hipYaw), chest = slow.map(f => f.chestYaw);
  const hipRange = Math.max(...hip) - Math.min(...hip);
  ok(hipRange > 0.2, 'hips rotate through the cycle (' + hipRange.toFixed(3) + ' rad)');
  // Contralateral: when the hips yaw one way the shoulders must go the other
  const opposed = slow.filter(f => Math.abs(f.hipYaw) > 0.05)
    .every(f => Math.sign(f.hipYaw) === -Math.sign(f.chestYaw));
  ok(opposed, 'shoulders counter-rotate against the hips');

  /* Legs stay half a cycle apart. They legitimately cross — there is a
   * moment mid-run where both thighs pass vertical together — so the check
   * is that they are never both driven forward, and that they do separate. */
  const bothForward = slow.some(f => f.thigh[0] > 0.3 && f.thigh[1] > 0.3);
  const separate = slow.some(f => Math.abs(f.thigh[0] - f.thigh[1]) > 0.9);
  ok(!bothForward && separate, 'legs stay out of phase with each other');

  // Ankles articulate rather than riding rigid on the shin
  const ankles = slow.flatMap(f => f.ankle);
  ok(Math.max(...ankles) - Math.min(...ankles) > 0.2, 'ankles flex through the cycle');

  // Cadence has to keep responding all the way up the speed ramp
  const slowCad = slow[0].cadence;
  await page.evaluate('window.__PP_DEBUG.setSpeed(33)');
  await sleep(200);
  const fast = await sample(30);
  const fastCad = fast[0].cadence;
  ok(fastCad > slowCad + 0.5,
    'cadence rises with speed (' + slowCad.toFixed(2) + ' -> ' + fastCad.toFixed(2) + ' steps/s)');
  const fastBobs = fast.map(f => f.bob);
  ok(Math.max(...fastBobs) - Math.min(...fastBobs) > 0.04, 'bob survives at top speed too');
  ok(fast[0].lean > slow[0].lean, 'he leans in further at speed');

  console.log('\n=== HEAD AND ARMS ===');
  const head = await page.evaluate('window.__PP_DEBUG.headInfo()');
  ok(head.materials === 1 && head.geometry === 'BoxGeometry',
    'head is one mesh under one texture (' + head.geometry + ', ' +
    head.materials + ' material)');

  /* Elbows bend forward — the exact bug that made his arms look backwards,
   * and it held through the entire suite. Sampled across a full stride and
   * through a jump, since every pose set the sign independently. */
  const elbowTrace = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 40; i++) {
      out.push(window.__PP_DEBUG.elbows());
      await new Promise(r => requestAnimationFrame(r));
    }
    return out;
  });
  const bent = elbowTrace.flat();
  ok(Math.min(...bent) > 0,
    'elbows bend forward all cycle (min flexion ' + Math.min(...bent).toFixed(2) + ' rad)');

  await page.keyboard.press('w');
  await sleep(180);
  const airElbows = await page.evaluate('window.__PP_DEBUG.elbows()');
  ok(Math.min(...airElbows) > 0,
    'and in the air (' + airElbows.join(', ') + ')');
  await page.waitForFunction('window.__PP_DEBUG.airborne() === false', { timeout: 5000 });

  console.log('\n=== INPUT ===');
  await page.evaluate('window.__PP_DEBUG.start()');
  await sleep(500);

  /* Held keys must not auto-fire. The browser's own key-repeat used to be
   * wired straight into moveLane, so leaning on a direction walked him across
   * every lane and leaning on jump re-launched him on every landing frame. */
  const laneStart = await page.evaluate('window.__PP_DEBUG.lane()');
  await page.keyboard.down('a');
  await sleep(900);
  await page.keyboard.up('a');
  await sleep(250);
  const laneHeld = await page.evaluate('window.__PP_DEBUG.lane()');
  ok(laneStart - laneHeld === 1,
    'holding a direction moves exactly one lane (' + laneStart + ' -> ' + laneHeld + ')');

  /* No free double jump. The coyote-time check used to read airT, which is
   * zero at the instant of take-off, so a second press inside the window
   * re-set vy and bought another 2.4 units of height. */
  await page.keyboard.press('Space');
  await sleep(50);
  const vyFirst = await page.evaluate('window.__PP_DEBUG.vy()');
  await page.keyboard.press('Space');
  await sleep(30);
  const vySecond = await page.evaluate('window.__PP_DEBUG.vy()');
  ok(vySecond < vyFirst,
    'a second jump press mid-air does not re-launch him (' + vyFirst + ' -> ' + vySecond + ')');

  /* Landing has to leave something behind to animate with. The impact
   * velocity is zeroed by the ground clamp one line after it is read, so if
   * it isn't captured there is literally nothing to drive a landing off. */
  await sleep(700);
  await page.keyboard.press('Space');
  const landTrace = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 90; i++) {
      out.push(window.__PP_DEBUG.rig().landT);
      await new Promise(r => requestAnimationFrame(r));
    }
    return out;
  });
  ok(Math.max(...landTrace) > 0.05,
    'landing registers an impact to absorb (' + Math.max(...landTrace).toFixed(3) + 's)');


  console.log('\n=== OBSTACLES ARE SURVIVABLE ===');
  /* The single most valuable check in this file.
   *
   * Collision is only a band — yMin/yMax/halfW — so a new obstacle kind is
   * free to be shaped however it likes, and equally free to be shaped so that
   * neither jumping nor sliding clears it. That is an unavoidable hit, and
   * before this nothing validated it anywhere.
   */
  const kinds = await page.evaluate('window.__PP_DEBUG.obstacleKinds()');
  const CFG = await page.evaluate('({ g: PP.CFG.GRAVITY, v: PP.CFG.JUMP_V, slide: PP.CFG.PLAYER_SLIDE_H, stand: PP.CFG.PLAYER_STAND_H })');
  const apex = (CFG.v * CFG.v) / (2 * Math.abs(CFG.g));
  ok(Object.keys(kinds).length >= 9,
    'every obstacle kind is registered (' + Object.keys(kinds).length + ')');

  const unfair = [];
  for (const [kind, k] of Object.entries(kinds)) {
    if (k.archetype === 'jump') {
      // Feet must clear the top of it
      if (!(apex > k.yMax + 0.05)) unfair.push(kind + ': jump apex ' + apex.toFixed(2) + ' <= yMax ' + k.yMax);
    } else if (k.archetype === 'slide') {
      // Sliding head must pass under it
      if (!(CFG.slide < k.yMin - 0.05)) unfair.push(kind + ': slide height ' + CFG.slide + ' >= yMin ' + k.yMin);
      if (!(k.yMax > CFG.stand)) unfair.push(kind + ': ' + kind + ' can be run under standing');
    } else {
      // A blocker must actually block: too tall to jump, too low to slide under
      if (!(k.yMax > apex)) unfair.push(kind + ': blocker yMax ' + k.yMax + ' is jumpable (apex ' + apex.toFixed(2) + ')');
      if (!(k.yMin < CFG.slide)) unfair.push(kind + ': blocker can be slid under');
    }
  }
  ok(unfair.length === 0, 'every kind matches its archetype' +
    (unfair.length ? ': ' + unfair.join(' | ') : ' (apex ' + apex.toFixed(2) + ')'));

  console.log('\n=== SPACING AND BUDGET ===');
  await page.evaluate('window.__PP_DEBUG.start()');
  await sleep(600);
  /* Spacing has to hold ACROSS chunk seams, not just within a chunk. `z`
   * restarts at every boundary, so without carrying the last pattern over,
   * two patterns could land on top of each other at the join. */
  await sleep(2500);
  const zs = await page.evaluate('window.__PP_DEBUG.obstacleZs()');
  const sorted = zs.slice().sort((a, b) => b - a);
  let minSep = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i - 1] - sorted[i];
    if (d > 0.6) minSep = Math.min(minSep, d);   // same-pattern rows share a z
  }
  ok(sorted.length < 2 || minSep > 6,
    'patterns stay apart, seams included (closest ' +
    (minSep === Infinity ? 'n/a' : minSep.toFixed(1)) + 'u)');

  const budget = await page.evaluate('window.__PP_DEBUG.render()');
  /* A ceiling, not a target. The city got roughly nine times busier in this
   * pass and draw calls went DOWN, because everything merges; if a later
   * change quietly unpicks that, the frame rate goes with it and no other
   * check in this file would notice. */
  ok(budget.calls < 1100,
    'draw calls stay under budget (' + budget.calls + ' for ' + budget.meshes + ' meshes)');

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
