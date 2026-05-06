#!/usr/bin/env node

const ebook = require('./generator.cjs')

if (require.main === module) {
    ebook.buildAllEditions(ebook.parseArgs(process.argv.slice(2))).then((manifest) => {
        console.log(`Built ${manifest.editions.length} edition(s):`)
        for (const edition of manifest.editions) {
            console.log(`  - ${edition.label} (${edition.chapters} chapters): ${edition.epubFileName}`)
        }
    })
}

module.exports = ebook
