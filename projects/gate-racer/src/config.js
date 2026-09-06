/**
 * Gate Racer 3D — everything you are likely to change lives here.
 * Edit, run `npm run build`, re-upload. No other file needs touching.
 *
 * A gate pair is { z, left, right }; each side is { k, v }:
 *   k:'mul'   v:2      ->  points x2        (v < 1 is a red gate: /2)
 *   k:'add'   v:40     ->  points +40       (v < 0 is a red gate)
 *   k:'fuel'  v:35     ->  tank +35 %       (v < 0 is a red gate)
 *   k:'speed' v:14     ->  speed +14 km-ish (v < 0 is a red gate)
 * Green/red and the on-screen label are derived from k and v, so a re-skin
 * only means changing numbers here.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Gate Racer 3D',
  tagline: 'Pick the right gate. Win the race.',

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.gateracer',

  /* ---- the road ---- */
  roadHalf: 6,             // half width of the asphalt, in world units
  laneLimit: 5.0,          // how far from the centre the car may go

  /* ---- the car ---- */
  baseSpeed: 36,           // world units per second at the start
  minSpeed: 18,
  maxSpeed: 78,
  steerSpeed: 24,          // lateral units per second at full drag
  kmhPerUnit: 3.2,         // cosmetic: speedometer = speed * this

  /* ---- fuel ---- */
  fuelMax: 100,
  fuelBurnBase: 3.0,       // % per second, independent of speed
  fuelBurnSpeed: 3.0,      // % per second extra, scaled by speed/baseSpeed

  /* ---- scoring ---- */
  startPoints: 10,

  /* ---- the scripted demo run (teaches the rule, then loses) ---- */
  demo: {
    speed: 62,
    finishZ: 300,
    rivalPoints: 60,
    /* which side the demo car takes: -1 left, 1 right */
    picks: [-1, 1, 1],
    gates: [
      { z: 70,  left: { k: 'mul', v: 2 },    right: { k: 'add', v: -15 } },
      { z: 155, left: { k: 'fuel', v: 35 },  right: { k: 'mul', v: 0.5 } },
      { z: 240, left: { k: 'add', v: 50 },   right: { k: 'mul', v: 0.5 } },
    ],
  },

  /* ---- the played race ---- */
  race: {
    finishZ: 780,
    rivalPoints: 300,
    gates: [
      { z: 110, left: { k: 'mul',   v: 2 },   right: { k: 'add',   v: -25 } },
      { z: 190, left: { k: 'add',   v: 40 },  right: { k: 'fuel',  v: 35 } },
      { z: 268, left: { k: 'mul',   v: 0.5 }, right: { k: 'speed', v: 14 } },
      { z: 346, left: { k: 'fuel',  v: 30 },  right: { k: 'mul',   v: 2 } },
      { z: 424, left: { k: 'add',   v: 60 },  right: { k: 'speed', v: -12 } },
      { z: 502, left: { k: 'mul',   v: 2 },   right: { k: 'fuel',  v: 40 } },
      { z: 580, left: { k: 'add',   v: -40 }, right: { k: 'mul',   v: 2 } },
      { z: 658, left: { k: 'fuel',  v: 45 },  right: { k: 'add',   v: 50 } },
      { z: 724, left: { k: 'speed', v: 18 },  right: { k: 'mul',   v: 2 } },
    ],
  },

  /* ---- copy ---- */
  demoBannerText: 'WATCH',
  hintText: 'DRAG TO STEER',

  demoOverTitle: 'Think you can do better?',
  demoOverText: 'Green gates help. Red gates hurt. Beat the rival at the finish line.',
  demoOverBtn: 'LET ME RACE',

  winTitle: 'YOU WIN THE RACE!',
  winText: 'Hundreds of rivals are waiting in the app.',
  loseTitle: 'HE LEFT YOU BEHIND',
  loseText: 'Grab the green gates and beat his score.',
  fuelTitle: 'OUT OF FUEL!',
  fuelText: 'The tank ran dry before the finish line. Take the fuel gates.',

  youLabel: 'YOU',
  rivalLabel: 'RIVAL',

  /* ---- CTA ---- */
  ctaLabel: 'PLAY NOW',
  retryLabel: 'TRY AGAIN',
  showCornerCta: true,

  /* ---- look ---- */
  sky: [0.55, 0.78, 0.94],
  carColor: '#ff3f2e',
  rivalColor: '#2b3ce0',
  debug: false,
};
