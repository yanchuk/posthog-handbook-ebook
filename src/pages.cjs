const {
    CONVERTER_NAME,
    CONVERTER_URL,
    ORIGINAL_HANDBOOK_URL,
    REPO_URL,
} = require('./config.cjs')

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function buildCreditsPage(generatedAt, editionLabel = '') {
    const labelLine = editionLabel ? `<p class="edition-label">${escapeHtml(editionLabel)}</p>\n` : ''
    return `<section class="credits-page">
<h1>PostHog Handbook</h1>
${labelLine}<p><a href="${ORIGINAL_HANDBOOK_URL}">Original handbook</a></p>
<p>Thanks to the PostHog team for the handbook. All rights belong to them.</p>
<dl>
  <dt>Converted to Ebook by ${CONVERTER_NAME}</dt>
  <dd><a href="${CONVERTER_URL}">${CONVERTER_URL}</a></dd>
  <dt>Contribute</dt>
  <dd><a href="${REPO_URL}">${REPO_URL}</a></dd>
  <dt>Updated</dt>
  <dd>${escapeHtml(generatedAt)}</dd>
</dl>
</section>`
}

function buildCoverPage(edition, logomarkSvgInner, opts = {}) {
    const year = opts.year || new Date().getUTCFullYear()
    return `<section class="cover-page">
  <div class="cover-mark"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30" role="img" aria-label="PostHog logomark">${logomarkSvgInner}</svg></div>
  <h1 class="cover-title"><span>PostHog</span><span>Handbook</span></h1>
  <hr class="cover-rule" />
  <p class="cover-edition">${escapeHtml(edition.label)}</p>
  <p class="cover-footer">Unofficial conversion · ${year}<br />ianchuk.com</p>
</section>`
}

function buildLandingPage({ generatedAt, editions, coverFileName, pageUrl }) {
    const shareText = encodeURIComponent('PostHog Handbook Ebook')
    const shareUrl = encodeURIComponent(pageUrl)
    const downloads = editions
        .map(
            (edition) => `      <a class="download" href="./${escapeHtml(edition.epubFileName)}">Download ${escapeHtml(edition.label)}</a>
      <p class="download-meta">${Number(edition.chapters).toLocaleString('en-US')} chapters</p>`
        )
        .join('\n')

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PostHog Handbook Ebook</title>
  <meta name="description" content="A community-generated EPUB version of the PostHog Handbook.">
  <style>
    :root { color-scheme: light; --ink: #151515; --muted: #5f5f5f; --paper: #eeefe9; --line: #d8d1c1; --accent: #f54e00; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: #faf9f5; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(280px, 0.85fr) minmax(320px, 1.15fr); gap: clamp(2rem, 5vw, 5rem); align-items: center; max-width: 1120px; margin: 0 auto; padding: clamp(1.25rem, 4vw, 4rem); }
    img { width: 100%; max-width: 380px; border-radius: 8px; box-shadow: 0 18px 45px rgb(21 21 21 / 22%); }
    h1 { font-size: clamp(2.5rem, 7vw, 5.8rem); line-height: 0.94; margin: 0 0 1rem; letter-spacing: 0; }
    p { font-size: 1.08rem; line-height: 1.65; margin: 0 0 1rem; color: var(--muted); }
    a { color: var(--ink); }
    .download { display: inline-flex; align-items: center; justify-content: center; min-height: 3.25rem; padding: 0 1.2rem; margin: 0.5rem 0.75rem 0.25rem 0; border-radius: 6px; background: var(--accent); color: white; font-weight: 800; text-decoration: none; }
    .download-meta { margin: 0 0 0.75rem; font-size: 0.9rem; }
    .meta { display: grid; gap: 0.45rem; margin: 1.25rem 0; padding: 1rem 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); color: var(--muted); }
    .share { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.25rem; }
    .share a { border: 1px solid var(--line); border-radius: 999px; padding: 0.45rem 0.75rem; text-decoration: none; background: white; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; } img { max-width: 260px; } }
  </style>
</head>
<body>
  <main>
    <aside><img src="./${escapeHtml(coverFileName)}" alt="PostHog Handbook Ebook cover"></aside>
    <section>
      <h1>PostHog Handbook Ebook</h1>
      <p>A reflowable EPUB conversion of the public PostHog Handbook for offline reading in Apple Books, Kindle, and other ebook readers.</p>
${downloads}
      <div class="meta">
        <span>Updated ${escapeHtml(generatedAt)}</span>
        <span><a href="${ORIGINAL_HANDBOOK_URL}">Original PostHog Handbook</a></span>
      </div>
      <p>Thanks to the PostHog team for the handbook. All rights belong to them.</p>
      <p>Converted to Ebook by <a href="${CONVERTER_URL}">${CONVERTER_NAME}</a>. Contribute on <a href="${REPO_URL}">GitHub</a>.</p>
      <div class="share" aria-label="Share">
        <a href="https://twitter.com/intent/tweet?text=${shareText}&amp;url=${shareUrl}">Share on X</a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}">Share on LinkedIn</a>
      </div>
    </section>
  </main>
</body>
</html>
`
}

function buildRobotsTxt(pageUrl) {
    const trimmed = pageUrl.replace(/\/$/, '')
    return `User-agent: *
Allow: /
Sitemap: ${trimmed}/sitemap.xml
`
}

function buildSitemapXml(pageUrl, generatedAt) {
    const trimmed = pageUrl.replace(/\/$/, '')
    const lastmod = String(generatedAt).slice(0, 10)
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${trimmed}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
}

module.exports = {
    buildCoverPage,
    buildCreditsPage,
    buildLandingPage,
    buildRobotsTxt,
    buildSitemapXml,
}
