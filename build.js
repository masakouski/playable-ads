#!/usr/bin/env node
/**
 * Playable ad builder.
 *
 * Takes projects/<name>/src/index.html and inlines every local dependency
 * (CSS, JS, images, fonts) into ONE self-contained file at
 * dist/<name>/index.html.
 *
 * That single file is both:
 *   - the artifact you upload to Mintegral / AppLovin / IronSource, and
 *   - what Netlify serves (dist/ is the publish directory).
 *
 * It also writes dist/index.html — the card gallery of every build, generated
 * by gallery.js from projects/<name>/meta.json.
 *
 * Zero dependencies. Run with: npm run build
 */

const fs = require('fs');
const path = require('path');
const { writeIndexPage } = require('./gallery');

const ROOT = __dirname;
const PROJECTS_DIR = path.join(ROOT, 'projects');
const DIST_DIR = path.join(ROOT, 'dist');

const MAX_BYTES = 5 * 1024 * 1024; // Mintegral hard limit: 5 MB
const WARN_BYTES = 2 * 1024 * 1024; // most networks are happiest under 2 MB

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function kb(bytes) {
  return bytes < 1024 * 1024
    ? (bytes / 1024).toFixed(1) + ' KB'
    : (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function dataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  if (ext === '.svg') {
    // SVG compresses far better as URL-encoded text than as base64.
    const svg = readText(file).replace(/\s+/g, ' ').trim();
    return `data:${mime},` + encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
  }
  return `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
}

/** Rewrites url(...) references inside a CSS string to data URIs. */
function inlineCssAssets(css, baseDir) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, _q, url) => {
    if (/^(data:|https?:|#|\/\/)/i.test(url)) return match;
    const file = path.resolve(baseDir, url.split('?')[0].split('#')[0]);
    if (!fs.existsSync(file)) {
      console.warn(C.yellow(`    ! missing asset referenced in CSS: ${url}`));
      return match;
    }
    return `url("${dataUri(file)}")`;
  });
}

/** Keeps an inlined </script> inside a JS string from closing the tag early. */
function protectScript(js) {
  return js.replace(/<\/script/gi, '<\\/script');
}

function inlineHtml(html, baseDir) {
  // 1. <link rel="stylesheet" href="...">  ->  <style>...</style>
  html = html.replace(
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi,
    (tag) => {
      const m = tag.match(/\bhref=["']([^"']+)["']/i);
      if (!m || /^(data:|https?:|\/\/)/i.test(m[1])) return tag;
      const file = path.resolve(baseDir, m[1]);
      if (!fs.existsSync(file)) throw new Error(`Missing stylesheet: ${m[1]}`);
      const css = inlineCssAssets(readText(file), path.dirname(file));
      return `<style>\n${css}\n</style>`;
    }
  );

  // 2. <script src="..."></script>  ->  <script>...</script>
  html = html.replace(
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (tag, pre, src, post) => {
      if (/^(data:|https?:|\/\/)/i.test(src)) return tag;
      const file = path.resolve(baseDir, src);
      if (!fs.existsSync(file)) throw new Error(`Missing script: ${src}`);
      const attrs = (pre + post).replace(/\s*\b(defer|async)\b/gi, '').trim();
      return `<script${attrs ? ' ' + attrs : ''}>\n${protectScript(readText(file))}\n</script>`;
    }
  );

  // 3. inline <style> blocks may reference local assets too
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (tag, css) =>
    tag.replace(css, inlineCssAssets(css, baseDir))
  );

  // 4. <img src>, <source src>, <audio src>, <video src|poster>
  html = html.replace(
    /(<(?:img|source|audio|video|image)\b[^>]*?\b(?:src|href|poster|xlink:href)=)(["'])([^"']+)\2/gi,
    (match, head, quote, url) => {
      if (/^(data:|https?:|#|\/\/)/i.test(url)) return match;
      const file = path.resolve(baseDir, url.split('?')[0]);
      if (!fs.existsSync(file)) {
        console.warn(C.yellow(`    ! missing asset: ${url}`));
        return match;
      }
      return `${head}${quote}${dataUri(file)}${quote}`;
    }
  );

  return html;
}

/** Post-build checks against ad-network requirements. */
function validate(html, bytes, name) {
  const problems = [];
  const warnings = [];

  if (bytes > MAX_BYTES) {
    problems.push(`File is ${kb(bytes)} — over the 5 MB Mintegral limit.`);
  } else if (bytes > WARN_BYTES) {
    warnings.push(`File is ${kb(bytes)} — fine for Mintegral, but some networks cap at 2 MB.`);
  }

  // Required ad-network APIs must appear literally so static validators find them.
  if (!/window\.install\s*\(/.test(html)) {
    problems.push('No literal `window.install()` call found — Mintegral needs it for the CTA.');
  }
  if (!/window\.gameEnd\s*\(/.test(html)) {
    problems.push('No literal `window.gameEnd()` call found — Mintegral needs it at completion.');
  }
  if (!/window\.gameStart\s*\(/.test(html)) {
    warnings.push('No `window.gameStart()` call — optional, but recommended for engagement stats.');
  }
  if (!/window\.gameReady\s*\(/.test(html)) {
    warnings.push('No `window.gameReady()` call — optional, signals the playable finished loading.');
  }

  // No external requests allowed: everything must be baked in.
  const external = [];
  const attrRe = /\b(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+["']/gi;
  let m;
  while ((m = attrRe.exec(html))) external.push(m[0].slice(0, 70));
  if (/@import\s+(url\()?["']?https?:/i.test(html)) external.push('@import of a remote stylesheet');
  if (external.length) {
    problems.push('External resource requests found (must be inlined):\n      ' + external.join('\n      '));
  }
  if (/\bnew\s+XMLHttpRequest\b/.test(html) || /\bfetch\s*\(\s*["'`]https?:/.test(html)) {
    warnings.push('Network calls (fetch/XHR) detected — ad networks block these at runtime.');
  }
  if (/localStorage|sessionStorage|indexedDB/.test(html)) {
    warnings.push('Browser storage detected — unavailable in many ad webviews; guard it in try/catch.');
  }

  return { problems, warnings };
}

function buildProject(name) {
  const srcDir = path.join(PROJECTS_DIR, name, 'src');
  const entry = path.join(srcDir, 'index.html');
  if (!fs.existsSync(entry)) {
    console.log(C.dim(`  skipping ${name} (no src/index.html)`));
    return null;
  }

  console.log(C.bold(`\n  ${name}`));

  let html = inlineHtml(readText(entry), srcDir);
  html = html.replace(/<!--[\s\S]*?-->/g, '');           // strip HTML comments
  html = html.replace(/\n{3,}/g, '\n\n');                 // tidy blank lines

  const outDir = path.join(DIST_DIR, name);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'index.html');
  fs.writeFileSync(outFile, html);

  const bytes = Buffer.byteLength(html);
  const { problems, warnings } = validate(html, bytes, name);

  console.log(C.dim(`    -> dist/${name}/index.html  (${kb(bytes)}, single file)`));
  warnings.forEach((w) => console.log(C.yellow(`    warn  ${w}`)));
  problems.forEach((p) => console.log(C.red(`    FAIL  ${p}`)));
  if (!problems.length && !warnings.length) {
    console.log(C.green('    ok    passes Mintegral checks (size, inlining, required APIs)'));
  } else if (!problems.length) {
    console.log(C.green('    ok    passes Mintegral checks'));
  }

  return { name, bytes, ok: problems.length === 0 };
}

function main() {
  const only = process.argv[2];
  console.log(C.bold('\nBuilding playable ads'));

  if (!fs.existsSync(PROJECTS_DIR)) {
    console.error(C.red('No projects/ directory found.'));
    process.exit(1);
  }

  const names = fs
    .readdirSync(PROJECTS_DIR)
    .filter((n) => fs.statSync(path.join(PROJECTS_DIR, n)).isDirectory())
    .filter((n) => (only ? n === only : true));

  if (!names.length) {
    console.error(C.red(only ? `No project named "${only}".` : 'No projects found.'));
    process.exit(1);
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });

  const results = names.map(buildProject).filter(Boolean);
  writeIndexPage(results, DIST_DIR);

  const failed = results.filter((r) => !r.ok);
  console.log(
    failed.length
      ? C.red(`\n${failed.length} project(s) failed validation.\n`)
      : C.green(`\nBuilt ${results.length} playable(s). Upload dist/<name>/index.html to the network.\n`)
  );
  process.exit(failed.length ? 1 : 0);
}

main();
