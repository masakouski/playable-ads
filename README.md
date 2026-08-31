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

## Projects

### `car-quiz`

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

### `hole-eater`

A 3D hole that swallows a city block, in ~61 KB. Flow: a scripted attract loop
(the hole drives itself, eats a bus, a big tree and a house, then swallows a
bomb and blows up) → `GAME OVER / TRY AGAIN` → a 20-second round the player
steers by dragging anywhere on screen. Bombs end the run; the timer running out
shows a score card. Both cards carry the CTA.

The hole is drawn as a monster mouth: a bright blue emissive rim in the ground
shader plus a ring of pyramid fangs that lean in over the pit and turn slowly.
Each fang's outer half dips below `y = 0`, where the opaque ground hides it, so
the teeth look like they grow out of the rim. A slim blue bar tracks the hole
in 3D (`R.project()`) and fills as junk is eaten, resetting at every size tier
in `TIERS`.

There is no three.js: `projects/hole-eater/src/engine.js` is a ~10 KB
flat-shaded WebGL renderer (perspective camera, one directional light,
box/cylinder/cone/pyramid/sphere meshes). The hole itself is a fragment-shader
trick — the ground plane `discard`s everything inside a circle centred on the
hole, so anything that falls below `y = 0` is hidden by the ground except
inside that circle. No stencil buffer, no CSG. The road grid, kerbs and
markings are drawn procedurally in the same shader, so the ad ships with zero
image assets.

Tuning lives in `projects/hole-eater/src/config.js`: intro speed and start
radius, round length, hole growth and top speed, and all end-card copy. The
props themselves (`SHAPES` in `game.js`) are lists of unit boxes/cylinders with
a `size` (how big the hole must be to eat it) and a `mass` (how much it grows
the hole) — add a shape there and add its name to the `props` array in
`populate()` to see it in the city.

Falls back to an end card with the CTA if the device has no WebGL context.

### `merge-master`

A backpack auto-battler modelled on the Backpack Brawl shop screen, in ~142 KB.
Flow: drag the Shuriken from the shop onto the Shuriken already in the bag
(**merge** payoff, immediately) -> drag the 2x1 Machete into the free row
(the spatial/Tetris hook) -> tap **Battle!** -> scripted auto-battle -> end card.
A pointing hand loops on every step, and if the viewer never touches the screen
`autoStep()` plays each step for them after `tutorial.autoPlayAfter` seconds, so
the ad always reaches its end card. Input is gated to the one item each step
needs.

Ported from the Cocos Creator 3.8.8 project in the sibling `merge-master` repo.
The Cocos runtime would have cost megabytes inside a 5 MB single file, so
`src/engine.js` is a ~22 KB retained-mode 2D scene graph that reimplements just
the slice of the Cocos API the creative used: `Node` (transform tree, opacity,
touch, world<->local maths), `Graphics` (the same `moveTo`/`roundRect`/`circle`/
`fill`/`stroke` calls, including Cocos' rule that a `fill()` paints everything
queued since the last paint), `Label`, and `tween()` with the handful of easings
the creative uses. Everything is Y-up with the origin at the centre of the
stage, exactly like Cocos, so the drawing and layout code came across unchanged;
the canvas transform does the flip and only text flips back.

Like the original it ships **zero image and audio assets** — every icon, panel,
fighter and glyph is vector draw calls in `src/art.js`, which is also where the
whole palette lives. Re-skinning is one file.

Source layout mirrors the Cocos project:

- `config.js` — branding, store URLs, grid size, prices, battle pacing, copy.
- `engine.js` — the mini scene graph described above.
- `art.js` — palette, draw primitives, UI kit (buttons, tweens helpers), icons.
- `model.js` — item defs, footprints, placement/merge rules, economy, synergies.
  No rendering, so the game rules can be reasoned about on their own.
- `views.js` / `hud.js` / `battle.js` — one class per screen region.
- `game.js` — drag controller, tutorial state machine, canvas boot and input.

The battle is deliberately **not** a fair simulation: enemy HP is derived from
the player's actual DPS so the fight lands in a 6-9 second window, the hero's HP
floors at 18% so they cannot lose, and `battle.maxSeconds` is a hard stop. Ads
should never end in a loss or drag on.

Three deliberate departures from the Cocos original, all noted in comments:
`bindState()` now runs before `seed()` so the ad opens with the Shuriken already
in the inspector instead of the empty placeholder; a viewer who drops the merge
item on an empty cell advances the tutorial instead of stalling it; and any
touch anywhere counts as engagement (resets the autoplay timer, reports
`gameStart()`), even one the tutorial gate refuses.

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
full-screen at `/<name>/index.html` — one click, no folder listing in between,
and a handy link to send to anyone who wants to try it on their own phone.

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
