const fs = require('node:fs')
const path = require('node:path')
const { HANDBOOK_DIR, SIDEBAR_FILE } = require('./config.cjs')

function uniqueOrdered(items) {
    return [...new Set(items)]
}

function slugFromFile(filePath) {
    const relative = path.relative(HANDBOOK_DIR, filePath).replaceAll(path.sep, '/')
    const withoutExtension = relative.replace(/\.(mdx|md)$/, '')
    if (withoutExtension.endsWith('/index')) {
        return `/handbook/${withoutExtension.slice(0, -'/index'.length)}`
    }
    return `/handbook/${withoutExtension}`
}

function fileFromSlug(slug) {
    const relative = slug.replace(/^\/handbook\/?/, '')
    const candidates = [
        path.join(HANDBOOK_DIR, `${relative}.md`),
        path.join(HANDBOOK_DIR, `${relative}.mdx`),
        path.join(HANDBOOK_DIR, relative, 'index.md'),
        path.join(HANDBOOK_DIR, relative, 'index.mdx'),
    ]
    return candidates.find((candidate) => fs.existsSync(candidate))
}

function getChapterHref(slug) {
    const normalized = slug.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    return `chapters/${normalized || 'handbook'}.xhtml`
}

function discoverHandbookFiles() {
    const files = []
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                if (entry.name === '_snippets' || entry.name === '_includes') continue
                walk(fullPath)
            } else if (entry.isFile() && /\.(mdx|md)$/.test(entry.name)) {
                files.push(fullPath)
            }
        }
    }
    walk(HANDBOOK_DIR)
    return files.sort()
}

function readSidebarSlugs() {
    const source = fs.readFileSync(SIDEBAR_FILE, 'utf8')
    return uniqueOrdered([...source.matchAll(/url:\s*'(?<url>\/handbook[^']*)'/g)].map((match) => match.groups.url))
}

function getOrderedChapters(limit) {
    const sourceFiles = discoverHandbookFiles()
    const allSlugToFile = new Map(sourceFiles.map((file) => [slugFromFile(file), file]))
    const sidebarSlugs = readSidebarSlugs().filter((slug) => allSlugToFile.has(slug))
    const extraSlugs = [...allSlugToFile.keys()].filter((slug) => !sidebarSlugs.includes(slug)).sort()
    const slugs = uniqueOrdered([...sidebarSlugs, ...extraSlugs])
    const limitedSlugs = Number.isFinite(limit) && limit > 0 ? slugs.slice(0, limit) : slugs

    return limitedSlugs.map((slug, index) => ({
        id: `chapter-${index + 1}`,
        slug,
        sourcePath: allSlugToFile.get(slug),
        href: getChapterHref(slug),
    }))
}

module.exports = {
    discoverHandbookFiles,
    fileFromSlug,
    getChapterHref,
    getOrderedChapters,
    readSidebarSlugs,
    slugFromFile,
    uniqueOrdered,
}
