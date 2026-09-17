/**
 * Light ("App Store screenshot") skin of the Fonty playable.
 * Everything you are likely to change lives here.
 */
window.PLAYABLE_CONFIG = {
  /* ---- branding ---- */
  appName: 'Fonty',
  appSubtitle: 'Fonts Keyboard & Themes',
  iconGlyph: '𝓕',

  /* headline printed above the app card, one entry per line */
  headline: ['Try Any Font.', 'Instantly'],

  /* ---- store links (used only outside an ad network, e.g. on Netlify) ---- */
  appStoreUrl: 'https://apps.apple.com/app/id000000000',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.example.fonty',

  /* ---- demo (attract loop played once before the player takes over) ---- */
  demoText: 'what a beautiful day',
  demoFont: 'script',
  demoTypeMs: 60,
  yourTurnLabel: 'Your turn!',

  /* ---- player round ---- */
  maxChars: 40,
  placeholder: 'Type something…',
  idleHintMs: 3500,
  fonts: ['script', 'fraktur', 'outline', 'bold', 'bubble', 'smallcaps', 'mono', 'wide'],

  /* ---- Themes tab: keyboard skins the player can actually apply ----
   * bg   : keyboard background
   * key  : key face
   * ink  : glyph colour on a key
   * dark : true when the theme needs light text in the app chrome above it
   */
  themes: [
    { name: 'Light',    bg: '#d1d5dd', key: '#ffffff', ink: '#0b0d12' },
    { name: 'Midnight', bg: '#1c1f2a', key: '#343a4b', ink: '#ffffff', dark: true },
    { name: 'Sunset',   bg: 'linear-gradient(160deg,#ff9a6b,#ff5f9e)', key: 'rgba(255,255,255,.92)', ink: '#8a2b63' },
    { name: 'Ocean',    bg: 'linear-gradient(160deg,#4facfe,#0a6cff)', key: 'rgba(255,255,255,.92)', ink: '#0a4fb8' },
    { name: 'Mint',     bg: 'linear-gradient(160deg,#a8f0d0,#3fd6a5)', key: '#ffffff', ink: '#0d6b4e' },
    { name: 'Neon',     bg: 'linear-gradient(160deg,#2b1055,#7f3fff)', key: 'rgba(255,255,255,.16)', ink: '#ffffff', dark: true },
  ],
  themesNote: 'Tap a theme to try it',

  /* Best-effort write to the real device clipboard on Copy. Ad WebViews often
   * block it, so the text is ALWAYS kept in a variable too and Paste reads that
   * variable - the playable never reads the native clipboard. */
  realClipboard: true,

  /* ---- end card ---- */
  endDelayMs: 1700,
  endTitle: 'Quick Installation',
  endSteps: [
    'Tap <b>Get the app</b>',
    'Select <b>Keyboards</b>',
    'Enable <b>Fonty</b>',
    'Type fancy fonts anywhere',
  ],
  endNote: 'We never track what you type.',
  ctaLabel: 'Get the app',
  headerCtaLabel: 'GET',
};
