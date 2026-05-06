# Two-Edition EPUB Generator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and deploy two PostHog Handbook EPUB editions, Full and Short, with per-edition covers/credits and a landing page that offers both downloads.

**Architecture:** Keep the current root CLI contract but flatten implementation into `scripts/ebook/`. The build pipeline discovers source chapters, filters them by edition, renders XHTML/assets once per edition, packages separate EPUB files, and writes one static landing page for Cloudflare Pages.

**Tech Stack:** Node.js CommonJS, `node:test`, `sharp`, `@mermaid-js/mermaid-cli`, `zip`, Cloudflare Pages, GitHub Actions.

---

## Current State

- Current CLI: `scripts/handbook-ebook/build-handbook-epub.cjs`.
- Current tests: `scripts/handbook-ebook/build-handbook-epub.test.cjs`.
- Current implementation modules:
  - `scripts/handbook-ebook/lib/generator.cjs` is too large at about 1,267 lines.
  - `scripts/handbook-ebook/lib/config.cjs`.
  - `scripts/handbook-ebook/lib/pages.cjs`.
- Current output: one EPUB at `dist/handbook-ebook/posthog-handbook-full-preview.epub`.
- Existing Cloudflare files: `wrangler.toml`, `.github/workflows/deploy.yml`.
- Keep `posthog.com` as read-only input.

## Task 1: Initialize Git Baseline

**Files:**
- Create: `.gitignore`

**Step 1: Initialize git**

Run:

```bash
git init
```

Expected: repository initialized in `/Users/yanchuk/Documents/GitHub/posthog-handbook-ebook`.

**Step 2: Add ignore file**

Create `.gitignore`:

```gitignore
.DS_Store
.cache/
dist/
node_modules/
```

**Step 3: Check status**

Run:

```bash
git status --short
```

Expected: source/config files are visible; ignored build/dependency directories are not.

**Step 4: Commit baseline**

Run:

```bash
git add .gitignore package.json pnpm-lock.yaml scripts wrangler.toml .github docs skills-lock.json
git commit -m "chore: capture ebook generator baseline"
```

Expected: clean baseline commit. If git has no configured identity, configure local repo identity and retry:

```bash
git config user.name "Oleksii Ianchuk"
git config user.email "oleksii@ianchuk.com"
```

## Task 2: Flatten Script Layout

**Files:**
- Move: `scripts/handbook-ebook/build-handbook-epub.cjs` to `scripts/ebook/build.cjs`
- Move: `scripts/handbook-ebook/build-handbook-epub.test.cjs` to `scripts/ebook/build.test.cjs`
- Move: `scripts/handbook-ebook/lib/config.cjs` to `scripts/ebook/config.cjs`
- Move: `scripts/handbook-ebook/lib/pages.cjs` to `scripts/ebook/pages.cjs`
- Move: `scripts/handbook-ebook/lib/generator.cjs` to `scripts/ebook/generator.cjs`
- Modify: `package.json`

**Step 1: Write failing test for flattened import path**

In `scripts/ebook/build.test.cjs`, require `./build.cjs` instead of `./build-handbook-epub.cjs`.

Run:

```bash
pnpm test:ebook
```

Expected: FAIL until paths/scripts are updated.

**Step 2: Move files and update imports**

Use `git mv` for tracked files:

```bash
mkdir -p scripts/ebook
git mv scripts/handbook-ebook/build-handbook-epub.cjs scripts/ebook/build.cjs
git mv scripts/handbook-ebook/build-handbook-epub.test.cjs scripts/ebook/build.test.cjs
git mv scripts/handbook-ebook/lib/config.cjs scripts/ebook/config.cjs
git mv scripts/handbook-ebook/lib/pages.cjs scripts/ebook/pages.cjs
git mv scripts/handbook-ebook/lib/generator.cjs scripts/ebook/generator.cjs
```

Update `scripts/ebook/build.cjs` to require `./generator.cjs`.

Update `scripts/ebook/generator.cjs` project root resolution from `../../..` to `../..`.

Update `package.json`:

```json
{
  "scripts": {
    "build:ebook": "node scripts/ebook/build.cjs",
    "deploy:pages": "wrangler pages deploy dist/handbook-ebook --project-name posthog-handbook-ebook",
    "test:ebook": "node --test scripts/ebook/*.test.cjs"
  }
}
```

**Step 3: Verify green**

Run:

```bash
node --check scripts/ebook/build.cjs
node --check scripts/ebook/generator.cjs
pnpm test:ebook
```

Expected: all syntax checks and tests pass.

**Step 4: Commit**

```bash
git add package.json scripts
git commit -m "refactor: flatten ebook scripts"
```

## Task 3: Split Oversized Generator

**Files:**
- Create: `scripts/ebook/source.cjs`
- Create: `scripts/ebook/markdown.cjs`
- Create: `scripts/ebook/links.cjs`
- Create: `scripts/ebook/assets.cjs`
- Create: `scripts/ebook/epub.cjs`
- Modify: `scripts/ebook/generator.cjs`
- Modify: `scripts/ebook/build.test.cjs`

**Step 1: Add module export tests**

Add tests that import each new module and assert key functions exist:

```js
test('ebook modules expose focused build primitives', () => {
    assert.equal(typeof require('./source.cjs').getOrderedChapters, 'function')
    assert.equal(typeof require('./markdown.cjs').markdownToXhtml, 'function')
    assert.equal(typeof require('./links.cjs').rewriteLinks, 'function')
    assert.equal(typeof require('./assets.cjs').optimizeAsset, 'function')
    assert.equal(typeof require('./epub.cjs').buildOpf, 'function')
})
```

Run:

```bash
pnpm test:ebook
```

Expected: FAIL because modules do not exist.

**Step 2: Extract without behavior changes**

Move functions from `generator.cjs`:

- `source.cjs`: `discoverHandbookFiles`, `readSidebarSlugs`, `getOrderedChapters`, `slugFromFile`, `fileFromSlug`, `getChapterHref`.
- `markdown.cjs`: `markdownToXhtml`, `renderMarkdownTable`, MDX component rendering helpers, block rendering helpers.
- `links.cjs`: `rewriteLinks`, `rewriteHandbookLinks`, `relativeHref`, external link annotation.
- `assets.cjs`: `resolveAsset`, `optimizeAsset`, `materializeAssets`, `materializeDiagrams`, Mermaid rendering helpers.
- `epub.cjs`: `pageTemplate`, `buildNav`, `buildOpf`, `buildBookCss`, `validateXhtml`, `validateGeneratedEpubStructure`, `writeFile`.
- `generator.cjs`: keep orchestration, `buildEpub`, and `parseArgs`.

Do not change behavior in this task.

**Step 3: Verify green**

Run:

```bash
node --check scripts/ebook/*.cjs
pnpm test:ebook
pnpm build:ebook
unzip -t dist/handbook-ebook/posthog-handbook-full-preview.epub
```

Expected: same one-EPUB output as before, all checks pass.

**Step 4: Commit**

```bash
git add scripts/ebook
git commit -m "refactor: split ebook generator modules"
```

## Task 4: Add Edition Model

**Files:**
- Create: `scripts/ebook/editions.cjs`
- Modify: `scripts/ebook/source.cjs`
- Modify: `scripts/ebook/generator.cjs`
- Modify: `scripts/ebook/build.test.cjs`

**Step 1: Write failing tests**

Add tests:

```js
const { getEditionConfig, filterChaptersForEdition } = require('./editions.cjs')

test('full edition keeps all chapters', () => {
    const chapters = [{ slug: '/handbook/company/culture' }, { slug: '/handbook/onboarding/new-hire-onboarding' }]
    assert.deepEqual(filterChaptersForEdition(chapters, getEditionConfig('full')), chapters)
})

test('short edition includes high-level pages and excludes internal procedures', () => {
    const chapters = [
        { slug: '/handbook/company/culture' },
        { slug: '/handbook/which-products' },
        { slug: '/handbook/onboarding/new-hire-onboarding' },
        { slug: '/handbook/company/post-mortems' },
        { slug: '/handbook/engineering/clickhouse/schema' },
    ]
    const result = filterChaptersForEdition(chapters, getEditionConfig('short')).map((chapter) => chapter.slug)
    assert.deepEqual(result, ['/handbook/company/culture', '/handbook/which-products'])
})
```

Run:

```bash
pnpm test:ebook
```

Expected: FAIL because `editions.cjs` does not exist.

**Step 2: Implement editions**

Create `scripts/ebook/editions.cjs`:

- `getEditionConfig('full')`: `{ id: 'full', label: 'Full Edition', outputFileName: 'posthog-handbook-full.epub' }`
- `getEditionConfig('short')`: `{ id: 'short', label: 'Short Edition', outputFileName: 'posthog-handbook-short.epub' }`
- `filterChaptersForEdition(chapters, edition)`:
  - Full returns all chapters unchanged.
  - Short returns only chapters whose slug is in an explicit allowlist.

Short allowlist:

```js
[
  '/handbook/company/culture',
  '/handbook/company/communication',
  '/handbook/company/management',
  '/handbook/company/small-teams',
  '/handbook/company/offsites',
  '/handbook/company/goal-setting',
  '/handbook/company/sprints',
  '/handbook/company/kudos',
  '/handbook/company/do-more-weird',
  '/handbook/company/grown-ups',
  '/handbook/company/lore',
  '/handbook/strategy/brand',
  '/handbook/brand/overview',
  '/handbook/brand/philosophy',
  '/handbook/brand/style-guide',
  '/handbook/brand/startups',
  '/handbook/brand/testimonials',
  '/handbook/brand/press',
  '/handbook/how-we-make-money',
  '/handbook/how-we-get-users',
  '/handbook/which-products',
  '/handbook/low-prices',
  '/handbook/making-users-happy',
  '/handbook/future',
  '/handbook/story',
  '/handbook/strong-team',
  '/handbook/wide-company',
  '/handbook/product/metrics',
  '/handbook/product/product-team',
  '/handbook/product/product-manager-role',
  '/handbook/product/releasing-new-products-and-features',
  '/handbook/product/per-product-growth-reviews',
  '/handbook/product/prioritizing-work-for-mature-products',
  '/handbook/product/visiting-customers',
  '/handbook/product/user-feedback',
  '/handbook/engineering/product-engineering',
  '/handbook/engineering/development-process',
  '/handbook/engineering/how-we-review',
  '/handbook/engineering/writing-docs',
  '/handbook/engineering/product-design',
  '/handbook/engineering/product-design-process',
  '/handbook/engineering/bug-prioritization',
  '/handbook/engineering/tech-talks',
  '/handbook/engineering/customer-comms',
  '/handbook/engineering/visiting-customers',
  '/handbook/marketing/positioning',
  '/handbook/marketing/product-announcements',
  '/handbook/marketing/speaker-guide',
  '/handbook/marketing/events',
  '/handbook/marketing/video',
  '/handbook/marketing/customer-case-studies',
  '/handbook/marketing/working-with-website',
  '/handbook/content/posthog-style-guide',
  '/handbook/content/linkedin',
  '/handbook/content/youtube',
  '/handbook/content/newsletter-tips',
  '/handbook/content/screen-recording-guide',
  '/handbook/community',
  '/handbook/community/questions',
  '/handbook/community/profiles',
  '/handbook/community/points',
  '/handbook/people/benefits',
  '/handbook/people/compensation',
  '/handbook/people/feedback',
  '/handbook/people/philosophy-club',
  '/handbook/people/bookhog',
  '/handbook/people/training',
  '/handbook/growth/sales/who-we-do-business-with',
  '/handbook/growth/sales/why-buy-posthog',
  '/handbook/growth/sales/getting-people-to-talk-to-you',
  '/handbook/growth/use-case-selling/product-intelligence',
  '/handbook/growth/use-case-selling/observability',
  '/handbook/growth/use-case-selling/growth-and-marketing',
  '/handbook/growth/use-case-selling/data-infrastructure',
  '/handbook/growth/use-case-selling/ai-llm-observability'
]
```

**Step 3: Verify green**

Run:

```bash
pnpm test:ebook
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add scripts/ebook
git commit -m "feat: add ebook edition filtering"
```

## Task 5: Build Two EPUBs

**Files:**
- Modify: `scripts/ebook/generator.cjs`
- Modify: `scripts/ebook/pages.cjs`
- Modify: `scripts/ebook/config.cjs`
- Modify: `scripts/ebook/build.test.cjs`

**Step 1: Write failing tests**

Add tests:

```js
test('cover page includes edition label', () => {
    const { buildCoverPage } = require('./pages.cjs')
    assert.match(buildCoverPage('posthog-handbook-full-cover.jpg', 'Full Edition'), /Full Edition/)
    assert.match(buildCoverPage('posthog-handbook-short-cover.jpg', 'Short Edition'), /Short Edition/)
})

test('landing page links to full and short downloads', () => {
    const { buildLandingPage } = require('./pages.cjs')
    const html = buildLandingPage({
        generatedAt: '2026-05-06T10:00:00Z',
        editions: [
            { id: 'full', label: 'Full Edition', chapters: 313, fileName: 'posthog-handbook-full.epub' },
            { id: 'short', label: 'Short Edition', chapters: 70, fileName: 'posthog-handbook-short.epub' },
        ],
        coverFileName: 'posthog-handbook-cover.jpg',
        pageUrl: 'https://posthog-handbook-ebook.ianchuk.com',
    })
    assert.match(html, /posthog-handbook-full\.epub/)
    assert.match(html, /posthog-handbook-short\.epub/)
    assert.match(html, /Full Edition/)
    assert.match(html, /Short Edition/)
})
```

Run:

```bash
pnpm test:ebook
```

Expected: FAIL until page builders accept edition data.

**Step 2: Implement edition-aware build**

Update build pipeline:

- `buildEpub({ outputDir, edition })` builds one edition.
- `buildAllEditions({ outputDir })` builds Full then Short and writes landing page.
- `pnpm build:ebook` calls `buildAllEditions`.
- CLI supports:
  - `--edition full`
  - `--edition short`
  - no edition: build both.

Output files:

- `dist/handbook-ebook/posthog-handbook-full.epub`
- `dist/handbook-ebook/posthog-handbook-short.epub`
- `dist/handbook-ebook/posthog-handbook-full-cover.jpg`
- `dist/handbook-ebook/posthog-handbook-short-cover.jpg`
- `dist/handbook-ebook/index.html`
- `dist/handbook-ebook/manifest.json`

Per EPUB:

- Cover page title includes edition label.
- Credits page includes original handbook link, rights note, converter credit, GitHub link, update date.
- OPF title:
  - `PostHog Handbook: Full Edition`
  - `PostHog Handbook: Short Edition`

**Step 3: Verify green**

Run:

```bash
pnpm test:ebook
pnpm build:ebook
unzip -t dist/handbook-ebook/posthog-handbook-full.epub
unzip -t dist/handbook-ebook/posthog-handbook-short.epub
```

Expected: both EPUB archives validate.

**Step 4: Commit**

```bash
git add scripts/ebook dist/handbook-ebook/manifest.json package.json
git commit -m "feat: build full and short ebook editions"
```

Do not commit generated EPUB files unless the repository intentionally stores release artifacts.

## Task 6: Preserve Rich Asset Embeds

**Files:**
- Modify: `scripts/ebook/assets.cjs`
- Modify: `scripts/ebook/markdown.cjs`
- Modify: `scripts/ebook/build.test.cjs`

**Step 1: Write failing tests**

Add tests:

```js
test('valid GIF assets are preserved as GIF embeds', async () => {
    const { optimizeAsset } = require('./assets.cjs')
    const buffer = fs.readFileSync(path.join(__dirname, 'fixtures/animated.gif'))
    const result = await optimizeAsset({ buffer, extension: '.gif' })
    assert.equal(result.extension, '.gif')
    assert.equal(result.mediaType, 'image/gif')
})
```

If no fixture exists, create a tiny valid GIF fixture in `scripts/ebook/fixtures/animated.gif`.

Run:

```bash
pnpm test:ebook
```

Expected: PASS if current behavior already preserves GIFs. If failing, implement preservation.

**Step 2: Confirm embed replacements**

Ensure these behaviors remain covered:

- `ProductScreenshot` and `CloudinaryImage` become embedded image figures.
- YouTube iframes become thumbnail plus external “Watch on YouTube” link.
- `ProductVideo` and `WistiaEmbed` become external video cards.
- Mermaid blocks become PNG assets.
- Unknown MDX components become visible callouts.
- Missing assets become placeholders.

**Step 3: Verify green**

Run:

```bash
pnpm test:ebook
pnpm build:ebook
```

Expected: no regressions.

**Step 4: Commit**

```bash
git add scripts/ebook
git commit -m "test: lock rich embed handling"
```

## Task 7: Landing Page And Deployment Finalization

**Files:**
- Modify: `scripts/ebook/pages.cjs`
- Modify: `.github/workflows/deploy.yml`
- Modify: `wrangler.toml`
- Modify: `package.json`

**Step 1: Write failing tests for landing page completeness**

Add test:

```js
test('landing page includes required credits and both download buttons', () => {
    const { buildLandingPage } = require('./pages.cjs')
    const html = buildLandingPage({
        generatedAt: '2026-05-06T10:00:00Z',
        editions: [
            { id: 'full', label: 'Full Edition', chapters: 313, fileName: 'posthog-handbook-full.epub' },
            { id: 'short', label: 'Short Edition', chapters: 70, fileName: 'posthog-handbook-short.epub' },
        ],
        coverFileName: 'posthog-handbook-full-cover.jpg',
        pageUrl: 'https://posthog-handbook-ebook.ianchuk.com',
    })
    assert.match(html, /Download Full Edition/)
    assert.match(html, /Download Short Edition/)
    assert.match(html, /Thanks to the PostHog team/)
    assert.match(html, /https:\/\/posthog\.com\/handbook/)
    assert.match(html, /https:\/\/github\.com\/yanchuk\/posthog-handbook-ebook/)
    assert.doesNotMatch(html, /\{time|TODO|undefined/)
})
```

Run:

```bash
pnpm test:ebook
```

Expected: FAIL until button text and required metadata match.

**Step 2: Update workflow**

Ensure `.github/workflows/deploy.yml`:

- Sparse-checkouts PostHog source.
- Runs `pnpm test:ebook`.
- Runs `pnpm build:ebook`.
- Runs:

```bash
unzip -t dist/handbook-ebook/posthog-handbook-full.epub
unzip -t dist/handbook-ebook/posthog-handbook-short.epub
```

- Deploys `dist/handbook-ebook` to Cloudflare Pages.

**Step 3: Verify green**

Run:

```bash
pnpm test:ebook
pnpm build:ebook
pnpm exec wrangler --version
```

Expected: tests/build pass and Wrangler is available.

**Step 4: Commit**

```bash
git add scripts/ebook .github/workflows/deploy.yml wrangler.toml package.json pnpm-lock.yaml
git commit -m "feat: finalize ebook landing and pages deploy"
```

## Task 8: Final Validation

**Files:**
- No source edits unless verification exposes a bug.

**Step 1: Run full verification**

Run:

```bash
pnpm test:ebook
pnpm build:ebook
unzip -t dist/handbook-ebook/posthog-handbook-full.epub
unzip -t dist/handbook-ebook/posthog-handbook-short.epub
rg -n 'href="/(handbook|docs)|href="(javascript|data|file):|\{time|TODO|undefined' dist/handbook-ebook/index.html dist/handbook-ebook/epub-root || true
```

Expected:

- Tests pass.
- Both EPUB archives validate.
- `rg` prints no problematic generated output. If `TODO` appears only inside source handbook content intentionally, document it and do not change PostHog source.

**Step 2: Check output summary**

Run:

```bash
cat dist/handbook-ebook/manifest.json
ls -lh dist/handbook-ebook/*.epub dist/handbook-ebook/*.jpg dist/handbook-ebook/index.html
```

Expected:

- Manifest lists both editions.
- Both EPUBs and cover images exist.
- Landing page exists.

**Step 3: Commit any verification fixes**

Only if needed:

```bash
git add scripts package.json pnpm-lock.yaml .github wrangler.toml
git commit -m "fix: resolve final ebook validation issues"
```

## Acceptance Criteria

- Repo has a git baseline.
- Scripts are flattened under `scripts/ebook`.
- Generator is split into focused modules; no single implementation file remains the catch-all for source, markdown, links, assets, EPUB packaging, and page rendering.
- `pnpm build:ebook` creates both Full and Short EPUBs.
- Both EPUBs include edition-specific cover and credits pages.
- Landing page includes both download buttons.
- Screenshots and valid GIFs are preserved by default.
- Cloudflare Pages workflow builds and validates both editions before deploy.
- All tests pass.
