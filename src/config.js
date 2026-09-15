/* Petia Petty — every tunable number in the game lives here. */
window.PP = window.PP || {};

PP.CFG = {
  // ---- Track geometry -----------------------------------------------------
  LANE_X: [-2.3, 0, 2.3],        // world X of each lane
  LANE_SWAP_TIME: 0.16,          // seconds to slide between lanes
  CHUNK_LEN: 30,                 // length of one streamed track chunk
  CHUNK_COUNT: 7,                // chunks alive at once (pool size)
  SPAWN_AHEAD: 3,                // chunks kept ahead of the player

  // ---- Running ------------------------------------------------------------
  SPEED_START: 13,
  SPEED_MAX: 33,
  SPEED_RAMP_TIME: 240,          // seconds to reach SPEED_MAX (eased)
  /* Jump apex is unchanged from the original tuning at ~2.1u — it still
   * clears a car and still cannot clear a van, so nothing about what he can
   * get over has moved. Both numbers went up together to cut the hang time
   * from 0.54s to 0.46s: same height, less float, and the press reads as a
   * snap rather than a drift. (The comment these replaced claimed 1.9u and
   * 0.72s, which was never what the constants did.)
   */
  GRAVITY: -79,
  JUMP_V: 18.2,                  // 2.10u apex, 0.46s airtime at this gravity
  SLIDE_TIME: 0.6,

  // ---- Run cycle ----------------------------------------------------------
  /* Cadence is derived from ground speed, on an eased curve so it keeps
   * responding across the whole ramp instead of pinning at one end.
   *
   * It is deliberately NOT solved for zero foot-skate. He is about 2.4u tall
   * with a 0.72u leg, and the track moves at 13-33 u/s — call it 35-90 km/h
   * at his scale. A planted foot can only sweep about 1.2u relative to the
   * hip, so matching ground speed exactly would need 8-20 steps a second,
   * which is a hummingbird, not a man. Every runner in this genre has the
   * same problem and the same answer: pick the cadence that reads as running
   * and let the contact patch cheat. What the eye actually objects to is a
   * missing bob and a locked spine, which is what the rest of this block is.
   */
  CADENCE_MIN: 3.4,              // steps/sec at SPEED_START
  CADENCE_MAX: 5.6,              // steps/sec at SPEED_MAX
  CADENCE_CURVE: 0.65,           // <1 front-loads the gain, like the speed ramp
  STANCE_FRAC: 0.35,             // share of the cycle a foot is planted; the
                                 // rest is flight, and it is what the bob rides
  THIGH_AMP: 0.70,               // radians of hip swing each way
  THIGH_BIAS: 0.06,
  ARM_AMP: 0.80,
  ARM_BIAS: -0.15,
  ELBOW_BASE: 0.86,              // radians of forward elbow flexion while running
  ELBOW_SWING: 0.46,             // how much it opens and closes over the cycle
  ARM_TUCK: 0.06,                // elbows held in toward the midline; much
                                 // more than this and the fists clip his ribs
  // Vertical travel of the whole body over one step. Applied analytically,
  // never through a damp — see the note in CLAUDE.md.
  BOB_AMOUNT: 0.155,
  HIP_SWING: 0.30,               // radians the pelvis yaws each way
  SHOULDER_SWING: 0.38,          // chest counter-yaw; larger, so it reads
  LEAN_BASE: 0.10,               // forward pitch at SPEED_START
  LEAN_SPEED: 0.16,              // extra pitch by SPEED_MAX
  LEAN_MENACE: 0.13,             // extra pitch as the clippers close
  LAND_SQUASH: 0.30,             // how far he sinks on a full-speed landing
  LAND_TIME: 0.22,               // seconds to absorb a landing
  LANE_BANK: 0.012,              // roll per unit/sec of lateral velocity
  // How often he glances back at the clippers: seconds facing forward, then
  // seconds looking over his shoulder, on a loop.
  LOOK_FORWARD: 2.0,
  LOOK_BACK: 2.0,
  LOOK_ANGLE: 2.2,               // radians; negative is applied, i.e. rightward

  COYOTE_TIME: 0.09,             // late jumps still register
  INPUT_BUFFER: 0.14,            // early jump/slide presses are remembered

  // ---- The head -----------------------------------------------------------
  /* One rounded mesh under one wrapped texture, not a box with a picture on
   * each face. Smaller than it was: it used to be about as wide as his torso,
   * which magnified every seam and read as a bobblehead.
   */
  /* The skull is a box again — square reads better for this character than a
   * sphere did — but still one texture, not six pictures. The four side faces
   * take contiguous quarter-slices of the wrap; see player.js.
   */
  HEAD_W: 0.76,
  HEAD_H: 0.84,
  HEAD_D: 0.72,
  HEAD_Y: 2.26,
  // The vertical band of the wrap the side faces use, leaving a sliver at each
  // end for the crown and the underside of the chin.
  HEAD_SLIVER: 0.04,
  HEAD_BAND: [0.04, 0.96],

  /* Where the artwork lands on the wrap. The wrap is now a plain unrolled
   * band, so these are simple fractions: degrees of the way round the head,
   * and fractions of its height.
   */
  FACE_SPAN: 104,
  FACE_TOP: 0.09,
  FACE_HEIGHT: 0.80,
  HAIR_SCALE: 0.98,              // hair was placed against the old bigger head
  HAIR_LIFT: 0.02,

  // ---- Collision ----------------------------------------------------------
  PLAYER_RADIUS: 0.52,
  PLAYER_STAND_H: 1.75,
  PLAYER_SLIDE_H: 0.85,
  INVULN_TIME: 1.25,             // after a snip

  // ---- Hair (this is the health bar) --------------------------------------
  HAIR_MAX: 3,                   // 3 full -> 2 receding -> 1 horseshoe -> 0 bald = dead

  // ---- The clippers -------------------------------------------------------
  MENACE_HIT: 0.34,              // each obstacle hit pushes them this much closer
  MENACE_DECAY: 0.085,           // per second of clean running
  MENACE_AFTER_SNIP: 0.55,       // where they reset to after taking your hair
  MENACE_CREEP: 0.012,           // slow baseline pressure per second
  // The clippers hang high and far back when calm, then swoop down and in as
  // menace rises. Keeping them above the track means they stay visible in
  // frame the whole run without blocking the player's view of what's coming.
  // A camera sitting behind the player can never show something chasing from
  // further behind — it would be behind the camera too. So the clippers hang
  // in the air just over his shoulder and DESCEND as menace rises: high and
  // small in the top of the frame when calm, down at head height and filling
  // the space behind him when they're about to strike.
  // The camera trails the player again, so the clippers can't convey threat by
  // closing in behind him: anything further back than the camera is invisible,
  // and anything directly between camera and player covers him up.
  //
  // So they hunt from one SIDE instead. They hang out over the sidewalk when
  // he's clean and swing inward, downward and toward the lens as the meter
  // fills — growing in frame without ever sitting on top of him. Only the
  // lunge crosses over his head, which is the one moment occlusion is the
  // whole point.
  CHASE_X_FAR: 3.0,              // lateral offset at menace 0
  CHASE_X_NEAR: 1.7,             // still clear of him at menace 1
  CHASE_Z_FAR: 1.8,              // further from the lens = smaller
  CHASE_Z_NEAR: 3.0,             // nearer the lens = looming
  CHASE_Y_FAR: 5.6,
  CHASE_Y_NEAR: 4.0,
  CHASE_LUNGE_X: 0.0,            // the strike sweeps across onto his scalp
  CHASE_LUNGE_Y: 3.0,
  CHASE_LUNGE_Z: 4.2,
  CHASE_SCALE: 0.56,             // overall size of the clipper rig

  // ---- Pickups ------------------------------------------------------------
  TUFT_VALUE: 10,
  COMBO_MAX: 8,
  SHIELD_TIME: 8,
  SERUM_CHANCE: 0.1,             // per eligible chunk, only when hair is missing
  POMADE_CHANCE: 0.12,

  // ---- Difficulty tiers (by metres travelled) -----------------------------
  TIERS: [
    { at: 0,    density: 0.55, maxBlocked: 1 },
    { at: 500,  density: 0.70, maxBlocked: 1 },
    { at: 1200, density: 0.82, maxBlocked: 2 },
    { at: 2500, density: 0.92, maxBlocked: 2 }
  ],
  SCENERY_X_MIN: 11.0,           // roadside props start this far out...
  SCENERY_X_RANGE: 10.0,         // ...spread over this much more
  SCENERY_PER_CHUNK: 6,          // roadside props spawned per track chunk
  MIN_REACTION: 0.55,            // seconds of clear runway guaranteed before any obstacle

  // ---- Camera -------------------------------------------------------------
  // Classic over-the-shoulder chase camera: behind and above the player,
  // looking down the street he's running into.
  CAM_HEIGHT: 5.0,
  CAM_BACK: 9.0,
  CAM_LOOK_AHEAD: 11,
  CAM_LOOK_Y: 1.5,
  FOV_BASE: 52,
  FOV_MAX: 94,                   // ceiling when widening for narrow phones
  FRAME_HALF_WIDTH: 5.4,         // world half-extent that must stay in frame
  CULL_BEHIND: 12,               // recycle once it's safely past the camera
  FOV_MENACE: 9,                 // extra FOV punched in as the clippers close
  FOV_SPEED: 7,                  // extra FOV by SPEED_MAX, so speed is felt
  CAM_BACK_SPEED: 1.6,           // extra dolly-back by SPEED_MAX
  CAM_LAND_DIP: 0.55,            // camera drop on a full-speed landing
  SHAKE_DECAY: 4.5,

  // ---- Ink / comic palette (pulled from the character reference) ----------
  COL: {
    paper:    0xf4efe4,   // cream sketchbook background
    ink:      0x141013,   // outline / linework black
    skin:     0xf2bd97,
    skinDark: 0xc97f51,
    hair:     0x2c1d18,   // near-black dark brown, messy
    beard:    0x3a251c,
    shirt:    0x7c2f42,   // maroon tee
    shirtDk:  0x5a1f2f,
    jeans:    0x2f3a4a,
    shoe:     0x24262b,
    marker:   0xf5c518,   // yellow marker accent
    chrome:   0xb8c2cc,   // clipper body
    chromeDk: 0x6e7880,
    blade:    0xf2f4f6,
    road:     0x4a4d55,   // asphalt
    roadDark: 0x3a3d44,
    lineMark: 0xf0e6c8,   // lane paint
    lineMid:  0xf5c518,   // centre line
    walk:     0x9c927e,   // sidewalk concrete
    kerbCol:  0x867c6a,
    floor:    0xd9cfb8,
    floorAlt: 0xbfb199,
    wall:     0xece4d5,
    pole:     0xd94a4a,   // barber pole red
    poleB:    0x3f7fd0,   // barber pole blue
    serum:    0x57c98a,
    pomade:   0x4fb0e0,

    // Traffic. Stalled cars are the obstacles, so they want to read instantly
    // as "solid thing in your lane" — saturated, high-contrast, inked.
    cars: [0xe0b21f, 0xd94a4a, 0x3f7fd0, 0xe8e4da, 0x2f3540, 0x57a86b, 0xd97832],
    glass:    0x8fb6cc,
    tyre:     0x1d1f24,
    lamp:     0x6e7880,
    rigBody:  0xd6d0c2,
    rigDeck:  0x5a616b,

    // City facades, muted so the cream sky and the character stay dominant
    bldg: [0xbfb6a6, 0xa89d8b, 0xc9c0ae, 0x938a7a, 0xd2c9b6, 0x8a8072]
  }
};
