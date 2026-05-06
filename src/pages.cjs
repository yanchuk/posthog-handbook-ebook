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

function buildCreditsPage(generatedAt) {
    return `<section class="credits-page">
<h1>PostHog Handbook</h1>
<p><a href="${ORIGINAL_HANDBOOK_URL}">Original handbook</a></p>
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

function buildCoverPage(coverFileName) {
    return `<section class="cover-page"><img src="assets/cover/${escapeHtml(coverFileName)}" alt="PostHog Handbook cover" /></section>`
}

function buildLandingPage({ generatedAt, chapters, epubFileName, coverFileName, pageUrl }) {
    const shareText = encodeURIComponent('PostHog Handbook Ebook')
    const shareUrl = encodeURIComponent(pageUrl)
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
    .download { display: inline-flex; align-items: center; justify-content: center; min-height: 3.25rem; padding: 0 1.2rem; margin: 1rem 0 1.25rem; border-radius: 6px; background: var(--accent); color: white; font-weight: 800; text-decoration: none; }
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
      <a class="download" href="./${escapeHtml(epubFileName)}">Download EPUB</a>
      <div class="meta">
        <span>${Number(chapters).toLocaleString('en-US')} handbook chapters</span>
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

module.exports = {
    buildCoverPage,
    buildCreditsPage,
    buildLandingPage,
}
