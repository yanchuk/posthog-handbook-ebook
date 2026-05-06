const path = require('node:path')
const { SITE_URL } = require('./config.cjs')
const { escapeHtml } = require('./epub.cjs')
const { decodeHtmlAttribute } = require('./markdown.cjs')

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

module.exports = {
    appendExternalLinkNote,
    relativeHref,
    rewriteHandbookLinks,
    rewriteLinks,
}
