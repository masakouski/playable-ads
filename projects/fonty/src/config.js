/**
 * Everything you are likely to change lives here.
 * Edit, run `node build.js fonty`, re-upload. No other file needs touching.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Fonty',
  appSubtitle: 'Fonts Keyboard & Themes',
  tagline: 'Fancy fonts you can paste anywhere.',
  iconGlyph: '𝓕',          // the script "F" drawn on the generated app icon

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.fonty',

  /* ---- demo (attract loop played once before the player takes over) ---- */
  demoText: 'what a beautiful day',
  demoFont: 'script',                 // id from FONTS in fonts.js
  demoTypeMs: 62,                     // per character
  yourTurnLabel: 'Your turn!',

  /* ---- player round ---- */
  maxChars: 40,
  placeholder: 'Type something…',
  idleHintMs: 3500,                   // nudge hand appears after this much inactivity
  // Order of the style rows. Remove an id to hide that style.
  fonts: ['script', 'fraktur', 'outline', 'bold', 'bubble', 'smallcaps', 'mono', 'wide'],

  /* Best-effort write to the real device clipboard on Copy. Ad WebViews often
   * block it, so the text is ALWAYS kept in a variable too and Paste reads that
   * variable - the playable never reads the native clipboard (iOS would show a
   * permission bubble). */
  realClipboard: true,

  /* ---- end card ---- */
  endDelayMs: 1700,                   // story with the pasted text stays up this long
  endTitle: 'Make every post stand out',
  endBullets: ['100+ fonts', 'Keyboard themes', 'Works in any app'],
  ctaLabel: 'GET THE APP',
  headerCtaLabel: 'GET',
};
