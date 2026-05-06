const childProcess = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { POSTHOG_SITE_DIR, PROJECT_ROOT, SITE_URL } = require('./config.cjs')
const { escapeHtml, writeFile } = require('./epub.cjs')

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

function sanitizeAssetPath(value) {
    return value
        .replace(/^https?:\/\//, '')
        .replace(/[?#].*$/, '')
        .replace(/[^a-zA-Z0-9._/-]+/g, '-')
        .replace(/^\/+/, '')
        .replace(/\/+/g, '/')
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

async function materializeAssets(assets, epubRoot, errors = []) {
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
        } catch (err) {
            errors.push({ kind: 'asset-failed', detail: asset.url || asset.sourcePath, message: err.message })
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

async function materializeDiagrams(diagrams, epubRoot, warnings = []) {
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
        } catch (err) {
            warnings.push({ kind: 'diagram-fallback', detail: diagram.key, message: err.message })
            fs.writeFileSync(finalPath, await createDiagramFallbackPng(diagram.source))
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
        materialized.set(diagram.key, diagram)
    }
    return materialized
}

module.exports = {
    MEDIA_TYPES,
    RASTER_EXTENSIONS,
    SUPPORTED_IMAGE_EXTENSIONS,
    createDiagramFallbackPng,
    downloadRemoteAsset,
    materializeAssets,
    materializeDiagrams,
    optimizeAsset,
    resolveAsset,
    sanitizeAssetPath,
}
