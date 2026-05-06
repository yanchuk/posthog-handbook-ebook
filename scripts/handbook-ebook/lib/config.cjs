const path = require('node:path')

const SITE_URL = 'https://posthog.com'
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const POSTHOG_SITE_DIR = path.join(PROJECT_ROOT, 'posthog.com')
const DEFAULT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'dist/handbook-ebook')
const HANDBOOK_DIR = path.join(POSTHOG_SITE_DIR, 'contents/handbook')
const SIDEBAR_FILE = path.join(POSTHOG_SITE_DIR, 'src/navs/index.js')
const ORIGINAL_HANDBOOK_URL = 'https://posthog.com/handbook'
const CONVERTER_NAME = 'Oleksii Ianchuk'
const CONVERTER_URL = 'https://ianchuk.com'
const REPO_URL = 'https://github.com/yanchuk/posthog-handbook-ebook'
const PUBLIC_PAGE_URL = 'https://posthog-handbook-ebook.ianchuk.com'
const EPUB_FILE_NAME = 'posthog-handbook-full-preview.epub'
const COVER_FILE_NAME = 'posthog-handbook-cover.jpg'

module.exports = {
    COVER_FILE_NAME,
    CONVERTER_NAME,
    CONVERTER_URL,
    DEFAULT_OUTPUT_DIR,
    EPUB_FILE_NAME,
    HANDBOOK_DIR,
    ORIGINAL_HANDBOOK_URL,
    POSTHOG_SITE_DIR,
    PROJECT_ROOT,
    PUBLIC_PAGE_URL,
    REPO_URL,
    SIDEBAR_FILE,
    SITE_URL,
}
