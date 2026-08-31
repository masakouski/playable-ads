# playable-ads

Self-contained HTML5 playable ads. Each project builds to **one** `index.html`
with every byte of CSS, JS and artwork inlined — the format ad networks
(Mintegral, AppLovin, IronSource, Meta, Google) accept for upload.

```
projects/<name>/src/   editable source (html + css + js + config)
shared/                playable-sdk.js — the ad-network API layer
build.js               inliner + validator (zero dependencies)
dist/<name>/index.html the build output: upload this file
```

## Quick start

```bash
npm run build     # builds every project into dist/
npm run dev       # builds, then serves dist/ at http://localhost:8080
```

`npm run dev` also prints a LAN address — open that on your phone (same Wi‑Fi)
to test touch, both orientations, and the CTA.

Add `?debug=1` to the URL to get a small overlay showing every ad-network API
call as it fires.

## Current project: `car-quiz`

A three-question car quiz. Intro → 3 timed questions (10s each, with a
right/wrong flash) → end card with the score and the CTA. Cars are inline SVG,
so the whole ad is ~27 KB and stays sharp on any screen. Works in portrait and
landscape, on phone and desktop.

Everything you'd normally want to change is in
`projects/car-quiz/src/config.js`: app name, tagline, store URLs, CTA label,
timer length, end-card copy, and the questions themselves. Add or remove
questions freely — the progress pips and scoring follow the array length.

Question types:

- `text` — answers are words.
- `image` — answers are car silhouettes. Set `car:` to one of `sports`, `suv`,
  `pickup`, `van`, `hatchback` (drawn in `game.js` under `CARS`).

## Mintegral

Mintegral (MindWorks) requires a single HTML file up to 5 MB with no external
requests, and it looks for these globals, which it injects at runtime:

| API | When it fires here |
| --- | --- |
| `window.gameReady()` | on load |
| `window.gameStart()` | first tap on START |
| `window.gameEnd()` | when the end card appears (and before any CTA) |
| `window.install()` | every CTA tap — end card button and the corner button |

`shared/playable-sdk.js` wraps all four. Every call is guarded, so outside an
ad network (local, Netlify) nothing throws — the CTA falls back to opening the
store URL from `config.js`, and MRAID / Meta / Google equivalents are used when
those SDKs are present instead.

`npm run build` fails the build if the file goes over 5 MB, if any external
request survived inlining, or if `window.install()` / `window.gameEnd()` are
missing.

### Checking it

1. `npm run build`
2. Upload `dist/car-quiz/index.html` to <https://www.playturbo.com/review/doc>
   (Mintegral's playable test tool — formerly mindworks-creative.com). Every
   check should come back green.
3. Then upload the same file in Mintegral AppGrowth under Creatives → Playable.

Before shipping, replace the placeholder `appStoreUrl` / `playStoreUrl` in
`config.js` with the real store links, and swap `appName` / `tagline` for the
real app.

## Netlify

Connect the repo and Netlify picks up `netlify.toml` (build `npm run build`,
publish `dist`). No dependencies, so the build takes seconds.

Or deploy without a repo:

```bash
npm run build
npx netlify-cli deploy --dir=dist --prod
```

The deployed site is a gallery at `/`: one card per playable with a live
preview, title, description and tags. Click a card and the playable opens
full-screen at `/<name>/` — a handy link to send to anyone who wants to try it
on their own phone.

## Adding another playable

```bash
cp -r projects/car-quiz projects/my-next-ad
```

Edit its `src/`, then `npm run build`. It appears in `dist/` and on the gallery
automatically.

### Gallery card metadata

Optional `projects/<name>/meta.json` controls how the card reads:

```json
{
  "title": "Car Quiz",
  "description": "One or two sentences shown under the title.",
  "tags": ["quiz", "trivia"],
  "accent": "#f97316",
  "orientation": "portrait",
  "status": "ready"
}
```

Every field is optional. Without the file, the title and description fall back
to `appName` / `tagline` in `src/config.js`, then to the folder name. `accent`
tints the card's hover state and Play badge; `orientation` sets the preview
aspect ratio (`portrait` 3:4 or `landscape` 16:9); `status: "draft"` dims the
card and labels it.

The gallery template itself lives in `gallery.js` (build-time only — it is
never inlined into a playable).
