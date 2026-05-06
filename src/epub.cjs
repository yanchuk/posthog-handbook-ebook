const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { POSTHOG_SITE_DIR } = require('./config.cjs')

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function getLogomarkSvgInner() {
    const logomarkPath = path.join(POSTHOG_SITE_DIR, 'static/brand/posthog-logomark.svg')
    const svg = fs.readFileSync(logomarkPath, 'utf8')
    const match = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i)
    if (!match) {
        throw new Error(`Could not extract inner SVG content from ${logomarkPath}`)
    }
    return match[1].trim()
}

function validateGeneratedEpubStructure(files) {
    const errors = []
    const fileNames = new Set(files.keys())
    for (const [fileName, contents] of files.entries()) {
        if (/\.xhtml$/i.test(fileName)) {
            errors.push(...validateXhtml(contents).errors.map((error) => `${fileName}: ${error}`))
        }
        for (const match of contents.matchAll(/href="([^"]+)"/g)) {
            const href = match[1]
            if (href.startsWith('/')) {
                errors.push(`${fileName} contains root-relative href ${href}`)
            }
            if (/^(javascript|data|file):/i.test(href)) {
                errors.push(`${fileName} contains unsafe href ${href}`)
            }
            const hrefPath = href.split('#')[0]
            if (/\.xhtml$/i.test(hrefPath) && !/^[a-z][a-z0-9+.-]*:/i.test(hrefPath)) {
                const target = path.posix.normalize(path.posix.join(path.posix.dirname(fileName), hrefPath))
                if (!fileNames.has(target)) {
                    errors.push(`${fileName} links to missing internal file ${target}`)
                }
            }
        }
    }
    return { errors }
}

function validateXhtml(contents) {
    const errors = []
    const withoutEntities = contents.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, '')
    const amp = withoutEntities.match(/&/)
    if (amp) errors.push(`Unescaped ampersand at character ${amp.index}`)
    return { errors }
}

function writeFile(filePath, contents) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, contents)
}

function buildBookCss() {
    return `body { font-family: Georgia, serif; line-height: 1.55; color: #1d1d1d; }
h1, h2, h3 { font-family: sans-serif; line-height: 1.2; }
h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
h2 + *, h3 + *, h4 + * { break-before: avoid; page-break-before: avoid; }
.numbered-section { break-before: page; page-break-before: always; }
code, pre { font-family: monospace; }
pre { background: #f4f1ea; padding: 0.8em; white-space: pre-wrap; }
blockquote { border-left: 0.25em solid #d7c7a7; margin-left: 0; padding-left: 1em; color: #444; }
.source { color: #666; font-size: 0.85em; font-family: sans-serif; }
.component-placeholder, .image-placeholder { color: #666; font-style: italic; }
.component-placeholder { border: 1px solid #d8d1c1; background: #f4f1ea; padding: 0.75em; margin: 1em 0; font-style: normal; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
thead, tr, th, td { break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #d8d1c1; padding: 0.45em; vertical-align: top; }
th { background: #f4f1ea; font-family: sans-serif; }
.external-link-note { color: #666; font-size: 0.9em; }
.logic-operator { font-family: sans-serif; font-weight: bold; color: #666; margin: 0.5em 0; }
.table-cards { margin: 1em 0; }
.table-card { border: 1px solid #d8d1c1; padding: 0.75em; margin: 0.75em 0; break-inside: avoid; page-break-inside: avoid; }
.table-card h3 { margin-top: 0; }
.table-card dt { font-family: sans-serif; font-weight: bold; margin-top: 0.5em; }
.table-card dd { margin-left: 0; }
.color-swatch { display: inline-block; width: 0.85em; height: 0.85em; border: 1px solid #999; }
.diagram { break-inside: avoid; page-break-inside: avoid; margin: 1em 0; }
.diagram figcaption { color: #666; font-size: 0.85em; font-family: sans-serif; }
.product-screenshot, .video-embed { break-inside: avoid; page-break-inside: avoid; margin: 1em 0; }
.video-embed { border: 1px solid #d8d1c1; background: #f4f1ea; padding: 0.75em; }
.video-embed figcaption, .caption { color: #666; font-size: 0.9em; font-family: sans-serif; }
img { max-width: 100%; height: auto; }
.cover-page {
  text-align: center;
  background: #eeefe9;
  margin: 0;
  padding: 14% 8% 8%;
  min-height: 95vh;
  font-family: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #151515;
}
.cover-mark { margin: 0 auto 5em; max-width: 30%; }
.cover-mark svg { width: 100%; height: auto; display: block; }
.cover-title { font-size: 3.4em; font-weight: 700; letter-spacing: -0.02em; line-height: 1; text-transform: uppercase; margin: 0; }
.cover-title span { display: block; }
.cover-rule { border: 0; border-top: 2px solid #f54e00; width: 25%; margin: 1.5em auto; }
.cover-edition { font-size: 1.4em; color: #f54e00; font-weight: 600; margin: 0.6em 0 0.3em; }
.cover-meta { font-size: 0.95em; color: #5f5f5f; margin: 0.3em 0 1.5em; }
.cover-footer { font-size: 0.8em; color: #5f5f5f; margin: 4em 0 0; line-height: 1.5; }
.credits-page { font-family: sans-serif; max-width: 40em; }
.credits-page h1 { font-size: 2em; }
.credits-page dl { margin: 1em 0; }
.credits-page dt { font-weight: bold; margin-top: 0.75em; }
.credits-page dd { margin-left: 0; }
`
}

function pageTemplate({ title, body, stylesheetHref = 'styles/book.css' }) {
    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" type="text/css" href="${escapeHtml(stylesheetHref)}" />
</head>
<body>
${body}
</body>
</html>
`
}

function buildNav(chapters) {
    const items = chapters.map((chapter) => `<li><a href="${chapter.href}">${escapeHtml(chapter.title)}</a></li>`).join('\n')
    return pageTemplate({
        title: 'PostHog Handbook',
        body: `<nav epub:type="toc" id="toc"><h1>PostHog Handbook</h1><ol>${items}</ol></nav>`,
    })
}

function assetManifestId(manifestHref) {
    return `asset-${manifestHref.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
}

function buildOpf(chapters, generatedDate, assets = [], extraDocuments = [], options = {}) {
    const {
        title = 'PostHog Handbook',
        bookId = 'posthog-handbook',
        description = '',
        subjects = [],
        publisher = '',
        rights = '',
    } = options
    const subjectTags = subjects.map((s) => `    <dc:subject>${escapeHtml(s)}</dc:subject>`).join('\n')
    const descriptionTag = description ? `    <dc:description>${escapeHtml(description)}</dc:description>` : ''
    const publisherTag = publisher ? `    <dc:publisher>${escapeHtml(publisher)}</dc:publisher>` : ''
    const rightsTag = rights ? `    <dc:rights>${escapeHtml(rights)}</dc:rights>` : ''
    const extraManifestItems = extraDocuments
        .map((document) => `<item id="${document.id}" href="${document.href}" media-type="application/xhtml+xml" />`)
        .join('\n    ')
    const manifestItems = chapters
        .map((chapter) => `<item id="${chapter.id}" href="${chapter.href}" media-type="application/xhtml+xml" />`)
        .join('\n    ')
    const assetItems = assets
        .map((asset) => {
            const properties = asset.properties ? ` properties="${escapeHtml(asset.properties)}"` : ''
            return `<item id="${assetManifestId(asset.manifestHref)}" href="${asset.manifestHref}" media-type="${asset.mediaType}"${properties} />`
        })
        .join('\n    ')
    const spineItems = [...extraDocuments, ...chapters].map((item) => `<itemref idref="${item.id}" />`).join('\n    ')
    return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeHtml(bookId)}</dc:identifier>
    <dc:title>${escapeHtml(title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>PostHog</dc:creator>
${descriptionTag}
${subjectTags}
${publisherTag}
${rightsTag}
    <meta property="dcterms:modified">${generatedDate}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="style" href="styles/book.css" media-type="text/css" />
    ${extraManifestItems}
    ${manifestItems}
    ${assetItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>
`
}

function getCoverSvg(edition, logomarkSvgInner = '', opts = {}) {
    const year = opts.year || new Date().getUTCFullYear()
    const label = edition.label || ''
    const chapters = Number(edition.chapters) || 0

    return `<svg width="1600" height="2400" xmlns="http://www.w3.org/2000/svg">
<rect width="1600" height="2400" fill="#eeefe9"/>
<g transform="translate(560,340) scale(9.6)">${logomarkSvgInner}</g>
<text x="800" y="1180" text-anchor="middle" font-family="Arial, sans-serif" font-size="200" font-weight="700" fill="#151515" letter-spacing="-3">POSTHOG</text>
<text x="800" y="1380" text-anchor="middle" font-family="Arial, sans-serif" font-size="200" font-weight="700" fill="#151515" letter-spacing="-3">HANDBOOK</text>
<rect x="700" y="1455" width="200" height="6" fill="#F54E00"/>
<text x="800" y="1590" text-anchor="middle" font-family="Arial, sans-serif" font-size="84" font-weight="600" fill="#F54E00">${escapeHtml(label)}</text>
<text x="800" y="2225" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="400" fill="#5F5F5F">Unofficial conversion · ${year}</text>
<text x="800" y="2285" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="400" fill="#5F5F5F">ianchuk.com</text>
</svg>`
}

async function writeCoverAssets(outputDir, epubRoot, edition) {
    if (!edition || !edition.coverFileName) {
        throw new Error('writeCoverAssets requires an edition with a coverFileName')
    }
    const logomarkInner = getLogomarkSvgInner()
    const year = new Date().getUTCFullYear()
    const coverBuffer = await sharp(Buffer.from(getCoverSvg(edition, logomarkInner, { year }))).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    const epubManifestHref = `assets/cover/${edition.coverFileName}`
    writeFile(path.join(epubRoot, 'OEBPS', epubManifestHref), coverBuffer)
    writeFile(path.join(outputDir, edition.coverFileName), coverBuffer)
    return {
        manifestHref: epubManifestHref,
        mediaType: 'image/jpeg',
        properties: 'cover-image',
    }
}

function buildHeadersFile(editions) {
    const epubRules = editions
        .map(
            (edition) => `/${edition.epubFileName}
  Content-Type: application/epub+zip
  Cache-Control: public, max-age=3600`
        )
        .join('\n\n')
    const coverRules = editions
        .map(
            (edition) => `/${edition.coverFileName}
  Cache-Control: public, max-age=86400`
        )
        .join('\n\n')
    return `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

${epubRules}

${coverRules}
`
}

module.exports = {
    buildBookCss,
    buildHeadersFile,
    buildNav,
    buildOpf,
    escapeHtml,
    getCoverSvg,
    getLogomarkSvgInner,
    pageTemplate,
    validateGeneratedEpubStructure,
    validateXhtml,
    writeCoverAssets,
    writeFile,
}
