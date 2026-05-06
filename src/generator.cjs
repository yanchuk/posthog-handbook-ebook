#!/usr/bin/env node

const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const {
    DEFAULT_OUTPUT_DIR,
    PUBLIC_PAGE_URL,
} = require('./config.cjs')
const { buildCoverPage, buildCreditsPage, buildLandingPage, buildRobotsTxt, buildSitemapXml } = require('./pages.cjs')
const {
    getChapterHref,
    getOrderedChapters,
    uniqueOrdered,
} = require('./source.cjs')
const {
    extractFrontmatter,
    markdownToXhtml,
    renderMarkdownTable,
} = require('./markdown.cjs')
const {
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
    buildHeadersFile,
    buildNav,
    buildOpf,
    escapeHtml,
    getLogomarkSvgInner,
    pageTemplate,
    validateGeneratedEpubStructure,
    validateXhtml,
    writeCoverAssets,
    writeFavicons,
    writeFile,
    writeOgImage,
} = require('./epub.cjs')
const {
    filterChaptersForEdition,
    getEditionConfig,
    listEditionIds,
} = require('./editions.cjs')

async function buildEpub({ outputDir = DEFAULT_OUTPUT_DIR, limit, edition } = {}) {
    if (!edition) throw new Error('buildEpub requires an edition (use buildAllEditions to build every edition)')

    const allChapters = getOrderedChapters(limit)
    const chapters = filterChaptersForEdition(allChapters, edition)
    const slugToHref = new Map(chapters.map((chapter) => [chapter.slug, chapter.href]))
    const epubRoot = path.join(outputDir, `epub-root-${edition.id}`)
    const assets = new Map()
    const diagrams = new Map()
    const errors = []
    const warnings = []
    const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    fs.rmSync(epubRoot, { recursive: true, force: true })
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
    writeFile(path.join(epubRoot, 'OEBPS/styles/book.css'), buildBookCss())
    const coverAsset = await writeCoverAssets(outputDir, epubRoot, { ...edition, chapters: chapters.length })
    const extraDocuments = [
        { id: 'cover', href: 'cover.xhtml' },
        { id: 'credits', href: 'credits.xhtml' },
    ]
    const logomarkInner = getLogomarkSvgInner()
    const generatedYear = new Date(generatedAt).getUTCFullYear()
    writeFile(
        path.join(epubRoot, 'OEBPS/cover.xhtml'),
        pageTemplate({
            title: `PostHog Handbook Cover — ${edition.label}`,
            body: buildCoverPage({ ...edition, chapters: chapters.length }, logomarkInner, { year: generatedYear }),
        })
    )
    writeFile(
        path.join(epubRoot, 'OEBPS/credits.xhtml'),
        pageTemplate({
            title: 'About this Ebook',
            body: buildCreditsPage({ ...edition, chapters: chapters.length }, generatedAt, logomarkInner),
        })
    )

    for (const chapter of chapters) {
        const markdown = fs.readFileSync(chapter.sourcePath, 'utf8')
        const { body } = extractFrontmatter(markdown)
        markdownToXhtml(body, { sourcePath: chapter.sourcePath, assets, diagrams })
    }

    const materializedAssets = await materializeAssets(assets, epubRoot, errors)
    const materializedDiagrams = await materializeDiagrams(diagrams, epubRoot, warnings)
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
            extraDocuments,
            {
                title: edition.opfTitle,
                bookId: `posthog-handbook-${edition.id}`,
                description: `Unofficial offline EPUB conversion of the public PostHog handbook (${edition.label}).`,
                subjects: ['Business handbook', 'Company culture', 'PostHog', 'Startup'],
                publisher: 'ianchuk.com',
                rights: 'Content © PostHog Inc., conversion © Oleksii Ianchuk (MIT).',
            }
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
        throw new Error(`Generated EPUB validation failed for ${edition.id}:\n${validation.errors.join('\n')}`)
    }

    const epubPath = path.join(outputDir, edition.epubFileName)
    fs.rmSync(epubPath, { force: true })
    childProcess.execFileSync('zip', ['-X0', epubPath, 'mimetype'], { cwd: epubRoot, stdio: 'ignore' })
    childProcess.execFileSync('zip', ['-Xr9D', epubPath, 'META-INF', 'OEBPS'], { cwd: epubRoot, stdio: 'ignore' })

    return {
        edition: edition.id,
        label: edition.label,
        opfTitle: edition.opfTitle,
        epubFileName: edition.epubFileName,
        coverFileName: edition.coverFileName,
        generatedAt,
        chapters: renderedChapters.length,
        output: epubPath,
        errors,
        warnings,
    }
}

async function buildAllEditions({ outputDir = DEFAULT_OUTPUT_DIR, limit, only } = {}) {
    fs.rmSync(outputDir, { recursive: true, force: true })
    fs.mkdirSync(outputDir, { recursive: true })

    const ids = only ? [only] : listEditionIds()
    const results = []
    for (const id of ids) {
        const edition = getEditionConfig(id)
        const result = await buildEpub({ outputDir, limit, edition })
        try {
            result.sizeBytes = fs.statSync(result.output).size
        } catch {
            result.sizeBytes = undefined
        }
        results.push(result)
    }

    const generatedAt = results[0]?.generatedAt || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    const landingCover = results[0]?.coverFileName || 'posthog-handbook-full-cover.jpg'

    writeFile(
        path.join(outputDir, 'index.html'),
        buildLandingPage({
            generatedAt,
            editions: results,
            coverFileName: landingCover,
            pageUrl: PUBLIC_PAGE_URL,
        })
    )

    writeFile(path.join(outputDir, '_headers'), buildHeadersFile(results))
    writeFile(path.join(outputDir, 'robots.txt'), buildRobotsTxt(PUBLIC_PAGE_URL))
    writeFile(path.join(outputDir, 'sitemap.xml'), buildSitemapXml(PUBLIC_PAGE_URL, generatedAt))
    await writeOgImage(outputDir)
    await writeFavicons(outputDir)

    const aggregateErrors = results.flatMap((r) => (r.errors || []).map((e) => ({ edition: r.edition, ...e })))
    const aggregateWarnings = results.flatMap((r) => (r.warnings || []).map((w) => ({ edition: r.edition, ...w })))

    const manifest = {
        title: 'PostHog Handbook',
        generatedAt,
        editions: results.map((r) => ({
            id: r.edition,
            label: r.label,
            chapters: r.chapters,
            epubFileName: r.epubFileName,
            coverFileName: r.coverFileName,
            errorCount: (r.errors || []).length,
            warningCount: (r.warnings || []).length,
        })),
        errors: aggregateErrors,
        warnings: aggregateWarnings,
    }
    writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

    return manifest
}

function parseArgs(argv) {
    const args = { outputDir: DEFAULT_OUTPUT_DIR, limit: undefined, only: undefined }
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--output-dir') args.outputDir = path.resolve(argv[++index])
        if (arg === '--limit') args.limit = Number(argv[++index])
        if (arg === '--edition') args.only = argv[++index]
    }
    return args
}

if (require.main === module) {
    buildAllEditions(parseArgs(process.argv.slice(2))).then((manifest) => {
        console.log(`Built ${manifest.editions.length} edition(s):`)
        for (const edition of manifest.editions) {
            console.log(`  - ${edition.label} (${edition.chapters} chapters): ${edition.epubFileName}`)
        }
    })
}

module.exports = {
    // Re-exports for backwards-compatible test imports:
    buildBookCss,
    buildCoverPage,
    buildCreditsPage,
    buildEpub,
    buildAllEditions,
    buildLandingPage,
    buildOpf,
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
