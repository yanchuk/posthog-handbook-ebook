#!/usr/bin/env node

const ebook = require('./generator.cjs')

if (require.main === module) {
    ebook.buildAllEditions(ebook.parseArgs(process.argv.slice(2))).then((manifest) => {
        console.log(`Built ${manifest.editions.length} edition(s):`)
        for (const edition of manifest.editions) {
            console.log(
                `  - ${edition.label} (${edition.chapters} chapters, ${edition.errorCount} errors, ${edition.warningCount} warnings): ${edition.epubFileName}`
            )
        }
        if (manifest.warnings.length > 0) {
            console.warn(`\n${manifest.warnings.length} build warning(s) (non-fatal):`)
            for (const w of manifest.warnings.slice(0, 10)) {
                console.warn(`  [${w.edition}] ${w.kind}: ${w.detail}`)
            }
            if (manifest.warnings.length > 10) {
                console.warn(`  ... and ${manifest.warnings.length - 10} more`)
            }
        }
        if (manifest.errors.length > 0) {
            console.error(`\n${manifest.errors.length} build error(s):`)
            for (const err of manifest.errors.slice(0, 20)) {
                console.error(`  [${err.edition}] ${err.kind}: ${err.detail}`)
            }
            if (manifest.errors.length > 20) {
                console.error(`  ... and ${manifest.errors.length - 20} more`)
            }
            process.exitCode = 1
        }
    })
}

module.exports = ebook
