#!/usr/bin/env node

const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const {
    COVER_FILE_NAME,
    DEFAULT_OUTPUT_DIR,
    EPUB_FILE_NAME,
    HANDBOOK_DIR,
    POSTHOG_SITE_DIR,
    PROJECT_ROOT,
    PUBLIC_PAGE_URL,
} = require('./config.cjs')
const { buildCoverPage, buildCreditsPage, buildLandingPage } = require('./pages.cjs')
const {
    discoverHandbookFiles,
    fileFromSlug,
    getChapterHref,
    getOrderedChapters,
    slugFromFile,
    uniqueOrdered,
} = require('./source.cjs')
const {
    extractFrontmatter,
    markdownToXhtml,
    renderImage,
    renderMarkdownTable,
} = require('./markdown.cjs')
const {
    appendExternalLinkNote,
    relativeHref,
    rewriteHandbookLinks,
    rewriteLinks,
} = require('./links.cjs')
const {
    materializeAssets,
    materializeDiagrams,
    optimizeAsset,
    resolveAsset,
} = require('./assets.cjs')
const {
    buildBookCss,
    buildNav,
    buildOpf,
    escapeHtml,
    pageTemplate,
    validateGeneratedEpubStructure,
    validateXhtml,
    writeCoverAssets,
    writeFile,
} = require('./epub.cjs')

async function buildEpub({ outputDir = DEFAULT_OUTPUT_DIR, limit } = {}) {
    const chapters = getOrderedChapters(limit)
    const slugToHref = new Map(chapters.map((chapter) => [chapter.slug, chapter.href]))
    const epubRoot = path.join(outputDir, 'epub-root')
    const assets = new Map()
    const diagrams = new Map()
    const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    fs.rmSync(outputDir, { recursive: true, force: true })
    fs.mkdirSync(epubRoot, { recursive: true })

    writeFile(path.join(epubRoot, 'mimetype'), 'application/epub+zip')
    writeFile(
        path.join(epubRoot, 'META-INF/container.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`
    )
    writeFile(
        path.join(epubRoot, 'OEBPS/styles/book.css'),
        buildBookCss()
    )
    const coverAsset = await writeCoverAssets(outputDir, epubRoot)
    const extraDocuments = [
        { id: 'cover', href: 'cover.xhtml' },
        { id: 'credits', href: 'credits.xhtml' },
    ]
    writeFile(path.join(epubRoot, 'OEBPS/cover.xhtml'), pageTemplate({ title: 'PostHog Handbook Cover', body: buildCoverPage(COVER_FILE_NAME) }))
    writeFile(path.join(epubRoot, 'OEBPS/credits.xhtml'), pageTemplate({ title: 'About this Ebook', body: buildCreditsPage(generatedAt) }))

    for (const chapter of chapters) {
        const markdown = fs.readFileSync(chapter.sourcePath, 'utf8')
        const { body } = extractFrontmatter(markdown)
        markdownToXhtml(body, { sourcePath: chapter.sourcePath, assets, diagrams })
    }

    const materializedAssets = await materializeAssets(assets, epubRoot)
    const materializedDiagrams = await materializeDiagrams(diagrams, epubRoot)
    const renderedChapters = chapters.map((chapter) => {
        const markdown = fs.readFileSync(chapter.sourcePath, 'utf8')
        const { data, body } = extractFrontmatter(markdown)
        const title = data.title || chapter.slug.replace('/handbook/', '').replaceAll('-', ' ')
        const chapterBody = `<h1>${escapeHtml(title)}</h1>
<p class="source">${escapeHtml(chapter.slug)}</p>
${rewriteLinks(markdownToXhtml(body, { sourcePath: chapter.sourcePath, materializedAssets, diagrams: materializedDiagrams }), slugToHref, { currentHref: chapter.href })}`
        writeFile(path.join(epubRoot, 'OEBPS', chapter.href), pageTemplate({ title, body: chapterBody, stylesheetHref: '../styles/book.css' }))
        return { ...chapter, title }
    })

    writeFile(path.join(epubRoot, 'OEBPS/nav.xhtml'), buildNav(renderedChapters))
    writeFile(
        path.join(epubRoot, 'OEBPS/content.opf'),
        buildOpf(
            renderedChapters,
            generatedAt,
            [coverAsset, ...materializedAssets.values(), ...materializedDiagrams.values()].filter((asset) => asset.mediaType),
            extraDocuments
        )
    )

    const generatedFiles = new Map()
    const collectFiles = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                collectFiles(fullPath)
            } else if (entry.isFile() && /\.(xhtml|opf)$/i.test(entry.name)) {
                generatedFiles.set(path.relative(epubRoot, fullPath).replaceAll(path.sep, '/'), fs.readFileSync(fullPath, 'utf8'))
            }
        }
    }
    collectFiles(path.join(epubRoot, 'OEBPS'))
    const validation = validateGeneratedEpubStructure(generatedFiles)
    if (validation.errors.length) {
        throw new Error(`Generated EPUB validation failed:\n${validation.errors.join('\n')}`)
    }

    const epubPath = path.join(outputDir, EPUB_FILE_NAME)
    childProcess.execFileSync('zip', ['-X0', epubPath, 'mimetype'], { cwd: epubRoot, stdio: 'ignore' })
    childProcess.execFileSync('zip', ['-Xr9D', epubPath, 'META-INF', 'OEBPS'], { cwd: epubRoot, stdio: 'ignore' })

    const manifest = {
        title: 'PostHog Handbook',
        generatedAt,
        chapters: renderedChapters.length,
        output: epubPath,
    }
    writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    writeFile(
        path.join(outputDir, 'index.html'),
        buildLandingPage({
            generatedAt,
            chapters: renderedChapters.length,
            epubFileName: EPUB_FILE_NAME,
            coverFileName: COVER_FILE_NAME,
            pageUrl: PUBLIC_PAGE_URL,
        })
    )
    writeFile(
        path.join(outputDir, '_headers'),
        `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/${EPUB_FILE_NAME}
  Content-Type: application/epub+zip
  Cache-Control: public, max-age=3600

/${COVER_FILE_NAME}
  Cache-Control: public, max-age=86400
`
    )
    return manifest
}

function parseArgs(argv) {
    const args = { outputDir: DEFAULT_OUTPUT_DIR, limit: undefined }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--output-dir') args.outputDir = path.resolve(argv[++index])
        if (arg === '--limit') args.limit = Number(argv[++index])
    }
    return args
}

if (require.main === module) {
    buildEpub(parseArgs(process.argv.slice(2))).then((manifest) => {
    console.log(`Built ${manifest.chapters} chapters`)
    console.log(manifest.output)
    })
}

module.exports = {
    // Re-exports for backwards-compatible test imports:
    buildBookCss,
    buildCoverPage,
    buildCreditsPage,
    buildLandingPage,
    buildOpf,
    buildEpub,
    getChapterHref,
    markdownToXhtml,
    optimizeAsset,
    parseArgs,
    renderMarkdownTable,
    resolveAsset,
    rewriteHandbookLinks,
    rewriteLinks,
    uniqueOrdered,
    validateGeneratedEpubStructure,
    validateXhtml,
}
