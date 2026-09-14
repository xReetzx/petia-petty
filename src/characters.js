/* The roster.
 *
 * A character is data, not code: a palette plus a bit of copy. Adding one
 * means appending an entry here — the player model, the portrait card and the
 * select panel all build themselves from it.
 */
window.PP = window.PP || {};

PP.Characters = (function () {
  'use strict';

  const LIST = [
    {
      id: 'petty',
      name: 'Petty',
      tagline: 'Losing. Badly.',
      blurb: 'Beard like a hedge, hairline in full retreat.',
      locked: false,
      // Sampled straight out of assets/petty-ref.jpg rather than guessed, so
      // the body, the procedural side and back of the head, and the hair
      // geometry all tone to the artwork on his face.
      colors: {
        skin:    0xe0a57e,
        hair:    0x241c18,
        beard:   0x53392d,
        shirt:   0x67373c,
        shirtDk: 0x4d272c,
        jeans:   0x2f3a4a,
        shoe:    0x24262b
      }
    },
    {
      id: 'slot2',
      name: '???',
      tagline: 'Not here yet',
      blurb: 'Room for whoever you want to add next.',
      locked: true,
      colors: {
        skin: 0xd9c9b6, hair: 0x9a9088, beard: 0x9a9088,
        shirt: 0xa9a196, shirtDk: 0x8b8379, jeans: 0x8b8b8b, shoe: 0x6e6e6e
      }
    },
    {
      id: 'slot3',
      name: '???',
      tagline: 'Not here yet',
      blurb: 'Room for whoever you want to add next.',
      locked: true,
      colors: {
        skin: 0xd9c9b6, hair: 0x9a9088, beard: 0x9a9088,
        shirt: 0xa9a196, shirtDk: 0x8b8379, jeans: 0x8b8b8b, shoe: 0x6e6e6e
      }
    }
  ];

  let currentId = PP.U.store.get('pp.character', 'petty');
  if (!LIST.some((c) => c.id === currentId && !c.locked)) currentId = 'petty';

  const all = () => LIST;
  const current = () => LIST.find((c) => c.id === currentId) || LIST[0];

  function select(id) {
    const c = LIST.find((x) => x.id === id);
    if (!c || c.locked) return false;
    currentId = id;
    PP.U.store.set('pp.character', id);
    return true;
  }

  /** Colour lookup for the player model — falls back to the global palette. */
  function col(key) {
    const c = current().colors;
    return c[key] != null ? c[key] : PP.CFG.COL[key];
  }

  return { all, current, select, col, get id() { return currentId; } };
})();
