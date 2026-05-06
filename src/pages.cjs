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

function formatHumanDate(iso) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso)
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

const CREDITS_TAGLINES = {
    full: 'An offline EPUB conversion of the complete public PostHog handbook. Every chapter PostHog has published.',
    short: 'A curated subset of the PostHog handbook focused on strategy, culture, brand, marketing, and sales-enablement — the parts most useful to people outside the company. Internal procedures (onboarding, post-mortems, hiring workflows) and engineering deep-dives (ClickHouse internals, infrastructure runbooks) are excluded.',
}

function buildCreditsPage(edition, generatedAt, logomarkSvgInner = '') {
    const label = edition && edition.label ? edition.label : ''
    const editionId = edition && edition.id ? edition.id : ''
    const chapterCount = edition && edition.chapters ? Number(edition.chapters) : null
    const labelText = chapterCount
        ? `${label} · ${chapterCount} chapters`
        : label
    const labelLine = labelText ? `\n  <p class="credits-edition">${escapeHtml(labelText)}</p>` : ''
    const mark = logomarkSvgInner
        ? `\n  <div class="credits-mark"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30" role="img" aria-label="PostHog logomark">${logomarkSvgInner}</svg></div>`
        : ''
    const tagline = CREDITS_TAGLINES[editionId] || 'An offline EPUB conversion of the public PostHog handbook.'
    const repoShort = REPO_URL.replace(/^https?:\/\//, '')
    const converterShort = CONVERTER_URL.replace(/^https?:\/\//, '')
    return `<section class="credits-page">${mark}
  <h1 class="credits-title">PostHog Handbook</h1>${labelLine}
  <hr class="credits-rule" />
  <p class="credits-tagline">${escapeHtml(tagline)}</p>
  <p class="credits-thanks">Thanks to the PostHog team for the handbook. All rights belong to them.</p>
  <dl class="credits-meta">
    <dt>Original</dt>
    <dd><a href="${ORIGINAL_HANDBOOK_URL}">posthog.com/handbook</a></dd>
    <dt>Made by</dt>
    <dd>${escapeHtml(CONVERTER_NAME)} · <a href="${CONVERTER_URL}">${escapeHtml(converterShort)}</a></dd>
    <dt>Source</dt>
    <dd><a href="${REPO_URL}">${escapeHtml(repoShort)}</a></dd>
    <dt>Updated</dt>
    <dd>${escapeHtml(formatHumanDate(generatedAt))}</dd>
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
    const trimmedUrl = pageUrl.replace(/\/$/, '')
    const shareText = encodeURIComponent('PostHog Handbook Ebook')
    const shareUrl = encodeURIComponent(trimmedUrl + '/')
    const updatedDate = String(generatedAt).slice(0, 10)
    const description = `Download the PostHog handbook in EPUB. Two editions: Full (every chapter) and Short (strategy, culture, brand). Refreshed weekly.`

    const editionDescriptions = {
        full: 'Everything PostHog has published.',
        short: 'The good stuff for outsiders — strategy, culture, brand, marketing.',
    }
    const editionExtras = {
        full: '',
        short: 'No internal procedures.',
    }

    const formatSize = (bytes) => {
        if (!bytes) return ''
        const mb = bytes / 1_000_000
        return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`
    }

    const cards = editions
        .map((edition) => {
            const desc = editionDescriptions[edition.id] || `${edition.label}.`
            const extra = editionExtras[edition.id] ? `<p class="card-extra">${escapeHtml(editionExtras[edition.id])}</p>` : ''
            const size = formatSize(edition.sizeBytes)
            const sizeMeta = size ? `${escapeHtml(size)} · ` : ''
            const buttonLabel = edition.id === 'full' ? 'Full' : 'Short'
            return `      <article class="card">
        <p class="card-label">${escapeHtml(edition.label)}</p>
        <p class="card-desc">${escapeHtml(desc)} ${edition.chapters} chapters.</p>
        ${extra}
        <a class="download" href="./${escapeHtml(edition.epubFileName)}" aria-label="Download ${escapeHtml(edition.label)} EPUB, ${edition.chapters} chapters${size ? `, ${escapeHtml(size)}` : ''}">Download ${buttonLabel} (.epub)</a>
        <p class="card-meta">${sizeMeta}Updated ${escapeHtml(updatedDate)}</p>
      </article>`
        })
        .join('\n')

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite',
                '@id': `${trimmedUrl}/#website`,
                url: `${trimmedUrl}/`,
                name: 'PostHog Handbook Ebook',
                description,
                inLanguage: 'en',
            },
            ...editions.map((edition) => ({
                '@type': 'Book',
                '@id': `${trimmedUrl}/#book-${edition.id}`,
                name: `PostHog Handbook: ${edition.label}`,
                bookEdition: edition.label,
                bookFormat: 'https://schema.org/EBook',
                encodingFormat: 'application/epub+zip',
                contentUrl: `${trimmedUrl}/${edition.epubFileName}`,
                url: `${trimmedUrl}/`,
                inLanguage: 'en',
                numberOfPages: Number(edition.chapters),
                dateModified: generatedAt,
                isAccessibleForFree: true,
                author: { '@type': 'Organization', name: 'PostHog Inc.', url: 'https://posthog.com' },
                publisher: { '@type': 'Person', name: 'Oleksii Ianchuk', url: 'https://ianchuk.com' },
            })),
            {
                '@type': 'Person',
                '@id': `${trimmedUrl}/#converter`,
                name: 'Oleksii Ianchuk',
                url: 'https://ianchuk.com',
                sameAs: ['https://github.com/yanchuk'],
            },
        ],
    }

    const logomarkSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 30" role="img" aria-label="PostHog logomark"><path d="M10.8914 17.2057c-.3685.7371-1.42031.7371-1.78884 0L8.2212 15.443c-.14077-.2815-.14077-.6129 0-.8944l.88136-1.7627c.36853-.7371 1.42034-.7371 1.78884 0l.8814 1.7627c.1407.2815.1407.6129 0 .8944l-.8814 1.7627zM10.8914 27.2028c-.3685.737-1.42031.737-1.78884 0L8.2212 25.44c-.14077-.2815-.14077-.6129 0-.8944l.88136-1.7627c.36853-.7371 1.42034-.7371 1.78884 0l.8814 1.7627c.1407.2815.1407.6129 0 .8944l-.8814 1.7628z" fill="#1D4AFF"/><path d="M0 23.4082c0-.8909 1.07714-1.3371 1.70711-.7071l4.58338 4.5834c.62997.63.1838 1.7071-.7071 1.7071H.999999c-.552284 0-.999999-.4477-.999999-1v-4.5834zm0-4.8278c0 .2652.105357.5196.292893.7071l9.411217 9.4112c.18753.1875.44189.2929.70709.2929h5.1692c.8909 0 1.3371-1.0771.7071-1.7071L1.70711 12.7041C1.07714 12.0741 0 12.5203 0 13.4112v5.1692zm0-9.99701c0 .26521.105357.51957.292893.7071L19.7011 28.6987c.1875.1875.4419.2929.7071.2929h5.1692c.8909 0 1.3371-1.0771.7071-1.7071L1.70711 2.70711C1.07715 2.07715 0 2.52331 0 3.41421v5.16918zm9.997 0c0 .26521.1054.51957.2929.7071l17.994 17.99401c.63.63 1.7071.1838 1.7071-.7071v-5.1692c0-.2652-.1054-.5196-.2929-.7071l-17.994-17.994c-.63-.62996-1.7071-.18379-1.7071.70711v5.16918zm11.7041-5.87628c-.63-.62997-1.7071-.1838-1.7071.7071v5.16918c0 .26521.1054.51957.2929.7071l7.997 7.99701c.63.63 1.7071.1838 1.7071-.7071v-5.1692c0-.2652-.1054-.5196-.2929-.7071l-7.997-7.99699z" fill="#F9BD2B"/><path d="M42.5248 23.5308l-9.4127-9.4127c-.63-.63-1.7071-.1838-1.7071.7071v13.1664c0 .5523.4477 1 1 1h14.5806c.5523 0 1-.4477 1-1v-1.199c0-.5523-.4496-.9934-.9973-1.0647-1.6807-.2188-3.2528-.9864-4.4635-2.1971zm-6.3213 2.2618c-.8829 0-1.5995-.7166-1.5995-1.5996 0-.8829.7166-1.5995 1.5995-1.5995.883 0 1.5996.7166 1.5996 1.5995 0 .883-.7166 1.5996-1.5996 1.5996z" fill="#000"/><path d="M0 27.9916c0 .5523.447715 1 1 1h4.58339c.8909 0 1.33707-1.0771.70711-1.7071l-4.58339-4.5834C1.07714 22.0711 0 22.5173 0 23.4082v4.5834zM9.997 10.997L1.70711 2.70711C1.07714 2.07714 0 2.52331 0 3.41421v5.16918c0 .26521.105357.51957.292893.7071L9.997 18.9946V10.997zM1.70711 12.7041C1.07714 12.0741 0 12.5203 0 13.4112v5.1692c0 .2652.105357.5196.292893.7071L9.997 28.9916V20.994l-8.28989-8.2899z" fill="#1D4AFF"/><path d="M19.994 11.4112c0-.2652-.1053-.5196-.2929-.7071l-7.997-7.99699c-.6299-.62997-1.70709-.1838-1.70709.7071v5.16918c0 .26521.10539.51957.29289.7071l9.7041 9.70411v-7.5834zM9.99701 28.9916h5.58339c.8909 0 1.3371-1.0771.7071-1.7071L9.99701 20.994v7.9976zM9.99701 10.997v7.5834c0 .2652.10539.5196.29289.7071l9.7041 9.7041v-7.5834c0-.2652-.1053-.5196-.2929-.7071L9.99701 10.997z" fill="#F54E00"/></svg>'

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PostHog Handbook EPUB — offline copy of the public handbook</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="author" content="${CONVERTER_NAME}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${trimmedUrl}/">
  <meta name="theme-color" content="#f54e00">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="PostHog Handbook Ebook">
  <meta property="og:title" content="PostHog Handbook EPUB">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${trimmedUrl}/${escapeHtml(coverFileName)}">
  <meta property="og:url" content="${trimmedUrl}/">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="PostHog Handbook EPUB">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${trimmedUrl}/${escapeHtml(coverFileName)}">
  <script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root { color-scheme: light; --paper: #eeefe9; --ink: #151515; --muted: #5f5f5f; --accent: #f54e00; --line: #e3ddca; --card: #fbfaf3; }
    * { box-sizing: border-box; }
    html, body { background: var(--paper); }
    body { margin: 0; font-family: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); line-height: 1.5; }
    .wrap { max-width: 56rem; margin: 0 auto; padding: clamp(1.5rem, 5vw, 4rem) clamp(1.25rem, 4vw, 3rem) 4rem; }
    .brand { display: flex; align-items: center; gap: 0.5rem; margin: 0 0 3rem; font-weight: 700; font-size: 1.05rem; letter-spacing: -0.01em; }
    .brand svg { width: 1.4rem; height: 1.4rem; display: block; }
    h1 { font-size: clamp(2.6rem, 6vw, 4.6rem); font-weight: 700; letter-spacing: -0.025em; line-height: 1.02; margin: 0 0 1rem; max-width: 18ch; }
    .lede { font-size: clamp(1.05rem, 1.6vw, 1.2rem); color: var(--muted); margin: 0 0 2rem; max-width: 38em; }
    .rule { border: 0; border-top: 2px solid var(--accent); width: 4rem; margin: 2.5rem 0; }
    .label { font-size: 0.85rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink); margin: 0 0 1rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem; margin: 0 0 2rem; }
    .card { background: var(--card); border: 1px solid var(--line); border-top: 3px solid var(--accent); padding: 1.4rem 1.4rem 1.6rem; border-radius: 4px; display: flex; flex-direction: column; }
    .card-label { font-size: 0.85rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin: 0 0 0.6rem; }
    .card-desc { margin: 0 0 0.5rem; font-size: 1.02rem; }
    .card-extra { margin: 0 0 1rem; font-size: 0.92rem; color: var(--muted); }
    .download { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: 0 1rem; margin: auto 0 0.5rem; border-radius: 4px; background: var(--accent); color: #fff; font-weight: 600; font-size: 0.95rem; text-decoration: none; transition: background 0.15s; }
    .download:hover { background: #d94400; }
    .card-meta { margin: 0.5rem 0 0; font-size: 0.85rem; color: var(--muted); }
    .refresh { font-size: 0.95rem; color: var(--muted); margin: 0 0 2.5rem; }
    .credit { font-size: 0.92rem; color: var(--muted); margin: 0 0 1.5rem; max-width: 44em; }
    .credit a { color: var(--ink); }
    .share { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1.5rem; }
    .share a { font-size: 0.85rem; color: var(--muted); border: 1px solid var(--line); background: #fff; border-radius: 999px; padding: 0.4rem 0.8rem; text-decoration: none; }
    .share a:hover { color: var(--ink); border-color: var(--muted); }
    @media (max-width: 640px) { h1 { letter-spacing: -0.015em; } }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="brand">${logomarkSvg}<span>PostHog Handbook Ebook</span></div>
    <h1>PostHog Handbook, offline.</h1>
    <p class="lede">Read it on a plane, on a Kindle, in bed. The whole handbook in EPUB, refreshed weekly from posthog.com/handbook.</p>
    <hr class="rule" />
    <p class="label">Two flavors</p>
    <div class="cards">
${cards}
    </div>
    <p class="refresh">Refreshed every Monday at 8am UTC from <a href="${ORIGINAL_HANDBOOK_URL}">posthog.com/handbook</a>.</p>
    <hr class="rule" />
    <p class="credit">Made by <a href="${CONVERTER_URL}">${CONVERTER_NAME}</a>. The handbook is © PostHog — we're just putting it in a different file format. <a href="${REPO_URL}">Source on GitHub</a>.</p>
    <div class="share" aria-label="Share">
      <a href="https://twitter.com/intent/tweet?text=${shareText}&amp;url=${shareUrl}">Share on X</a>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}">Share on LinkedIn</a>
    </div>
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
