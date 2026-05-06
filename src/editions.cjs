// src/editions.cjs
//
// Defines the EPUB editions this project ships.
//
// FULL  — every public handbook chapter (~313).
// SHORT — outward-facing strategy / culture / brand / marketing / sales-enablement
//         (~70 chapters). Excludes internal procedures (onboarding, post-mortems)
//         and engineering deep-dives (clickhouse, infrastructure internals).
//
// The Short edition allowlist is hand-curated. Adding a chapter requires:
//   1. Confirming the slug exists at posthog.com/handbook.
//   2. Adding it to SHORT_SLUGS below.
//   3. Re-running `pnpm build:ebook -- --edition short`.
//
// If a slug in SHORT_SLUGS doesn't resolve to a real chapter at build time,
// `filterChaptersForEdition` throws. We fail loud rather than ship a Short
// edition with silently missing content.

const SHORT_SLUGS = [
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
    '/handbook/growth/use-case-selling/ai-llm-observability',
]

const EDITIONS = {
    full: {
        id: 'full',
        label: 'Full Edition',
        opfTitle: 'PostHog Handbook: Full Edition',
        epubFileName: 'posthog-handbook-full.epub',
        coverFileName: 'posthog-handbook-full-cover.jpg',
    },
    short: {
        id: 'short',
        label: 'Short Edition',
        opfTitle: 'PostHog Handbook: Short Edition',
        epubFileName: 'posthog-handbook-short.epub',
        coverFileName: 'posthog-handbook-short-cover.jpg',
        slugAllowlist: SHORT_SLUGS,
    },
}

function listEditionIds() {
    return Object.keys(EDITIONS)
}

function getEditionConfig(id) {
    if (!EDITIONS[id]) {
        throw new Error(`Unknown edition: ${id}. Known editions: ${listEditionIds().join(', ')}`)
    }
    return EDITIONS[id]
}

function filterChaptersForEdition(chapters, edition) {
    if (!edition.slugAllowlist) {
        return chapters
    }
    const inputSlugs = new Set(chapters.map((c) => c.slug))
    const missing = edition.slugAllowlist.filter((slug) => !inputSlugs.has(slug))
    if (missing.length > 0) {
        throw new Error(
            `Edition "${edition.id}" has ${missing.length} allowlisted slug(s) missing from input chapters: ${missing.join(', ')}`
        )
    }
    const allowed = new Set(edition.slugAllowlist)
    return chapters.filter((c) => allowed.has(c.slug))
}

module.exports = {
    EDITIONS,
    filterChaptersForEdition,
    getEditionConfig,
    listEditionIds,
}
