/**
 * Hole Eater 3D — everything you are likely to change lives here.
 * Edit, run `npm run build`, re-upload. No other file needs touching.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Hole Eater 3D',
  tagline: 'Swallow the whole city',

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.holeeater',

  /* ---- attract loop (not controllable — it teaches the rule) ---- */
  introBannerText: 'WATCH',
  introSpeed: 12,            // world units per second along the scripted path
  introStartRadius: 3.4,

  /* ---- the playable round ---- */
  roundSeconds: 20,          // 0 disables the timer
  playStartRadius: 2.0,
  maxRadius: 8.5,
  moveSpeed: 17,             // top speed of the hole while dragging
  growth: 0.34,              // hole growth per unit of swallowed "mass"

  /* ---- copy ---- */
  introOverTitle: 'You think you can do better?',
  introOverText: 'Never swallow a bomb. Dodge them and eat the whole city.',
  introOverBtn: 'LET ME TRY',

  bombOverTitle: 'BOOM!',
  bombOverText: 'A bomb got you. The city is still out there.',

  timeUpTitles: [
    'Warm-up done!',       // small score
    'Nice appetite!',      // medium
    'City devoured!',      // big
  ],
  timeUpText: 'Hundreds of cities to swallow in the app.',

  /* ---- CTA ---- */
  ctaLabel: 'PLAY NOW',
  retryLabel: 'RETRY',
  showCornerCta: true,       // small persistent CTA during the played round

  /* ---- look ---- */
  sky: [0.68, 0.85, 0.95],
  debug: false,
};
