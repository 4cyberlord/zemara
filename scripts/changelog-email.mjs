#!/usr/bin/env node
// Renders one changelog entry into newsletter-ready HTML + plaintext.
//
//   node scripts/changelog-email.mjs 0.9.2-beta.1
//   node scripts/changelog-email.mjs            # latest entry
//
// Writes dist/changelog/email/<version>.html and .txt and prints the subject.
// Sending stays manual (no ESP wired yet) — paste into the sending tool.
// VIDEORC_WEB_BASE_URL overrides the link host (default www.videorc.com;
// flip to videorc.com at launch).

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { renderChangelogEmail, resolveWebBaseUrl } from './lib/changelog-email.mjs'
import { findChangelogEntry, loadChangelogEntries } from './lib/changelog.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const version = process.argv[2]
  const entries = await loadChangelogEntries(join(repoRoot, 'changelog'))
  const entry = version ? findChangelogEntry(entries, version) : entries[0]
  if (!entry) {
    throw new Error(
      `No changelog entry for "${version}". Available: ${entries.map((item) => item.version).join(', ')}`
    )
  }

  const email = renderChangelogEmail(entry, { webBaseUrl: resolveWebBaseUrl() })
  const outDir = join(repoRoot, 'dist', 'changelog', 'email')
  await mkdir(outDir, { recursive: true })
  const htmlPath = join(outDir, `${entry.version}.html`)
  const textPath = join(outDir, `${entry.version}.txt`)
  await writeFile(htmlPath, `${email.html}\n`)
  await writeFile(textPath, `${email.text}\n`)

  console.log(`subject: ${email.subject}`)
  console.log(`html:    ${htmlPath}`)
  console.log(`text:    ${textPath}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
