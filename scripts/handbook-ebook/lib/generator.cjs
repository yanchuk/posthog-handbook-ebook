#!/usr/bin/env node

const childProcess = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const {
    COVER_FILE_NAME,
    DEFAULT_OUTPUT_DIR,
    EPUB_FILE_NAME,
    HANDBOOK_DIR,
    POSTHOG_SITE_DIR,
    PROJECT_ROOT,
    PUBLIC_PAGE_URL,
    SIDEBAR_FILE,
    SITE_URL,
} = require('./config.cjs')
const { buildCoverPage, buildCreditsPage, buildLandingPage } = require('./pages.cjs')
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'])
const RASTER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])
const MEDIA_TYPES = {
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
}

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

function sanitizeAssetPath(value) {
    return value
        .replace(/^https?:\/\//, '')
        .replace(/[?#].*$/, '')
        .replace(/[^a-zA-Z0-9._/-]+/g, '-')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/')
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

function extractFrontmatter(markdown) {
    if (!markdown.startsWith('---')) return { data: {}, body: markdown }
    const end = markdown.indexOf('\n---', 3)
    if (end === -1) return { data: {}, body: markdown }
    const frontmatter = markdown.slice(3, end).trim()
    const data = {}
    for (const line of frontmatter.split('\n')) {
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
        if (match) data[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
    }
    return { data, body: markdown.slice(end + 4).trim() }
}

function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function decodeInlineEntities(value) {
    return value.replace(/&nbsp;/gi, ' ')
}

function decodeHtmlAttribute(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
}

function slugifyHeading(value) {
    return value
        .toLowerCase()
        .replace(/<[^>]+>/g, '')
        .replace(/&[a-z0-9#]+;/gi, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
}

function inlineMarkdownToHtml(markdown, options = {}) {
    const tokens = []
    const stash = (html) => {
        const token = `\u0000${tokens.length}\u0000`
        tokens.push(html)
        return token
    }

    let source = decodeInlineEntities(markdown)
    source = source.replace(/\\\[/g, '[').replace(/\\\]/g, ']')
    source = source.replace(/<span\s+[^>]*style=(["'])[^"']*color:\s*(#[0-9a-fA-F]{3,8})[^"']*\1[^>]*>■<\/span>/gi, (_, __, color) =>
        stash(`<span class="color-swatch" style="background-color:${escapeHtml(color)};"> </span>`)
    )
    source = source.replace(/<aside class="component-placeholder">[\s\S]*?<\/aside>/gi, (html) => stash(html))
    source = source.replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, (_, inner) => inner.trim())
    source = source.replace(/<p>([\s\S]*?)<\/p>/gi, (_, inner) => inner.trim())
    source = source.replace(/<img\s+([^>]*)\/?>/gi, (_, attrs) => {
        const src = getAttribute(attrs, 'src')
        const alt = getAttribute(attrs, 'alt') || ''
        return src ? stash(renderImage(src, alt, options)) : ''
    })
    source = source.replace(/<a\s+[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, __, href, text) =>
        stash(`<a href="${escapeHtml(href)}">${inlineMarkdownToHtml(text, options)}</a>`)
    )
    source = source.replace(/<code>([\s\S]*?)<\/code>/gi, (_, text) => stash(`<code>${escapeHtml(text)}</code>`))
    source = source.replace(/<(em|strong|b|i)>([\s\S]*?)<\/\1>/gi, (_, tag, text) => {
        const normalized = tag.toLowerCase() === 'b' ? 'strong' : tag.toLowerCase() === 'i' ? 'em' : tag.toLowerCase()
        return stash(`<${normalized}>${inlineMarkdownToHtml(text, options)}</${normalized}>`)
    })
    source = source.replace(/<br\s*\/?>/gi, () => stash('<br />'))
    source = source.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => stash(renderImage(src, alt, options)))
    source = source.replace(/\[([^\]]+)\]\[([^\]]+)\]/g, (_, text, id) => {
        const href = options.referenceLinks?.get(id.toLowerCase())
        return href ? stash(`<a href="${escapeHtml(href)}">${inlineMarkdownToHtml(text, options)}</a>`) : _
    })
    source = source.replace(/\[([^\]]+)\]\(((?:[^)(]|\([^)]*\))+)\)/g, (_, text, href) =>
        stash(`<a href="${escapeHtml(href)}">${inlineMarkdownToHtml(text, options)}</a>`)
    )
    source = source.replace(/`([^`]+)`/g, (_, text) => stash(`<code>${escapeHtml(text)}</code>`))

    let html = escapeHtml(source)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>')
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
    html = html.replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
    html = html.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)])
    return html
}

function splitTableRow(line) {
    const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
    const cells = []
    let current = ''
    let escaped = false
    for (const char of trimmed) {
        if (char === '|' && !escaped) {
            cells.push(current.trim())
            current = ''
        } else {
            current += char
        }
        escaped = char === '\\' && !escaped
    }
    cells.push(current.trim())
    return cells
}

function isTableSeparator(line) {
    return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line)
}

function isTableStart(lines, index) {
    return Boolean(lines[index]?.includes('|') && lines[index + 1] && isTableSeparator(lines[index + 1]))
}

function renderMarkdownTable(lines, options = {}) {
    if (typeof lines === 'string') lines = lines.split('\n')
    const [headerLine, , ...bodyLines] = lines
    const headers = splitTableRow(headerLine)
    const body = bodyLines.filter((line) => line.trim()).map(splitTableRow)
    if (isComplexTable(headers, body)) return renderTableCards(headers, body, options)
    const headerHtml = headers.map((cell) => `<th>${inlineMarkdownToHtml(cell, options)}</th>`).join('')
    const bodyHtml = body
        .map((row) => `<tr>${headers.map((_, index) => `<td>${inlineMarkdownToHtml(row[index] || '', options)}</td>`).join('')}</tr>`)
        .join('')
    return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
}

function isComplexTable(headers, body) {
    const cells = [headers, ...body].flat()
    return headers.length > 4 || cells.some((cell) => /<div\b|<img\b|<span\b[^>]*style=/.test(cell) || cell.length > 160)
}

function renderTableCards(headers, body, options = {}) {
    const cards = body
        .map((row) => {
            const titleIndex = headers.findIndex((header) => /^name$/i.test(header))
            const title = titleIndex >= 0 ? row[titleIndex] : row.find(Boolean) || 'Row'
            const items = headers
                .map((header, index) => {
                    if (index === titleIndex) return ''
                    const value = row[index] || ''
                    if (!value.trim()) return ''
                    return `<dt>${inlineMarkdownToHtml(header, options)}</dt><dd>${inlineMarkdownToHtml(value, options)}</dd>`
                })
                .filter(Boolean)
                .join('')
            return `<section class="table-card"><h3>${inlineMarkdownToHtml(title, options)}</h3><dl>${items}</dl></section>`
        })
        .join('')
    return `<section class="table-cards">${cards}</section>`
}

function renderRawDetailsBlock(lines) {
    const raw = lines.join('\n')
    const summary = raw.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.trim()
    const inner = raw
        .replace(/<details[^>]*>/gi, '')
        .replace(/<\/details>/gi, '')
        .replace(/<summary>[\s\S]*?<\/summary>/gi, '')
        .replace(/<p>([\s\S]*?)<\/p>/gi, (_, text) => `\n${text.trim()}\n`)
        .replace(/<h([1-6])>([\s\S]*?)<\/h\1>/gi, (_, level, text) => `\n${'#'.repeat(Number(level))} ${text.trim()}\n`)
        .replace(/<\/?ul>/gi, '\n')
        .replace(/<li>([\s\S]*?)<\/li>/gi, (_, text) => `\n- ${text.trim()}`)
        .replace(/<br\s*\/?>/gi, '<br />')
        .replace(/\n\s*\n(?=\s*[-*+]\s+)/g, '\n')
        .trim()
    const renderedSummary = summary ? `<h3>${inlineMarkdownToHtml(summary)}</h3>` : ''
    const renderedInner = inner ? markdownToXhtml(inner) : ''
    return [renderedSummary, renderedInner].filter(Boolean).join('\n')
}

function renderRawBlockquoteBlock(lines, options = {}) {
    const raw = lines.join('\n')
    const className = raw.match(/<blockquote[^>]*class=(["'])(.*?)\1/i)?.[2]
    const inner = raw.replace(/<blockquote[^>]*>/i, '').replace(/<\/blockquote>/i, '').trim()
    const rendered = markdownToXhtml(inner, options)
    return `<blockquote${className ? ` class="${escapeHtml(className)}"` : ''}>${rendered}</blockquote>`
}

function renderFieldsetBlock(lines, options = {}) {
    const raw = stripMdxNoise(lines.join('\n'), options)
    const legend = raw.match(/<legend>([\s\S]*?)<\/legend>/i)?.[1]?.trim() || 'Group'
    const inner = raw
        .replace(/<fieldset[^>]*>/gi, '')
        .replace(/<\/fieldset>/gi, '')
        .replace(/<legend>[\s\S]*?<\/legend>/gi, '')
        .trim()
    return `<section class="fieldset-card"><h3>${inlineMarkdownToHtml(legend, options)}</h3>${markdownToXhtml(inner, options)}</section>`
}

function renderImage(src, alt, options = {}) {
    const asset = resolveAsset(src, options.sourcePath, options)
    const materialized = options.materializedAssets?.get(asset.key)
    if (materialized?.kind === 'local' || materialized?.kind === 'remote') {
        return `<img src="${escapeHtml(materialized.epubHref)}" alt="${escapeHtml(alt || '')}" />`
    }
    if (options.assets && (asset.kind === 'local' || asset.kind === 'remote')) {
        options.assets.set(asset.key, asset)
    }
    if (asset.kind === 'missing' || asset.kind === 'unsupported') {
        return `<span class="image-placeholder">${escapeHtml(asset.placeholder || `Image unavailable: ${src}`)}</span>`
    }
    return `<img src="${escapeHtml(asset.epubHref)}" alt="${escapeHtml(alt || '')}" />`
}

function getAttribute(attrs, name) {
    const match = attrs.match(new RegExp(`${name}=(["'])(.*?)\\1`))
    return match?.[2]
}

function getMdxAttribute(attrs, name) {
    const quoted = getAttribute(attrs, name)
    if (quoted !== undefined) return quoted
    const expression = attrs.match(new RegExp(`${name}=\\{([^}]+)\\}`))
    return expression?.[1]?.replace(/^['"]|['"]$/g, '')
}

function renderVideoLinkCard(url, label = 'Open video') {
    return `<figure class="video-embed video-embed--link"><figcaption><strong>Video omitted from this ebook</strong><br /><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></figcaption></figure>`
}

function parseYouTubeUrl(url) {
    let parsed
    try {
        parsed = new URL(url)
    } catch {
        return null
    }

    let videoId = ''
    const hostname = parsed.hostname.replace(/^www\./i, '')
    if (/youtu\.be$/i.test(hostname)) {
        videoId = parsed.pathname.split('/').filter(Boolean)[0] || ''
    } else if (/youtube(?:-nocookie)?\.com$/i.test(hostname) || /youtube\.com$/i.test(hostname)) {
        if (parsed.pathname.startsWith('/embed/')) {
            videoId = parsed.pathname.split('/').filter(Boolean)[1] || ''
        } else if (parsed.pathname === '/watch') {
            videoId = parsed.searchParams.get('v') || ''
        }
    }
    if (!videoId) return null

    const start = parsed.searchParams.get('start') || parsed.searchParams.get('t')
    const normalizedStart = start && /^\d+$/.test(start) ? `${start}s` : start
    const watchUrl = new URL('https://www.youtube.com/watch')
    watchUrl.searchParams.set('v', videoId)
    if (normalizedStart) watchUrl.searchParams.set('t', normalizedStart)

    return {
        videoId,
        watchUrl: watchUrl.toString(),
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    }
}

function renderYouTubeCard(url, title, options = {}) {
    const video = parseYouTubeUrl(url)
    if (!video) return renderVideoLinkCard(url)
    const thumbnail = renderImage(video.thumbnailUrl, `Video thumbnail: ${title || 'YouTube video'}`, options)
    return `<figure class="video-embed">${thumbnail}<figcaption><a href="${escapeHtml(video.watchUrl)}">Watch on YouTube</a></figcaption></figure>`
}

function renderIframeEmbed(attrs, options = {}) {
    const src = getAttribute(attrs, 'src')
    if (!src) return ''
    const title = getAttribute(attrs, 'title') || 'Embedded video'
    if (parseYouTubeUrl(src)) return renderYouTubeCard(src, title, options)
    return renderVideoLinkCard(src, 'Open embedded content')
}

function renderMdxComponentText(name, attrs, children = '', options = {}) {
    const label = children.trim()
    if (name === 'Emoji') return ''
    if (name === 'TeamMember') return getAttribute(attrs, 'name') || label || ''
    if (name === 'SmallTeam') return label || `${(getAttribute(attrs, 'slug') || '').replaceAll('-', ' ')} team`.trim()
    if (name === 'PrivateLink') {
        const url = getAttribute(attrs, 'url')
        return url && label ? `[${label}](${url})` : label
    }
    if (name === 'ProductScreenshot' || name === 'CloudinaryImage') {
        const src = getMdxAttribute(attrs, 'imageLight') || getMdxAttribute(attrs, 'src') || getMdxAttribute(attrs, 'image') || getMdxAttribute(attrs, 'imageDark')
        const alt = getMdxAttribute(attrs, 'alt') || ''
        return src ? `<figure class="product-screenshot">${renderImage(src, alt, options)}</figure>` : ''
    }
    if (name === 'ProductVideo') {
        const src = getMdxAttribute(attrs, 'videoLight') || getMdxAttribute(attrs, 'src') || getMdxAttribute(attrs, 'video') || getMdxAttribute(attrs, 'videoDark')
        return src ? renderVideoLinkCard(src, 'Open video') : ''
    }
    if (name === 'WistiaEmbed') {
        const mediaId = getMdxAttribute(attrs, 'mediaId')
        return mediaId ? renderVideoLinkCard(`https://posthog.wistia.com/medias/${mediaId}`, 'Open video') : ''
    }
    if (name === 'Caption' && label) return `<p class="caption">${inlineMarkdownToHtml(label, options)}</p>`
    if (name === 'ImageSlider' && label) return markdownToXhtml(label, options)
    if (name === 'CalloutBox') {
        const title = getMdxAttribute(attrs, 'title')
        const renderedTitle = title ? `<strong>${escapeHtml(title)}</strong>${label ? '<br />' : ''}` : ''
        return `<blockquote class="callout">${renderedTitle}${label ? markdownToXhtml(label, options) : ''}</blockquote>`
    }
    if (label) return label
    return `<aside class="component-placeholder"><strong>Interactive website component omitted from this ebook</strong><br /><span>Component: ${escapeHtml(name)}</span></aside>`
}

function stripMdxNoise(markdown, options = {}) {
    const codeBlocks = []
    const protectedMarkdown = markdown.replace(/```[\s\S]*?```/g, (block) => {
        const token = `\u0001CODE${codeBlocks.length}\u0001`
        codeBlocks.push(block)
        return token
    })
    return protectedMarkdown
        .replace(/^import\s+.*$/gm, '')
        .replace(/export\s+const\s+[^=]+=[\s\S]*?(?=\n\n|$)/g, '')
        .replace(/<\/?div\b[^>]*>/gi, '')
        .replace(/<([A-Z][A-Za-z0-9.]*)\b([^>]*)>([\s\S]*?)<\/\1>/g, (_, name, attrs, children) =>
            renderMdxComponentText(name, attrs, children, options)
        )
        .replace(/<([A-Z][A-Za-z0-9.]*)\b([^>]*)\/>/g, (_, name, attrs) => renderMdxComponentText(name, attrs, '', options))
        .replace(/^(\s*[-*+]\s*)\/\s*/gm, '$1')
        .replace(/<\/?[A-Z][A-Za-z0-9.]*\b[^>]*>/g, '')
        .replace(/{\/\*[\s\S]*?\*\/}/g, '')
        .replace(/\u0001CODE(\d+)\u0001/g, (_, index) => codeBlocks[Number(index)])
}

function extractReferenceLinks(markdown) {
    const references = new Map()
    const body = markdown
        .split('\n')
        .filter((line) => {
            const match = line.match(/^\s*\[([^\]]+)\]:\s*(\S+)\s*$/)
            if (!match) return true
            references.set(match[1].toLowerCase(), match[2])
            return false
        })
        .join('\n')
    return { body, references }
}

function renderDiagram(source, options = {}) {
    const hash = crypto.createHash('sha1').update(source).digest('hex').slice(0, 12)
    const manifestHref = `assets/diagrams/diagram-${hash}.png`
    const diagram = {
        key: `diagram:${hash}`,
        source,
        manifestHref,
        epubHref: `../${manifestHref}`,
        mediaType: 'image/png',
    }
    options.diagrams?.set(diagram.key, diagram)
    return `<figure class="diagram"><img src="${diagram.epubHref}" alt="Diagram" /><figcaption>Diagram</figcaption></figure>`
}

function markdownToXhtml(markdown, options = {}) {
    const { body: markdownWithoutReferences, references } = extractReferenceLinks(markdown)
    const renderOptions = {
        ...options,
        referenceLinks: new Map([...(options.referenceLinks || new Map()), ...references]),
    }
    const lines = stripMdxNoise(markdownWithoutReferences, renderOptions).split('\n')
    const html = []
    let paragraph = []
    let listItems = []
    let orderedListItems = []
    let inCodeBlock = false
    let codeLanguage = ''
    let codeLines = []

    const flushParagraph = () => {
        if (!paragraph.length) return
        const text = paragraph.join(' ').trim()
        if (/^(OR|AND)$/.test(text)) {
            html.push(`<p class="logic-operator">${text}</p>`)
        } else if (/^<aside class="component-placeholder">/.test(text)) {
            html.push(text)
        } else {
            html.push(`<p>${inlineMarkdownToHtml(text, renderOptions)}</p>`)
        }
        paragraph = []
    }

    const flushList = () => {
        if (!listItems.length) return
        html.push(`<ul>${listItems.map((item) => `<li>${inlineMarkdownToHtml(normalizeTaskItem(item), renderOptions)}</li>`).join('')}</ul>`)
        listItems = []
    }

    const flushOrderedList = () => {
        if (!orderedListItems.length) return
        html.push(`<ol>${orderedListItems.map((item) => `<li>${inlineMarkdownToHtml(item, renderOptions)}</li>`).join('')}</ol>`)
        orderedListItems = []
    }

    const flushCode = () => {
        if (codeLanguage.toLowerCase() === 'mermaid') {
            html.push(renderDiagram(codeLines.join('\n').trim(), renderOptions))
            codeLines = []
            codeLanguage = ''
            return
        }
        html.push(`<pre><code${codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = []
        codeLanguage = ''
    }

    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index]
        const line = rawLine.trimEnd()
        const codeFence = line.match(/^```(.*)$/)
        if (codeFence) {
            if (inCodeBlock) {
                flushCode()
                inCodeBlock = false
            } else {
                flushParagraph()
                flushList()
                flushOrderedList()
                inCodeBlock = true
                codeLanguage = codeFence[1].trim().split(/\s+/)[0] || ''
            }
            continue
        }
        if (inCodeBlock) {
            codeLines.push(rawLine)
            continue
        }
        if (!line.trim()) {
            flushParagraph()
            flushList()
            flushOrderedList()
            continue
        }

        if (/^<iframe\b/i.test(line.trim())) {
            flushParagraph()
            flushList()
            flushOrderedList()
            const iframeLines = [rawLine]
            let nextIndex = index + 1
            while (nextIndex < lines.length) {
                iframeLines.push(lines[nextIndex])
                if (/<\/iframe>/i.test(lines[nextIndex]) || /\/>\s*$/.test(lines[nextIndex])) break
                nextIndex += 1
            }
            const attrs = iframeLines.join(' ').match(/<iframe\b([^>]*)/i)?.[1] || ''
            html.push(renderIframeEmbed(attrs, renderOptions))
            index = nextIndex
            continue
        }

        if (/^<(figure|aside)\b/i.test(line.trim()) || /^<p class="caption">/i.test(line.trim())) {
            flushParagraph()
            flushList()
            flushOrderedList()
            html.push(line.trim())
            continue
        }

        if (/^\s{2,}\S/.test(rawLine) && !/^\s*(?:[-*+]|\d+\.)\s+/.test(rawLine)) {
            if (listItems.length) {
                listItems[listItems.length - 1] = `${listItems[listItems.length - 1]} ${line.trim()}`
                continue
            }
            if (orderedListItems.length) {
                orderedListItems[orderedListItems.length - 1] = `${orderedListItems[orderedListItems.length - 1]} ${line.trim()}`
                continue
            }
        }

        const setext = lines[index + 1]?.match(/^\s*(=+|-+)\s*$/)
        if (setext && line.trim() && !/^\s*[-*+]\s+/.test(line)) {
            flushParagraph()
            flushList()
            flushOrderedList()
            const level = setext[1].startsWith('=') ? 1 : 2
            const content = inlineMarkdownToHtml(line.trim(), renderOptions)
            html.push(`<h${level} id="${slugifyHeading(content)}">${content}</h${level}>`)
            index += 1
            continue
        }

        if (/^<details\b/i.test(line.trim())) {
            flushParagraph()
            flushList()
            flushOrderedList()
            const detailsLines = [rawLine]
            let nextIndex = index + 1
            while (nextIndex < lines.length) {
                detailsLines.push(lines[nextIndex])
                if (/<\/details>/i.test(lines[nextIndex])) break
                nextIndex += 1
            }
            html.push(renderRawDetailsBlock(detailsLines))
            index = nextIndex
            continue
        }

        if (/^<blockquote\b/i.test(line.trim())) {
            flushParagraph()
            flushList()
            flushOrderedList()
            const blockquoteLines = [rawLine]
            let nextIndex = index + 1
            while (nextIndex < lines.length) {
                blockquoteLines.push(lines[nextIndex])
                if (/<\/blockquote>/i.test(lines[nextIndex])) break
                nextIndex += 1
            }
            html.push(renderRawBlockquoteBlock(blockquoteLines, renderOptions))
            index = nextIndex
            continue
        }

        if (/^<fieldset\b/i.test(line.trim())) {
            flushParagraph()
            flushList()
            flushOrderedList()
            const fieldsetLines = [rawLine]
            let nextIndex = index + 1
            while (nextIndex < lines.length) {
                fieldsetLines.push(lines[nextIndex])
                if (/<\/fieldset>/i.test(lines[nextIndex])) break
                nextIndex += 1
            }
            html.push(renderFieldsetBlock(fieldsetLines, renderOptions))
            index = nextIndex
            continue
        }

        if (isTableStart(lines, index)) {
            flushParagraph()
            flushList()
            flushOrderedList()
            const tableLines = [rawLine, lines[index + 1]]
            let nextIndex = index + 2
            while (nextIndex < lines.length && lines[nextIndex].includes('|') && lines[nextIndex].trim()) {
                tableLines.push(lines[nextIndex])
                nextIndex += 1
            }
            html.push(renderMarkdownTable(tableLines, renderOptions))
            index = nextIndex - 1
            continue
        }

        const heading = line.match(/^(#{1,6})\s+(.+)$/)
        if (heading) {
            flushParagraph()
            flushList()
            flushOrderedList()
            const level = heading[1].length
            const content = inlineMarkdownToHtml(heading[2], renderOptions)
            const className = level === 2 && /^\d+\./.test(heading[2].replace(/[*_]/g, '').trim()) ? ' class="numbered-section"' : ''
            html.push(`<h${level}${className} id="${slugifyHeading(content)}">${content}</h${level}>`)
            continue
        }

        const unordered = line.match(/^\s*[-*+]\s+(.+)$/)
        if (unordered) {
            flushParagraph()
            flushOrderedList()
            listItems.push(unordered[1].trim())
            continue
        }

        const ordered = line.match(/^\s*\d+\.\s+(.+)$/)
        if (ordered) {
            flushParagraph()
            flushList()
            orderedListItems.push(ordered[1].trim())
            continue
        }

        const quote = line.match(/^>\s?(.*)$/)
        if (quote) {
            flushParagraph()
            flushList()
            flushOrderedList()
            const quoteLines = []
            let nextIndex = index
            while (nextIndex < lines.length) {
                const quoteMatch = lines[nextIndex].match(/^>\s?(.*)$/)
                if (!quoteMatch) break
                quoteLines.push(quoteMatch[1])
                nextIndex += 1
            }
            html.push(`<blockquote>${markdownToXhtml(quoteLines.join('\n'), renderOptions)}</blockquote>`)
            index = nextIndex - 1
            continue
        }

        paragraph.push(line.trim())
    }

    flushParagraph()
    flushList()
    flushOrderedList()
    return html.join('\n')
}

function normalizeTaskItem(item) {
    return item.replace(/^\\?\[\s*\\?\]\s*/, '[ ] ')
}

function rewriteHandbookLinks(html, slugToHref) {
    return html.replace(/href="(?:https:\/\/posthog\.com)?(?<href>\/handbook[^"#?]*)(?<hash>#[^"]*)?"/g, (_, href, hash = '') => {
        if (slugToHref.has(href)) {
            return `href="${slugToHref.get(href)}${hash}"`
        }
        return `href="${SITE_URL}${href}${hash}"`
    })
}

function appendExternalLinkNote(text) {
    if (text.includes('external-link-note')) return text
    return `${text} <span class="external-link-note">[external link]</span>`
}

function relativeHref(fromHref, toHref) {
    if (!fromHref) return toHref
    const fromDir = path.posix.dirname(fromHref)
    const relative = path.posix.relative(fromDir, toHref)
    return relative || path.posix.basename(toHref)
}

function rewriteLinks(html, slugToHref, options = {}) {
    return html.replace(/<a\s+href="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g, (_, originalHref, attrs, text) => {
        originalHref = decodeHtmlAttribute(originalHref)
        const unsafe = /^(javascript|data|file):/i.test(originalHref)
        if (unsafe) return text

        let href = originalHref
        let isExternal = false
        const posthogMatch = href.match(/^https:\/\/posthog\.com(\/.*)$/)
        if (posthogMatch) href = posthogMatch[1]

        const handbookMatch = href.match(/^(\/handbook[^#?]*)(#[^?]*)?/)
        if (handbookMatch) {
            const slug = handbookMatch[1]
            const hash = handbookMatch[2] || ''
            if (slugToHref.has(slug)) {
                return `<a href="${relativeHref(options.currentHref, slugToHref.get(slug))}${hash}"${attrs}>${text}</a>`
            }
            href = `${SITE_URL}${slug}${hash}`
            isExternal = true
        } else if (href.startsWith('/')) {
            href = `${SITE_URL}${href}`
            isExternal = true
        } else if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
            isExternal = true
        }

        return `<a href="${escapeHtml(href)}"${attrs}>${isExternal ? appendExternalLinkNote(text) : text}</a>`
    })
}

function resolveAsset(src, sourcePath, options = {}) {
    const siteDir = options.siteDir || POSTHOG_SITE_DIR
    const cleanSrc = src.replace(/^['"]|['"]$/g, '')
    const extension = path.extname(new URL(cleanSrc, SITE_URL).pathname).toLowerCase()
    const safeExtension = extension || '.png'

    if (/^https?:\/\//i.test(cleanSrc)) {
        const url = new URL(cleanSrc)
        const localFromCloudinary = cleanSrc.match(/\/posthog\.com\/(.+)$/)
        if (localFromCloudinary) {
            const localPath = path.join(siteDir, localFromCloudinary[1].replace(/[?#].*$/, ''))
            if (fs.existsSync(localPath)) {
                const manifestHref = `assets/${sanitizeAssetPath(localFromCloudinary[1])}`
                return {
                    kind: 'local',
                    key: localPath,
                    sourcePath: localPath,
                    epubHref: `../${manifestHref}`,
                    manifestHref,
                    extension: path.extname(localPath).toLowerCase(),
                }
            }
        }
        const remoteName = `${url.hostname}${url.pathname}`
            .replace(/[?#].*$/, '')
            .replace(/[^a-zA-Z0-9.]+/g, '-')
            .replace(/\.(?=.*\.)/g, '-')
            .replace(/^-|-$/g, '')
        const manifestHref = `assets/remote/${remoteName}`
        return {
            kind: 'remote',
            key: cleanSrc,
            url: cleanSrc,
            epubHref: `../${manifestHref}`,
            manifestHref,
            extension: safeExtension,
        }
    }

    const localPath = cleanSrc.startsWith('/')
        ? path.join(siteDir, 'static', cleanSrc)
        : path.resolve(path.dirname(sourcePath || path.join(siteDir, 'contents/handbook/index.md')), cleanSrc)

    if (!SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(localPath).toLowerCase())) {
        return { kind: 'unsupported', placeholder: `Unsupported image format: ${cleanSrc}` }
    }
    if (!fs.existsSync(localPath)) {
        return { kind: 'missing', placeholder: `Image unavailable: ${cleanSrc}` }
    }

    const relative = path.relative(path.join(siteDir, 'static'), localPath)
    const manifestHref = relative.startsWith('..')
        ? `assets/${sanitizeAssetPath(path.relative(siteDir, localPath))}`
        : `assets/${sanitizeAssetPath(relative)}`
    return {
        kind: 'local',
        key: localPath,
        sourcePath: localPath,
        epubHref: `../${manifestHref}`,
        manifestHref,
        extension: path.extname(localPath).toLowerCase(),
    }
}

async function downloadRemoteAsset(url) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
}

async function optimizeAsset({ buffer, extension, maxWidth = 1400 }) {
    const normalized = extension.toLowerCase()
    if (normalized === '.svg') {
        return { buffer, extension: '.svg', mediaType: MEDIA_TYPES['.svg'] }
    }
    if (normalized === '.gif') {
        return { buffer, extension: '.gif', mediaType: MEDIA_TYPES['.gif'] }
    }
    if (!RASTER_EXTENSIONS.has(normalized)) {
        return { buffer, extension: normalized, mediaType: MEDIA_TYPES[normalized] || 'application/octet-stream' }
    }
    const image = sharp(buffer, { animated: false })
    const metadata = await image.metadata()
    const shouldResize = metadata.width && metadata.width > maxWidth
    const pipeline = shouldResize ? image.resize({ width: maxWidth, withoutEnlargement: true }) : image
    if (metadata.hasAlpha) {
        const output = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
        return { buffer: output, extension: '.png', mediaType: 'image/png' }
    }
    const output = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    return { buffer: output, extension: '.jpg', mediaType: 'image/jpeg' }
}

function assetManifestId(manifestHref) {
    return `asset-${manifestHref.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
}

async function materializeAssets(assets, epubRoot) {
    const materialized = new Map()
    for (const asset of assets.values()) {
        try {
            const input = asset.kind === 'remote' ? await downloadRemoteAsset(asset.url) : fs.readFileSync(asset.sourcePath)
            const optimized = await optimizeAsset({ buffer: input, extension: asset.extension })
            const finalManifestHref = asset.manifestHref.replace(/\.[^.]+$/, optimized.extension)
            const finalPath = path.join(epubRoot, 'OEBPS', finalManifestHref)
            writeFile(finalPath, optimized.buffer)
            materialized.set(asset.key, {
                ...asset,
                epubHref: `../${finalManifestHref}`,
                manifestHref: finalManifestHref,
                mediaType: optimized.mediaType,
            })
        } catch {
            materialized.set(asset.key, { ...asset, kind: 'missing', placeholder: `Image unavailable: ${asset.url || asset.sourcePath}` })
        }
    }
    return materialized
}

function createDiagramFallbackPng(source) {
    const escaped = escapeHtml(source)
        .split('\n')
        .slice(0, 28)
        .map((line, index) => `<text x="24" y="${40 + index * 24}" font-family="monospace" font-size="16" fill="#1d1d1d">${line}</text>`)
        .join('')
    return sharp(Buffer.from(`<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="#f4f1ea"/>
<text x="24" y="24" font-family="sans-serif" font-size="18" font-weight="700" fill="#1d1d1d">Mermaid diagram source</text>
${escaped}
</svg>`))
        .png()
        .toBuffer()
}

async function materializeDiagrams(diagrams, epubRoot) {
    const materialized = new Map()
    for (const diagram of diagrams.values()) {
        const finalPath = path.join(epubRoot, 'OEBPS', diagram.manifestHref)
        fs.mkdirSync(path.dirname(finalPath), { recursive: true })
        const tempDir = fs.mkdtempSync(path.join(fs.realpathSync(require('node:os').tmpdir()), 'ebook-mermaid-'))
        const inputPath = path.join(tempDir, 'diagram.mmd')
        const outputPath = path.join(tempDir, 'diagram.png')
        fs.writeFileSync(inputPath, diagram.source)
        try {
            childProcess.execFileSync(
                'pnpm',
                ['exec', 'mmdc', '-i', inputPath, '-o', outputPath, '-b', 'transparent', '-s', '2'],
                { cwd: PROJECT_ROOT, stdio: 'ignore' }
            )
            fs.copyFileSync(outputPath, finalPath)
        } catch {
            fs.writeFileSync(finalPath, await createDiagramFallbackPng(diagram.source))
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
        materialized.set(diagram.key, diagram)
    }
    return materialized
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
.cover-page { text-align: center; }
.cover-page img { max-height: 95vh; }
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

function buildOpf(chapters, generatedDate, assets = [], extraDocuments = []) {
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
    <dc:identifier id="book-id">posthog-handbook-full-preview</dc:identifier>
    <dc:title>PostHog Handbook</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>PostHog</dc:creator>
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

function getCoverSvg() {
    const logoPath = path.join(POSTHOG_SITE_DIR, 'static/brand/posthog-logo-white@2x.png')
    const logoData = fs.existsSync(logoPath) ? fs.readFileSync(logoPath).toString('base64') : ''
    const logoImage = logoData
        ? `<image href="data:image/png;base64,${logoData}" x="560" y="1890" width="480" height="92" preserveAspectRatio="xMidYMid meet" opacity="0.72" />`
        : `<text x="800" y="1950" text-anchor="middle" font-family="Arial, sans-serif" font-size="82" font-weight="800" fill="#cfd9e8">PostHog</text>`
    return `<svg width="1600" height="2560" xmlns="http://www.w3.org/2000/svg">
<defs>
  <linearGradient id="cover" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#0768d8"/>
    <stop offset="0.52" stop-color="#083b86"/>
    <stop offset="1" stop-color="#021432"/>
  </linearGradient>
  <linearGradient id="spine" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#012a5f"/>
    <stop offset="0.5" stop-color="#0b6ddf"/>
    <stop offset="1" stop-color="#011a3a"/>
  </linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="30" stdDeviation="28" flood-color="#000" flood-opacity="0.35"/>
  </filter>
</defs>
<rect width="1600" height="2560" fill="#eeefe9"/>
<g filter="url(#shadow)">
  <rect x="145" y="130" width="1310" height="2300" rx="22" fill="url(#cover)"/>
  <rect x="145" y="130" width="70" height="2300" rx="22" fill="url(#spine)" opacity="0.9"/>
  <rect x="230" y="220" width="1140" height="2100" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="3"/>
  <text x="800" y="720" text-anchor="middle" font-family="Arial, sans-serif" font-size="124" font-weight="700" fill="#ffffff">PostHog</text>
  <text x="800" y="880" text-anchor="middle" font-family="Arial, sans-serif" font-size="124" font-weight="700" fill="#ffffff">Handbook</text>
  ${logoImage}
  <text x="800" y="2200" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#ffffff" opacity="0.58">Unofficial EPUB conversion</text>
</g>
</svg>`
}

async function writeCoverAssets(outputDir, epubRoot) {
    const coverBuffer = await sharp(Buffer.from(getCoverSvg())).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
    const epubManifestHref = `assets/cover/${COVER_FILE_NAME}`
    writeFile(path.join(epubRoot, 'OEBPS', epubManifestHref), coverBuffer)
    writeFile(path.join(outputDir, COVER_FILE_NAME), coverBuffer)
    return {
        manifestHref: epubManifestHref,
        mediaType: 'image/jpeg',
        properties: 'cover-image',
    }
}

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
    buildBookCss,
    buildCreditsPage,
    buildEpub,
    buildLandingPage,
    buildOpf,
    getChapterHref,
    getOrderedChapters,
    markdownToXhtml,
    optimizeAsset,
    parseArgs,
    renderMarkdownTable,
    resolveAsset,
    rewriteHandbookLinks,
    rewriteLinks,
    uniqueOrdered,
    validateXhtml,
    validateGeneratedEpubStructure,
}
