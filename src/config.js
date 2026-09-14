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
  GRAVITY: -58,
  JUMP_V: 15.6,                  // ~1.9u apex, ~0.72s airtime at this gravity
  SLIDE_TIME: 0.6,
  COYOTE_TIME: 0.09,             // late jumps still register
  INPUT_BUFFER: 0.14,            // early jump/slide presses are remembered

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
  // The camera leads the player, so the clippers chasing from behind him are
  // FURTHER from the lens than he is — distance carries the threat all by
  // itself. They start way back down the street and grow as they close.
  CHASE_Z_FAR: 22.0,             // distance behind the player at menace 0
  CHASE_Z_NEAR: 2.8,             // breathing down his neck at menace 1
  CHASE_Y_FAR: 3.0,              // roughly head height throughout...
  CHASE_Y_NEAR: 2.7,             // ...dipping slightly as they line up the cut
  CHASE_SCALE: 1.15,             // overall size of the clipper rig

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
  SCENERY_X_MIN: 13.0,           // roadside props start this far out...
  SCENERY_X_RANGE: 8.0,          // ...spread over this much more
  MIN_REACTION: 0.55,            // seconds of clear runway guaranteed before any obstacle

  // ---- Camera -------------------------------------------------------------
  // The camera flies backwards AHEAD of the player, looking back at him, so
  // he runs toward the viewer and you can see his face and the clippers
  // bearing down behind him. It rides high and pitched down, which stacks the
  // frame cleanly: upcoming obstacles low, the player in the middle, the
  // clippers and the receding street above him.
  CAM_HEIGHT: 3.6,
  CAM_LEAD_BASE: 7.5,            // how far ahead of the player the camera sits
  CAM_LEAD_PER_SPEED: 0.40,      // ...plus this much per unit of speed, so the
                                 //    runway stays readable as the pace climbs
  CAM_LOOK_Y: 1.9,
  CAM_LOOK_BEHIND: 2.0,          // aim just past him, into the chase
  FOV_BASE: 44,
  FOV_MAX: 92,                   // ceiling when widening for narrow phones
  FRAME_HALF_WIDTH: 5.4,         // world half-extent that must stay in frame
  CULL_BEHIND: 58,               // keep passed geometry alive this far back —
                                 //    it's the visible background now
  FOV_MENACE: 9,                 // extra FOV punched in as the clippers close
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
