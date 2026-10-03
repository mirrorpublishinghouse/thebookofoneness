#!/usr/bin/env node
'use strict';

/**
 * build-term-pages.js
 * Generates one static HTML page per Core Term in glossary/, plus the
 * the-rules alias page, from glossary-data.js (which is regenerated from
 * scripts/glossary-definitions.json).
 *
 * The site is served by GitHub Pages from the repo root, so pages are
 * written to glossary/, the folder the live URLs resolve to. The old
 * public/ target matched netlify.toml and vercel.json, neither of which
 * serves this site.
 *
 * The term list is read from glossary-data.js rather than kept here.
 * A second hand-kept copy is how this script fell behind Glossary v2.2.
 *
 * Run from the mirror/oneness-website/ directory:
 *   node scripts/build-term-pages.js
 */

const fs   = require('fs');
const path = require('path');

// === PATHS ===
const ROOT     = path.join(__dirname, '..');
const DEFS_JSON = path.join(__dirname, 'glossary-definitions.json');
const OUT_DIR  = path.join(ROOT, 'glossary');
const EXPECTED_TERMS = 64;   // CORE_TERM_GLOSSARY_v2.2_Oct2026

// === LOAD TERMS FROM glossary-data.js ===
// glossary-data.js is a browser global. Evaluate it with a window shim.
const vm = require('vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'glossary-data.js'), 'utf8'), sandbox);
const G = sandbox.window.GLOSSARY;
const BUCKETS = G.BUCKETS;
const TERMS = G.TERMS;

// Old slug kept alive so indexed URLs do not 404. Matches glossary-data.js,
// which keeps the-rules in DEFS only.
const ALIASES = [ { from: 'the-rules', to: 'the-rule', name: 'THE RULES' } ];

// === DERIVED LOOKUPS ===
const BUCKET_BY_ID    = {};
for (const b of BUCKETS) BUCKET_BY_ID[b.id] = b;

const TERMS_BY_BUCKET = {};
for (const b of BUCKETS) {
  TERMS_BY_BUCKET[b.id] = TERMS.filter(term => term.bucket === b.id);
}

// === HELPERS ===

// Safe HTML attribute + text escaping
function esc(str) {
  return (str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

// Title-case: capitalize first letter of every word
function titleCase(str) {
  return str.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

// Resolve the href for any term (handles dup redirect)
function termHref(term) {
  return (term.dup || term.slug) + '.html';
}

// Arrow SVG for related cards
const CARD_ARR = '<svg class="term-card__arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19 L19 5 M9 5 L19 5 L19 15"/></svg>';

// Arrow SVG for nav CTA
const NAV_ARR = '<svg class="arr-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M5 12 L19 12 M13 6 L19 12 L13 18"/></svg>';

// Render prev or next sequence cell
function seqLink(bucketTerms, bucketNameUpper, siblingTerm, dir) {
  if (!siblingTerm) {
    // Disabled placeholder so the grid still fills both columns
    return `      <div class="term-page__seq-link term-page__seq-link--${dir}" aria-disabled="true" style="opacity:0.25;pointer-events:none">
        <span class="term-page__seq-link-eyebrow">
          ${dir === 'prev' ? '← PREV' : 'NEXT →'}
        </span>
      </div>`;
  }
  const sibPos = bucketTerms.findIndex(x => x.slug === siblingTerm.slug) + 1;
  const href   = termHref(siblingTerm);
  const eyebrow = dir === 'prev'
    ? `<span class="term-page__seq-edge">←</span> PREV · TERM ${sibPos}`
    : `NEXT · TERM ${sibPos} <span class="term-page__seq-edge">→</span>`;
  return `      <a class="term-page__seq-link term-page__seq-link--${dir}" href="${href}">
        <span class="term-page__seq-link-eyebrow">${eyebrow}</span>
        <span class="term-page__seq-link-bucket">// ${bucketNameUpper}</span>
        <span class="term-page__seq-link-name">${esc(siblingTerm.name)}</span>
      </a>`;
}

// === PAGE GENERATOR ===
function generatePage(term) {
  const bucket       = BUCKET_BY_ID[term.bucket];
  const bucketTerms  = TERMS_BY_BUCKET[term.bucket];
  const pos          = bucketTerms.findIndex(x => x.slug === term.slug);
  const total        = bucketTerms.length;
  const posDisplay   = pos + 1;
  const bucketNameUp = bucket.name.toUpperCase();
  const breadLabel   = titleCase(term.name);

  // Related: up to 4 bucket siblings, excluding this term
  const related = bucketTerms.filter(x => x.slug !== term.slug).slice(0, 4);

  const relatedCards = related.map(r => `        <a class="term-card" href="${termHref(r)}">
          <div class="term-card__bucket">// ${bucketNameUp}</div>
          <h3 class="term-card__name">${esc(r.name)}</h3>
          ${CARD_ARR}
        </a>`).join('\n');

  const prevTerm = pos > 0 ? bucketTerms[pos - 1] : null;
  const nextTerm = pos < total - 1 ? bucketTerms[pos + 1] : null;

  // JSON-LD (meta description = snippet; JSON-LD description = full definition per template comment)
  const definedTermLD = JSON.stringify({
    '@context':   'https://schema.org',
    '@type':      'DefinedTerm',
    'name':       term.name,
    'alternateName': titleCase(term.name),
    'termCode':   term.slug,
    'url':        `https://thebookofoneness.com/glossary/${term.slug}`,
    'description': term.definition,
    'inDefinedTermSet': {
      '@type': 'DefinedTermSet',
      'name':  'THE BOOK OF ONENESS • Core Terms Glossary',
      'url':   'https://thebookofoneness.com/#glossary',
    },
    'isPartOf': {
      '@type':     'Book',
      'name':      'THE BOOK OF ONENESS',
      'author':    { '@type': 'Person', 'name': '[MIRRØR]' },
      'publisher': { '@type': 'Organization', 'name': 'MIRROR Publishing' },
    },
  }, null, 2);

  const breadcrumbLD = JSON.stringify({
    '@context': 'https://schema.org',
    '@type':    'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'Home',     'item': 'https://thebookofoneness.com/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'Glossary', 'item': 'https://thebookofoneness.com/#glossary' },
      { '@type': 'ListItem', 'position': 3, 'name': bucket.name, 'item': `https://thebookofoneness.com/#glossary?bucket=${bucket.id}` },
      { '@type': 'ListItem', 'position': 4, 'name': term.name,  'item': `https://thebookofoneness.com/glossary/${term.slug}` },
    ],
  }, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(term.name)} • THE BOOK OF ONENESS by [MIRRØR]</title>
<meta name="description" content="${esc(term.snippet)}">
<link rel="canonical" href="https://thebookofoneness.com/glossary/${term.slug}">

<!-- Open Graph -->
<meta property="og:title" content="${esc(term.name)} • THE BOOK OF ONENESS by [MIRRØR]">
<meta property="og:description" content="${esc(term.snippet)}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://thebookofoneness.com/glossary/${term.slug}">
<meta name="twitter:card" content="summary">

<script type="application/ld+json">
${definedTermLD}
<\/script>
<script type="application/ld+json">
${breadcrumbLD}
<\/script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../glossary-search.css">
<link rel="stylesheet" href="../term-page.css">
</head>
<body>

<div class="scanlines" aria-hidden="true"></div>
<div class="grain" aria-hidden="true"></div>
<div class="vignette" aria-hidden="true"></div>

<nav class="nav">
  <div class="nav__inner">
    <a class="nav__brand" href="/">THE BOOK OF ONENESS</a>
    <ul class="nav__links">
      <li><a href="/#the-book">The Book</a></li>
      <li><a href="/#listen">Listen</a></li>
      <li><a href="/#watch">Watch</a></li>
      <li><a href="/#explore">Explore</a></li>
      <li><a href="/#glossary" class="is-active">Glossary</a></li>
      <li><a href="/#about">About</a></li>
    </ul>
    <a class="nav__cta" href="https://books2read.com/thebookofoneness">GET THE BOOK ${NAV_ARR}</a>
  </div>
</nav>

<main class="term-page" data-screen-label="term-${term.slug}">
  <div class="container">

    <nav class="term-page__breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a>
      <span class="sep">/</span>
      <a href="/#glossary">Glossary</a>
      <span class="sep">/</span>
      <a class="bucket" href="/#glossary?bucket=${bucket.id}">${esc(bucket.name)}</a>
      <span class="sep">/</span>
      <span aria-current="page">${esc(breadLabel)}</span>
    </nav>

    <header class="term-page__head">
      <div>
        <p class="term-page__eyebrow">
          <span class="slash">//</span>GLOSSARY · ${bucketNameUp}
        </p>
        <h1 class="term-page__title">${esc(term.name)}</h1>
      </div>
      <span class="term-page__chip">
        <span class="num">${bucket.number}</span>BUCKET · TERM ${posDisplay}/${total}
      </span>
    </header>

    <div class="term-page__definition">
      <p>${esc(term.definition)}</p>
    </div>

    <hr class="term-page__rule">

    <section class="term-page__related" aria-labelledby="related-head">
      <div class="term-page__related-head">
        <h2 class="term-page__related-eyebrow" id="related-head">
          <span class="slash">//</span>ALSO IN ${bucketNameUp}
        </h2>
        <span class="term-page__related-meta">// ${total} terms · bucket ${bucket.number}</span>
      </div>
      <div class="term-page__related-grid">
${relatedCards}
      </div>
    </section>

    <nav class="term-page__seq" aria-label="Within ${esc(bucket.name)}">
${seqLink(bucketTerms, bucketNameUp, prevTerm, 'prev')}
${seqLink(bucketTerms, bucketNameUp, nextTerm, 'next')}
    </nav>

  </div>
</main>

<footer class="footer">
  <div class="container">
    <div class="footer__bottom">
      <span>© MIRROR Publishing 2026 · All rights reserved</span>
      <span><a href="/">← The Book of Oneness</a></span>
      <a href="https://books2read.com/thebookofoneness" style="color:var(--pink)">GET THE BOOK →</a>
    </div>
  </div>
</footer>

<script src="../glossary-data.js"><\/script>
<script src="../glossary-search.js"><\/script>

</body>
</html>`;
}

// === ALIAS PAGE ===
function generateAlias(a) {
  const url = `https://thebookofoneness.com/glossary/${a.to}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${a.name} • THE BOOK OF ONENESS by [MIRRØR]</title>
<link rel="canonical" href="${url}">
<meta name="robots" content="noindex, follow">
<meta http-equiv="refresh" content="0; url=${a.to}.html">
<script>location.replace('${a.to}.html' + location.search + location.hash);<\/script>
</head>
<body>
<p><a href="${a.to}.html">${a.to.toUpperCase().replace(/-/g, ' ')}</a></p>
</body>
</html>
`;
}

// === MAIN ===
if (TERMS.length !== EXPECTED_TERMS) {
  console.error(`Expected ${EXPECTED_TERMS} terms, glossary-data.js has ${TERMS.length}. Nothing written.`);
  process.exit(1);
}
const missing = TERMS.filter(x => !x.definition || !x.snippet).map(x => x.slug);
if (missing.length) {
  console.error('Terms with no definition or snippet: ' + missing.join(', ') + '. Nothing written.');
  process.exit(1);
}

let count = 0;
for (const term of TERMS) {
  const html    = generatePage(term);
  const outPath = path.join(OUT_DIR, term.slug + '.html');
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`  + ${term.slug}.html`);
  count++;
}
for (const a of ALIASES) {
  fs.writeFileSync(path.join(OUT_DIR, a.from + '.html'), generateAlias(a), 'utf8');
  console.log(`  ~ ${a.from}.html (alias to ${a.to}.html)`);
}

console.log(`\n${count} term pages and ${ALIASES.length} alias page written to glossary/`);
