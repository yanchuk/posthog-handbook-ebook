const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const sharp = require('sharp')

const {
    buildBookCss,
    buildCreditsPage,
    buildLandingPage,
    buildOpf,
    getChapterHref,
    markdownToXhtml,
    optimizeAsset,
    renderMarkdownTable,
    resolveAsset,
    rewriteHandbookLinks,
    rewriteLinks,
    uniqueOrdered,
    validateXhtml,
    validateGeneratedEpubStructure,
} = require('./build.cjs')

test('builds an EPUB credits page with attribution and source links', () => {
    const html = buildCreditsPage('2026-05-05T20:45:00Z')

    assert.match(html, /Thanks to the PostHog team for the handbook\. All rights belong to them\./)
    assert.match(html, /href="https:\/\/posthog\.com\/handbook"/)
    assert.match(html, /Converted to Ebook by Oleksii Ianchuk/)
    assert.match(html, /href="https:\/\/ianchuk\.com"/)
    assert.match(html, /href="https:\/\/github\.com\/yanchuk\/posthog-handbook-ebook"/)
    assert.match(html, /2026-05-05T20:45:00Z/)
    assert.deepEqual(validateXhtml(`<?xml version="1.0"?><html><body>${html}</body></html>`).errors, [])
})

test('adds cover and credits documents to the OPF before handbook chapters', () => {
    const opf = buildOpf(
        [{ id: 'chapter-1', href: 'chapters/example.xhtml' }],
        '2026-05-05T20:45:00Z',
        [{ manifestHref: 'assets/cover/posthog-handbook-cover.jpg', mediaType: 'image/jpeg', properties: 'cover-image' }],
        [
            { id: 'cover', href: 'cover.xhtml' },
            { id: 'credits', href: 'credits.xhtml' },
        ]
    )

    assert.match(opf, /<item id="cover" href="cover\.xhtml" media-type="application\/xhtml\+xml" \/>/)
    assert.match(opf, /<item id="credits" href="credits\.xhtml" media-type="application\/xhtml\+xml" \/>/)
    assert.match(opf, /href="assets\/cover\/posthog-handbook-cover\.jpg" media-type="image\/jpeg" properties="cover-image"/)
    assert.match(opf, /<itemref idref="cover" \/>\s*<itemref idref="credits" \/>\s*<itemref idref="chapter-1" \/>/)
})

test('builds a static landing page with download, credits, and share links', () => {
    const html = buildLandingPage({
        generatedAt: '2026-05-05T20:45:00Z',
        chapters: 313,
        epubFileName: 'posthog-handbook-full-preview.epub',
        coverFileName: 'posthog-handbook-cover.jpg',
        pageUrl: 'https://posthog-handbook-ebook.ianchuk.com',
    })

    assert.match(html, /PostHog Handbook Ebook/)
    assert.match(html, /href="\.\/posthog-handbook-full-preview\.epub"/)
    assert.match(html, /Download EPUB/)
    assert.match(html, /Thanks to the PostHog team for the handbook\. All rights belong to them\./)
    assert.match(html, /https:\/\/posthog\.com\/handbook/)
    assert.match(html, /https:\/\/github\.com\/yanchuk\/posthog-handbook-ebook/)
    assert.match(html, /https:\/\/ianchuk\.com/)
    assert.match(html, /twitter\.com\/intent\/tweet/)
    assert.match(html, /linkedin\.com\/sharing\/share-offsite/)
    assert.match(html, /2026-05-05T20:45:00Z/)
    assert.doesNotMatch(html, /\{time|TODO|undefined/)
})

test('rewrites included handbook links to EPUB chapter files', () => {
    const slugToHref = new Map([
        ['/handbook/values', 'chapters/handbook-values.xhtml'],
        ['/handbook/company/culture', 'chapters/handbook-company-culture.xhtml'],
    ])

    const html = rewriteHandbookLinks(
        '<a href="/handbook/values#make-it-public">Values</a> and <a href="/handbook/company/missing">Missing</a>',
        slugToHref
    )

    assert.equal(
        html,
        '<a href="chapters/handbook-values.xhtml#make-it-public">Values</a> and <a href="https://posthog.com/handbook/company/missing">Missing</a>'
    )
})

test('rewrites the real persona handbook cross-link to an EPUB chapter anchor', () => {
    const slugToHref = new Map([['/handbook/who-we-build-for', 'chapters/handbook-who-we-build-for.xhtml']])

    const html = rewriteLinks(
        markdownToXhtml(
            "- Think error tracking or feature flags. The [persona doesn't change](/handbook/who-we-build-for#our-current-persona) as the company gets bigger."
        ),
        slugToHref
    )

    assert.match(html, /href="chapters\/handbook-who-we-build-for\.xhtml#our-current-persona"/)
    assert.doesNotMatch(html, /href="\/handbook\/who-we-build-for/)
})

test('rewrites handbook links relative to the current chapter file', () => {
    const slugToHref = new Map([['/handbook/who-we-build-for', 'chapters/handbook-who-we-build-for.xhtml']])

    const html = rewriteLinks(
        markdownToXhtml(
            "- Think error tracking or feature flags. The [persona doesn't change](/handbook/who-we-build-for#our-current-persona) as the company gets bigger."
        ),
        slugToHref,
        { currentHref: 'chapters/handbook-which-products.xhtml' }
    )

    assert.match(html, /href="handbook-who-we-build-for\.xhtml#our-current-persona"/)
    assert.doesNotMatch(html, /href="chapters\//)
})

test('rewrites absolute posthog handbook links to EPUB chapter files', () => {
    const slugToHref = new Map([['/handbook/values', 'chapters/handbook-values.xhtml']])

    const html = rewriteLinks('<a href="https://posthog.com/handbook/values#do-more-weird">weird</a>', slugToHref)

    assert.equal(html, '<a href="chapters/handbook-values.xhtml#do-more-weird">weird</a>')
})

test('annotates external links while preserving the href', () => {
    const html = rewriteLinks('<a href="https://example.com/path">Example</a>', new Map())

    assert.equal(html, '<a href="https://example.com/path">Example <span class="external-link-note">[external link]</span></a>')
})

test('normalizes root-relative non-handbook links as annotated external links', () => {
    const html = rewriteLinks('<a href="/docs/feature-flags/start-here">docs</a>', new Map())

    assert.equal(
        html,
        '<a href="https://posthog.com/docs/feature-flags/start-here">docs <span class="external-link-note">[external link]</span></a>'
    )
})

test('renders markdown table links as table-cell links with external annotations', () => {
    const html = rewriteLinks(
        markdownToXhtml('| Name | URL |\n| --- | --- |\n| Docs | [Feature flags](/docs/feature-flags/start-here) |'),
        new Map()
    )

    assert.match(html, /<table>/)
    assert.match(
        html,
        /<td><a href="https:\/\/posthog\.com\/docs\/feature-flags\/start-here">Feature flags <span class="external-link-note">\[external link\]<\/span><\/a><\/td>/
    )
})

test('renders safe inline HTML in table cells without escaping tags or entities', () => {
    const html = markdownToXhtml('| &nbsp; | High-growth startup |\n| --- | --- |\n| Criteria | - 15-500 employees<br />- $100k+/month |')

    assert.match(html, /<th>\s*<\/th>/)
    assert.match(html, /15-500 employees<br \/>- \$100k\+\/month/)
    assert.doesNotMatch(html, /&amp;nbsp;|&lt;br/)
})

test('does not parse underscores inside raw HTML link URLs as emphasis', () => {
    const html = markdownToXhtml(
        "We're <a href=\"https://en.wikipedia.org/wiki/Ted_Lasso\">Ted Lasso</a>, not <a href=\"https://en.wikipedia.org/wiki/The_Wolf_of_Wall_Street_(2013_film)\">Wolf of Wall Street</a>. We expect you to take high ownership of the _company_ and _your team_ being successful."
    )

    assert.match(html, /href="https:\/\/en\.wikipedia\.org\/wiki\/Ted_Lasso"/)
    assert.match(html, /href="https:\/\/en\.wikipedia\.org\/wiki\/The_Wolf_of_Wall_Street_\(2013_film\)"/)
    assert.match(html, /<em>company<\/em> and <em>your team<\/em>/)
    assert.doesNotMatch(html, /Ted&lt;em|Wall&lt;em|<\/em>company/)
})

test('keeps markdown link URLs with balanced parentheses intact', () => {
    const html = rewriteLinks(markdownToXhtml('[Wolf of Wall Street](https://en.wikipedia.org/wiki/The_Wolf_of_Wall_Street_(2013_film)).'), new Map())

    assert.match(html, /href="https:\/\/en\.wikipedia\.org\/wiki\/The_Wolf_of_Wall_Street_\(2013_film\)"/)
    assert.doesNotMatch(html, /2013_film"/)
})

test('preserves safe raw emphasis tags without rendering them as text', () => {
    const html = markdownToXhtml('biggest <em>ever</em> day')

    assert.match(html, /biggest <em>ever<\/em> day/)
    assert.doesNotMatch(html, /&lt;em&gt;/)
})

test('strips safe raw paragraph wrappers without rendering tags as text', () => {
    const html = markdownToXhtml('<p><strong>Status:</strong> Resolved</p>')

    assert.equal(html, '<p><strong>Status:</strong> Resolved</p>')
    assert.doesNotMatch(html, /&lt;p&gt;/)
})

test('renders MDX component placeholders as readable text instead of escaped HTML', () => {
    const html = markdownToXhtml('- <TeamMember name="Max" /> shipped it')

    assert.match(html, /<li>Max shipped it<\/li>/)
    assert.doesNotMatch(html, /&lt;aside|component-placeholder|&lt;TeamMember/)
})

test('omits decorative emoji components instead of rendering placeholder text', () => {
    const html = markdownToXhtml('- <Emoji name="sparksjoy" src="/images/emojis/sparksjoy.png" /> A reference')

    assert.match(html, /<li>A reference<\/li>/)
    assert.doesNotMatch(html, /Embedded component omitted|Emoji/)
})

test('cleans separators left by omitted paired emoji components', () => {
    const html = markdownToXhtml('- <Emoji name="one" src="/one.png" /> / <Emoji name="two" src="/two.png" /> A reference')

    assert.match(html, /<li>A reference<\/li>/)
    assert.doesNotMatch(html, /<li>\s*\//)
})

test('keeps raw HTML anchors clickable so link rewriting can annotate them', () => {
    const html = rewriteLinks(markdownToXhtml('A reference to <a href="https://konmari.com/rules">Marie Kondo</a>.'), new Map())

    assert.match(html, /<a href="https:\/\/konmari\.com\/rules">Marie Kondo <span class="external-link-note">\[external link\]<\/span><\/a>/)
    assert.doesNotMatch(html, /&lt;a href/)
})

test('renders compact markdown tables with one-dash separators', () => {
    const html = markdownToXhtml('| Time | Leave |\n| - | - |\n| under 6 months | 3 weeks |')

    assert.match(html, /<table>/)
    assert.match(html, /<td>under 6 months<\/td>/)
})

test('renders ordered markdown lists as EPUB ordered lists', () => {
    const html = markdownToXhtml('1. The Panama Papers\n2. Exhalation by Ted Chiang\n3. The Spy and the Traitor')

    assert.equal(
        html,
        '<ol><li>The Panama Papers</li><li>Exhalation by Ted Chiang</li><li>The Spy and the Traitor</li></ol>'
    )
})

test('renders raw details advisory HTML as readable XHTML blocks', () => {
    const html = markdownToXhtml(`<details>
  <summary>August 15, 2025 / PSA-2025-00001</summary>

  <h4>Affected users</h4>
  <ul>
    <li>Our logs confirm usage was zero.</li>
    <li>We have added a <code>team_id</code> field.</li>
  </ul>
</details>`)

    assert.match(html, /<h3>August 15, 2025 \/ PSA-2025-00001<\/h3>/)
    assert.match(html, /<h4 id="affected-users">Affected users<\/h4>/)
    assert.match(html, /<ul>\s*<li>Our logs confirm usage was zero\.<\/li>\s*<li>We have added a <code>team_id<\/code> field\.<\/li>\s*<\/ul>/)
    assert.doesNotMatch(html, /&lt;details|&lt;ul|&lt;li|<\/li> <li>/)
})

test('escapes plain text inside details blocks so XHTML stays valid', () => {
    const html = markdownToXhtml(`<details>
<summary>Press contact</summary>
See: Press & PR
</details>`)

    assert.match(html, /Press &amp; PR/)
    assert.deepEqual(validateXhtml(`<?xml version="1.0"?><html><body>${html}</body></html>`).errors, [])
})

test('renders paragraph tags inside details as paragraphs, not escaped text', () => {
    const html = markdownToXhtml(`<details>
<summary>Advisory</summary>
<p><strong>Status:</strong> Resolved</p>
</details>`)

    assert.match(html, /<p><strong>Status:<\/strong> Resolved<\/p>/)
    assert.doesNotMatch(html, /&lt;p&gt;/)
})

test('keeps indented continuation text inside the preceding list item', () => {
    const html = markdownToXhtml('- **Identify the impact.**\n    This helps scope the customer impact.\n- **Do not rush.**')

    assert.equal(
        html,
        '<ul><li><strong>Identify the impact.</strong> This helps scope the customer impact.</li><li><strong>Do not rush.</strong></li></ul>'
    )
})

test('does not double-escape query strings when rewriting external links', () => {
    const html = rewriteLinks(markdownToXhtml('[Figma](https://figma.com/file/example?node-id=1-2&t=abc)'), new Map())

    assert.match(html, /href="https:\/\/figma\.com\/file\/example\?node-id=1-2&amp;t=abc"/)
    assert.doesNotMatch(html, /&amp;amp;/)
})

test('renders setext headings as headings without decorative dash text', () => {
    const html = markdownToXhtml('Appointing a Comms Lead\n-----------------------\n\nBody text.')

    assert.match(html, /<h2 id="appointing-a-comms-lead">Appointing a Comms Lead<\/h2>/)
    assert.doesNotMatch(html, /----------------/)
})

test('renders escaped task list markers as literal checklist text', () => {
    const html = markdownToXhtml('* \\[ \\] Use a demo project\n- [ ] Disable notifications')

    assert.equal(html, '<ul><li>[ ] Use a demo project</li><li>[ ] Disable notifications</li></ul>')
    assert.doesNotMatch(html, /\\\[/)
})

test('resolves reference-style links and hides link definitions', () => {
    const html = rewriteLinks(
        markdownToXhtml('Feedback lives in [Google doc][feedback-doc].\n\n[feedback-doc]: https://docs.google.com/document/example'),
        new Map()
    )

    assert.match(html, /<a href="https:\/\/docs\.google\.com\/document\/example">Google doc <span class="external-link-note">\[external link\]<\/span><\/a>/)
    assert.doesNotMatch(html, /\[feedback-doc\]:/)
})

test('renders raw warning blockquotes as semantic blockquotes', () => {
    const html = markdownToXhtml(`<blockquote class='warning-note'>
To ensure visibility, use <i>storage</i>.
</blockquote>`)

    assert.match(html, /<blockquote class="warning-note"><p>To ensure visibility, use <em>storage<\/em>\.<\/p><\/blockquote>/)
    assert.doesNotMatch(html, /&lt;blockquote|&lt;i&gt;/)
})

test('renders raw fieldsets as readable sections with legends', () => {
    const html = markdownToXhtml(`<fieldset>
<legend><TeamMember name="Anna Szell" photo /></legend>

- <SmallTeam slug="data-modeling" />
- <SmallTeam slug="data-tools" />
</fieldset>`)

    assert.match(html, /<section class="fieldset-card"><h3>Anna Szell<\/h3><ul><li>data modeling team<\/li><li>data tools team<\/li><\/ul><\/section>/)
    assert.doesNotMatch(html, /&lt;fieldset|&lt;legend/)
})

test('renders multiline blockquotes as one quote block with nested markdown', () => {
    const html = markdownToXhtml('> I met customers.\n> - First finding\n> - Second finding\n>\n> Follow up.')

    assert.match(html, /<blockquote><p>I met customers\.<\/p>\s*<ul><li>First finding<\/li><li>Second finding<\/li><\/ul>\s*<p>Follow up\.<\/p><\/blockquote>/)
    assert.doesNotMatch(html, /&gt;|^>/)
})

test('renders omitted MDX components as visible ebook callouts', () => {
    const html = markdownToXhtml('<AskMax />')

    assert.match(html, /<aside class="component-placeholder"><strong>Interactive website component omitted from this ebook<\/strong><br \/><span>Component: AskMax<\/span><\/aside>/)
})

test('does not escape omitted MDX component callouts inside list items', () => {
    const html = markdownToXhtml('- Uses <CategoryData /> values')

    assert.match(html, /<li>Uses <aside class="component-placeholder"><strong>Interactive website component omitted from this ebook<\/strong><br \/><span>Component: CategoryData<\/span><\/aside> values<\/li>/)
    assert.doesNotMatch(html, /&lt;aside/)
})

test('renders ProductScreenshot components as embedded images', () => {
    const assets = new Map()
    const html = markdownToXhtml('<ProductScreenshot imageLight="https://res.cloudinary.com/dmukukwp6/image/upload/example.png" alt="Example screenshot" />', { assets })

    assert.match(html, /<figure class="product-screenshot"><img src="..\/assets\/remote\/res-cloudinary-com-dmukukwp6-image-upload-example\.png" alt="Example screenshot" \/><\/figure>/)
    assert.equal(assets.get('https://res.cloudinary.com/dmukukwp6/image/upload/example.png').kind, 'remote')
    assert.doesNotMatch(html, /Interactive website component omitted|ProductScreenshot/)
})

test('renders CloudinaryImage components as embedded images', () => {
    const assets = new Map()
    const html = markdownToXhtml('<CloudinaryImage src="https://res.cloudinary.com/dmukukwp6/image/upload/goodbeta.png" alt="Good beta" />', { assets })

    assert.match(html, /<figure class="product-screenshot"><img src="..\/assets\/remote\/res-cloudinary-com-dmukukwp6-image-upload-goodbeta\.png" alt="Good beta" \/><\/figure>/)
    assert.equal(assets.get('https://res.cloudinary.com/dmukukwp6/image/upload/goodbeta.png').kind, 'remote')
})

test('renders YouTube iframes as thumbnail link cards', () => {
    const assets = new Map()
    const html = rewriteLinks(
        markdownToXhtml('<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/2jQco8hEvTI?start=375" title="Demo video" allowfullscreen></iframe>', { assets }),
        new Map()
    )

    assert.match(html, /<figure class="video-embed">/)
    assert.match(html, /<img src="..\/assets\/remote\/img-youtube-com-vi-2jQco8hEvTI-hqdefault\.jpg" alt="Video thumbnail: Demo video" \/>/)
    assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=2jQco8hEvTI&amp;t=375s">Watch on YouTube <span class="external-link-note">\[external link\]<\/span><\/a>/)
    assert.doesNotMatch(html, /<a href="https:\/\/www\.youtube\.com\/watch[^"]*"><img/)
    assert.equal(assets.get('https://img.youtube.com/vi/2jQco8hEvTI/hqdefault.jpg').kind, 'remote')
    assert.doesNotMatch(html, /&lt;iframe|youtube-nocookie/)
})

test('renders ProductVideo components as external video cards', () => {
    const html = rewriteLinks(
        markdownToXhtml('<ProductVideo videoLight="https://res.cloudinary.com/dmukukwp6/video/upload/changelog.mp4" alt="Changelog form" />'),
        new Map()
    )

    assert.match(html, /<figure class="video-embed video-embed--link">/)
    assert.match(html, /<figcaption><strong>Video omitted from this ebook<\/strong><br \/><a href="https:\/\/res\.cloudinary\.com\/dmukukwp6\/video\/upload\/changelog\.mp4">Open video <span class="external-link-note">\[external link\]<\/span><\/a><\/figcaption>/)
    assert.doesNotMatch(html, /ProductVideo|Interactive website component omitted/)
})

test('renders Wistia embeds as external video cards', () => {
    const html = rewriteLinks(markdownToXhtml('<WistiaEmbed mediaId="13hp4af5cc" />'), new Map())

    assert.match(html, /href="https:\/\/posthog\.wistia\.com\/medias\/13hp4af5cc">Open video <span class="external-link-note">\[external link\]<\/span><\/a>/)
    assert.doesNotMatch(html, /WistiaEmbed|Interactive website component omitted/)
})

test('renders standalone logic operators with a compact class', () => {
    const html = markdownToXhtml('OR\n\nAND')

    assert.equal(html, '<p class="logic-operator">OR</p>\n<p class="logic-operator">AND</p>')
})

test('renders wide markdown tables as table cards', () => {
    const html = markdownToXhtml('| Preview | Name | Vector | PNG | Padded |\n| --- | --- | --- | --- | --- |\n| <div><img src="/brand/posthog-logo.png" /></div> | Standard logo | [SVG](/brand/posthog-logo.svg) | [PNG](/brand/posthog-logo.png) | [PNG @2x](/brand/posthog-logo@2x.png) |')

    assert.match(html, /<section class="table-cards">/)
    assert.match(html, /<img src="..\/assets\/brand\/posthog-logo\.png" alt="" \/>/)
    assert.doesNotMatch(html, /&lt;div|span style|<table>/)
})

test('renders color swatch HTML as a swatch instead of escaped span text', () => {
    const html = renderMarkdownTable('| Name | Light mode |\n| --- | --- |\n| Text color | <span style="color:#151515; font-size: 20px">■</span> #151515 |')

    assert.match(html, /<span class="color-swatch" style="background-color:#151515;"> <\/span> #151515/)
    assert.doesNotMatch(html, /&lt;span|style=&quot;color/)
})

test('renders mermaid diagrams as embedded image assets', () => {
    const diagrams = new Map()
    const html = markdownToXhtml('```mermaid\nflowchart TB\nA --> B\n```', { diagrams })

    assert.match(html, /<figure class="diagram"><img src="..\/assets\/diagrams\/diagram-[a-f0-9]+\.png" alt="Diagram" \/><figcaption>Diagram<\/figcaption><\/figure>/)
    assert.equal(diagrams.size, 1)
    assert.equal([...diagrams.values()][0].source, 'flowchart TB\nA --> B')
})

test('adds generated diagram assets to OPF manifests', () => {
    const opf = buildOpf(
        [{ id: 'chapter-1', href: 'chapters/example.xhtml' }],
        '2026-05-05T00:00:00Z',
        [{ manifestHref: 'assets/diagrams/diagram-a.png', mediaType: 'image/png' }]
    )

    assert.match(opf, /href="assets\/diagrams\/diagram-a\.png" media-type="image\/png"/)
})

test('marks numbered h2 headings for page breaks without forcing normal h2 headings', () => {
    const html = markdownToXhtml('## 2. How we talk about PostHog\n\nText.\n\n## Normal section')

    assert.match(html, /<h2 class="numbered-section" id="2-how-we-talk-about-posthog">2\. How we talk about PostHog<\/h2>/)
    assert.match(html, /<h2 id="normal-section">Normal section<\/h2>/)
})

test('validates generated XHTML as well-formed XML', () => {
    assert.deepEqual(validateXhtml('<?xml version="1.0"?><html><body><p>R&amp;D</p></body></html>').errors, [])
    assert.match(validateXhtml('<?xml version="1.0"?><html><body><p>R&D</p></body></html>').errors[0], /Unescaped ampersand/)
})

test('flags raw root-relative links and unsafe URL schemes in generated XHTML', () => {
    const files = new Map([
        ['OEBPS/chapters/chapter.xhtml', '<a href="/docs/foo">docs</a><a href="javascript:alert(1)">bad</a>'],
        ['OEBPS/content.opf', '<manifest><item id="chapter" href="chapters/chapter.xhtml" media-type="application/xhtml+xml" /></manifest>'],
    ])

    const result = validateGeneratedEpubStructure(files)

    assert.deepEqual(result.errors, [
        'OEBPS/chapters/chapter.xhtml contains root-relative href /docs/foo',
        'OEBPS/chapters/chapter.xhtml contains unsafe href javascript:alert(1)',
    ])
})

test('flags internal chapter links that do not point to generated EPUB files', () => {
    const files = new Map([
        ['OEBPS/chapters/chapter.xhtml', '<a href="chapters/missing.xhtml#section">missing</a>'],
        ['OEBPS/content.opf', '<manifest><item id="chapter" href="chapters/chapter.xhtml" media-type="application/xhtml+xml" /></manifest>'],
    ])

    const result = validateGeneratedEpubStructure(files)

    assert.deepEqual(result.errors, ['OEBPS/chapters/chapter.xhtml links to missing internal file OEBPS/chapters/chapters/missing.xhtml'])
})

test('resolves internal chapter links relative to the containing XHTML file during validation', () => {
    const files = new Map([
        ['OEBPS/chapters/source.xhtml', '<a href="target.xhtml#section">target</a>'],
        ['OEBPS/chapters/target.xhtml', '<h1 id="section">Target</h1>'],
        ['OEBPS/content.opf', '<manifest><item id="source" href="chapters/source.xhtml" media-type="application/xhtml+xml" /><item id="target" href="chapters/target.xhtml" media-type="application/xhtml+xml" /></manifest>'],
    ])

    const result = validateGeneratedEpubStructure(files)

    assert.deepEqual(result.errors, [])
})

test('book CSS discourages headings from being stranded at the bottom of a page', () => {
    const css = buildBookCss()

    assert.match(css, /h2, h3, h4 \{[^}]*break-after: avoid;[^}]*page-break-after: avoid;/s)
    assert.match(css, /h2 \+ \*, h3 \+ \*, h4 \+ \* \{[^}]*break-before: avoid;[^}]*page-break-before: avoid;/s)
})

test('resolves local root-relative image paths into EPUB asset paths', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebook-assets-'))
    const siteDir = path.join(tempDir, 'posthog.com')
    const sourcePath = path.join(siteDir, 'contents/handbook/example.md')
    const imagePath = path.join(siteDir, 'static/images/example.png')
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
    fs.mkdirSync(path.dirname(imagePath), { recursive: true })
    fs.writeFileSync(imagePath, Buffer.from('image'))

    const asset = resolveAsset('/images/example.png', sourcePath, { siteDir })

    assert.equal(asset.kind, 'local')
    assert.equal(asset.sourcePath, imagePath)
    assert.equal(asset.epubHref, '../assets/images/example.png')
    assert.equal(asset.manifestHref, 'assets/images/example.png')
})

test('marks missing local images as placeholders instead of broken assets', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebook-assets-'))
    const siteDir = path.join(tempDir, 'posthog.com')
    const sourcePath = path.join(siteDir, 'contents/handbook/example.md')
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true })

    const asset = resolveAsset('/images/missing.png', sourcePath, { siteDir })

    assert.equal(asset.kind, 'missing')
    assert.equal(asset.placeholder, 'Image unavailable: /images/missing.png')
})

test('detects remote PostHog images as embeddable assets', () => {
    const asset = resolveAsset('https://posthog.com/images/example.png', '/tmp/example.md')

    assert.equal(asset.kind, 'remote')
    assert.equal(asset.url, 'https://posthog.com/images/example.png')
    assert.equal(asset.epubHref, '../assets/remote/posthog-com-images-example.png')
})

test('optimizes oversized raster images to a maximum width', async () => {
    const input = await sharp({
        create: {
            width: 2000,
            height: 1000,
            channels: 3,
            background: '#ffcc00',
        },
    })
        .png()
        .toBuffer()

    const optimized = await optimizeAsset({ buffer: input, extension: '.png', maxWidth: 1400 })
    const metadata = await sharp(optimized.buffer).metadata()

    assert.equal(metadata.width, 1400)
    assert.equal(optimized.mediaType, 'image/jpeg')
    assert.equal(optimized.extension, '.jpg')
})

test('preserves transparency by optimizing alpha rasters as PNG', async () => {
    const input = await sharp({
        create: {
            width: 1800,
            height: 900,
            channels: 4,
            background: { r: 255, g: 204, b: 0, alpha: 0.4 },
        },
    })
        .png()
        .toBuffer()

    const optimized = await optimizeAsset({ buffer: input, extension: '.png', maxWidth: 1400 })
    const metadata = await sharp(optimized.buffer).metadata()

    assert.equal(metadata.width, 1400)
    assert.equal(metadata.hasAlpha, true)
    assert.equal(optimized.mediaType, 'image/png')
    assert.equal(optimized.extension, '.png')
})

test('converts opaque webp images to JPEG for broad reader support', async () => {
    const input = await sharp({
        create: {
            width: 800,
            height: 400,
            channels: 3,
            background: '#336699',
        },
    })
        .webp()
        .toBuffer()

    const optimized = await optimizeAsset({ buffer: input, extension: '.webp', maxWidth: 1400 })

    assert.equal(optimized.mediaType, 'image/jpeg')
    assert.equal(optimized.extension, '.jpg')
})

test('creates stable chapter filenames from handbook slugs', () => {
    assert.equal(getChapterHref('/handbook/engineering/posthog-com/markdown'), 'chapters/handbook-engineering-posthog-com-markdown.xhtml')
})

test('deduplicates while preserving first-seen order', () => {
    assert.deepEqual(uniqueOrdered(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c'])
})

test('ebook modules expose focused build primitives', () => {
    assert.equal(typeof require('./source.cjs').getOrderedChapters, 'function')
    assert.equal(typeof require('./source.cjs').slugFromFile, 'function')
    assert.equal(typeof require('./source.cjs').fileFromSlug, 'function')
    assert.equal(typeof require('./source.cjs').getChapterHref, 'function')
    assert.equal(typeof require('./markdown.cjs').markdownToXhtml, 'function')
    assert.equal(typeof require('./markdown.cjs').renderMarkdownTable, 'function')
    assert.equal(typeof require('./links.cjs').rewriteLinks, 'function')
    assert.equal(typeof require('./links.cjs').rewriteHandbookLinks, 'function')
    assert.equal(typeof require('./assets.cjs').optimizeAsset, 'function')
    assert.equal(typeof require('./assets.cjs').resolveAsset, 'function')
    assert.equal(typeof require('./assets.cjs').materializeAssets, 'function')
    assert.equal(typeof require('./epub.cjs').buildOpf, 'function')
    assert.equal(typeof require('./epub.cjs').buildBookCss, 'function')
    assert.equal(typeof require('./epub.cjs').validateXhtml, 'function')
    assert.equal(typeof require('./epub.cjs').validateGeneratedEpubStructure, 'function')
})
