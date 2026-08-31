/**
 * Build-time only. Generates dist/index.html: the card gallery that lists
 * every built playable so anyone with the Netlify link can pick one and play it.
 *
 * Per-project metadata comes from projects/<name>/meta.json:
 *
 *   {
 *     "title":       "Car Quiz",
 *     "description": "One or two sentences shown on the card.",
 *     "tags":        ["quiz", "trivia"],
 *     "accent":      "#f97316",
 *     "orientation": "portrait" | "landscape",
 *     "status":      "ready" | "draft"
 *   }
 *
 * Every field is optional. Without meta.json the title and description fall
 * back to appName / tagline in src/config.js, then to the folder name.
 */

const fs = require('fs');
const path = require('path');

const PROJECTS_DIR = path.join(__dirname, 'projects');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kb(bytes) {
  return bytes < 1024 * 1024
    ? (bytes / 1024).toFixed(1) + ' KB'
    : (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function titleCase(slug) {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pulls a single-quoted string field out of config.js without executing it. */
function fromConfig(name, field) {
  const file = path.join(PROJECTS_DIR, name, 'src', 'config.js');
  if (!fs.existsSync(file)) return null;
  const m = fs
    .readFileSync(file, 'utf8')
    .match(new RegExp(`\\b${field}\\s*:\\s*(['"\`])([\\s\\S]*?)\\1`));
  return m ? m[2].trim() : null;
}

function readMeta(name) {
  let meta = {};
  const file = path.join(PROJECTS_DIR, name, 'meta.json');
  if (fs.existsSync(file)) {
    try {
      meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.warn(`    ! ${name}/meta.json is not valid JSON — ignoring it (${err.message})`);
    }
  }
  return {
    title: meta.title || fromConfig(name, 'appName') || titleCase(name),
    description: meta.description || fromConfig(name, 'tagline') || '',
    tags: Array.isArray(meta.tags) ? meta.tags.filter(Boolean) : [],
    accent: /^#[0-9a-f]{3,8}$/i.test(meta.accent || '') ? meta.accent : '#6ea8fe',
    orientation: meta.orientation === 'landscape' ? 'landscape' : 'portrait',
    status: meta.status === 'draft' ? 'draft' : 'ready',
  };
}

function card(r) {
  const m = r.meta;
  // Point at the file, not the directory: a bare directory URL relies on the
  // server serving an index, and some (file://, plain static servers) show a
  // folder listing instead — an extra click between the card and the game.
  const href = `./${encodeURIComponent(r.name)}/index.html`;
  const tags = m.tags
    .slice(0, 4)
    .map((t) => `<li>${esc(t)}</li>`)
    .join('');

  return `      <article class="card${m.status === 'draft' ? ' is-draft' : ''}" style="--accent:${esc(m.accent)}">
        <div class="shot shot--${m.orientation}">
          <iframe src="${href}" title="${esc(m.title)} preview" loading="lazy" tabindex="-1" scrolling="no" aria-hidden="true"></iframe>
          <span class="veil"></span>
          <span class="cue">Play</span>
        </div>
        <div class="body">
          <h2><a class="stretch" href="${href}">${esc(m.title)}</a></h2>
          ${m.description ? `<p>${esc(m.description)}</p>` : ''}
          ${tags ? `<ul class="tags">${tags}</ul>` : ''}
        </div>
        <footer>
          <span class="size">${kb(r.bytes)}${m.status === 'draft' ? ' · draft' : ''}</span>
          <a class="ext" href="${href}" target="_blank" rel="noopener" title="Open in a new tab">Open&nbsp;&#8599;</a>
        </footer>
      </article>`;
}

function writeIndexPage(results, distDir) {
  const games = results.map((r) => ({ ...r, meta: readMeta(r.name) }));
  const total = games.reduce((n, g) => n + g.bytes, 0);
  const cards = games.map(card).join('\n');
  const built = new Date().toISOString().slice(0, 10);

  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Playables</title>
<meta name="description" content="Playable ad demos — pick one and try it in the browser.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=&#39;http://www.w3.org/2000/svg&#39; viewBox=&#39;0 0 32 32&#39;%3E%3Crect width=&#39;32&#39; height=&#39;32&#39; rx=&#39;7&#39; fill=&#39;%23111827&#39;/%3E%3Cpath d=&#39;M13 10l9 6-9 6z&#39; fill=&#39;%236ea8fe&#39;/%3E%3C/svg%3E">
<style>
  :root{
    color-scheme:light dark;
    --bg:#f6f7f9; --panel:#fff; --line:#e3e6ea; --line-soft:#eef0f3;
    --ink:#12161c; --dim:#5f6874; --shadow:0 1px 2px rgba(16,22,30,.05),0 8px 24px rgba(16,22,30,.06);
  }
  @media (prefers-color-scheme:dark){
    :root{
      --bg:#0d1117; --panel:#151a21; --line:#252c36; --line-soft:#1d232b;
      --ink:#e8edf4; --dim:#8d97a5; --shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.35);
    }
  }
  *{box-sizing:border-box}
  body{
    margin:0;background:var(--bg);color:var(--ink);
    font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:1080px;margin:0 auto;padding:clamp(2rem,6vw,4.5rem) clamp(1rem,4vw,2rem) 4rem}
  header.top{margin-bottom:clamp(1.75rem,4vw,2.75rem)}
  h1{margin:0;font-size:clamp(1.6rem,4.5vw,2.2rem);letter-spacing:-.02em}
  .lede{margin:.5rem 0 0;color:var(--dim);max-width:52ch}
  .meta{margin:1rem 0 0;color:var(--dim);font-size:.82rem;
        display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
  .meta b{font-weight:600;color:var(--ink)}
  .dot{opacity:.45}

  .grid{display:grid;gap:clamp(1rem,2.5vw,1.5rem);
        grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}

  .card{
    position:relative;display:flex;flex-direction:column;
    background:var(--panel);border:1px solid var(--line);border-radius:14px;
    overflow:hidden;box-shadow:var(--shadow);
    transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
  }
  .card:hover,.card:focus-within{
    transform:translateY(-3px);border-color:color-mix(in srgb,var(--accent) 55%,var(--line));
    box-shadow:0 2px 4px rgba(16,22,30,.06),0 16px 36px rgba(16,22,30,.14);
  }
  .card.is-draft{opacity:.72}

  .shot{position:relative;background:#000;border-bottom:1px solid var(--line-soft);overflow:hidden}
  .shot--portrait{aspect-ratio:3/4}
  .shot--landscape{aspect-ratio:16/9}
  .shot iframe{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none}
  .veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.42),rgba(0,0,0,.62));backdrop-filter:saturate(.7);
        opacity:0;transition:opacity .18s ease}
  .cue{
    position:absolute;left:50%;top:50%;translate:-50% -50%;
    padding:.5rem 1.1rem;border-radius:999px;
    background:var(--accent);color:#fff;font-weight:650;font-size:.85rem;letter-spacing:.02em;
    box-shadow:0 6px 18px rgba(0,0,0,.35);
    opacity:0;scale:.94;transition:opacity .18s ease,scale .18s ease;
  }
  .card:hover .veil,.card:focus-within .veil{opacity:1}
  .card:hover .cue,.card:focus-within .cue{opacity:1;scale:1}

  .body{padding:.95rem 1.05rem 0;flex:1}
  h2{margin:0;font-size:1.02rem;letter-spacing:-.01em}
  h2 a{color:inherit;text-decoration:none}
  h2 a:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
  .stretch::after{content:"";position:absolute;inset:0;z-index:1}
  .body p{margin:.35rem 0 0;color:var(--dim);font-size:.87rem}
  .tags{list-style:none;display:flex;flex-wrap:wrap;gap:.35rem;margin:.7rem 0 0;padding:0}
  .tags li{font-size:.7rem;letter-spacing:.03em;text-transform:uppercase;color:var(--dim);
           border:1px solid var(--line);border-radius:999px;padding:.16rem .5rem}

  footer{display:flex;align-items:center;justify-content:space-between;gap:.75rem;
         padding:.85rem 1.05rem 1rem;color:var(--dim);font-size:.78rem}
  .ext{position:relative;z-index:2;color:var(--dim);text-decoration:none;
       border:1px solid var(--line);border-radius:7px;padding:.2rem .5rem;white-space:nowrap}
  .ext:hover{color:var(--ink);border-color:var(--dim)}

  .empty{border:1px dashed var(--line);border-radius:14px;padding:2.5rem;text-align:center;color:var(--dim)}
  .foot{margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--line);
        color:var(--dim);font-size:.8rem}
  .foot code{background:var(--line-soft);border-radius:5px;padding:.1rem .35rem;font-size:.95em}
  @media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <h1>Playables</h1>
    <p class="lede">Interactive ad demos. Pick one to play it right here in the browser — each is the same single HTML file that ships to the ad network.</p>
    <p class="meta"><b>${games.length}</b> playable${games.length === 1 ? '' : 's'} <span class="dot">·</span> <b>${kb(total)}</b> total <span class="dot">·</span> built ${built}</p>
  </header>

${games.length ? `  <main class="grid">\n${cards}\n  </main>` : '  <main class="empty">No playables built yet. Add one under <code>projects/</code> and run <code>npm run build</code>.</main>'}

  <p class="foot">Each card previews the live build. Sizes are the uploaded file size — the network limit is 5&nbsp;MB. Rebuild with <code>npm run build</code>.</p>
</div>
</body>
</html>`;

  fs.writeFileSync(path.join(distDir, 'index.html'), page);
}

module.exports = { writeIndexPage, readMeta };
