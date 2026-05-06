#!/usr/bin/env node

const ebook = require('./lib/generator.cjs')

if (require.main === module) {
    ebook.buildEpub(ebook.parseArgs(process.argv.slice(2))).then((manifest) => {
        console.log(`Built ${manifest.chapters} chapters`)
        console.log(manifest.output)
    })
}

module.exports = ebook
