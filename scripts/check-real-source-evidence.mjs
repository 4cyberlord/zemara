#!/usr/bin/env node

import { readFileSync } from 'node:fs'

import { evaluateRealSourceEvidence } from './lib/real-source-evidence-gates.mjs'

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  printUsage()
  process.exit(0)
}

const manifestPath = args.find((arg) => !arg.startsWith('--'))
if (!manifestPath) {
  printUsage()
  process.exit(2)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
  console.error(`Could not read evidence manifest ${manifestPath}: ${error?.message ?? error}`)
  process.exit(2)
}

const options = {
  require4k30: !args.includes('--allow-non-4k'),
  requireMotion: args.includes('--require-motion'),
  checkFiles: !args.includes('--no-check-files'),
}
const minRecordingMs = numberFlag(args, '--min-recording-ms')
if (minRecordingMs != null) {
  options.minRecordingMs = minRecordingMs
}

const verdict = evaluateRealSourceEvidence(manifest, options)

if (verdict.pass) {
  console.log(`PASS real-source evidence: ${manifestPath}`)
  process.exit(0)
}

console.error(`FAIL real-source evidence: ${manifestPath}`)
for (const failure of verdict.failures) {
  console.error(`- ${failure}`)
}
process.exit(1)

function numberFlag(argv, name) {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return Number(inline.slice(name.length + 1))
  const index = argv.indexOf(name)
  if (index !== -1 && argv[index + 1] != null) return Number(argv[index + 1])
  return null
}

function printUsage() {
  console.log(`Usage: node scripts/check-real-source-evidence.mjs <manifest.evidence.json> [options]

Options:
  --min-recording-ms=N  Require the requested recording duration to be at least N ms.
  --require-motion      Require the screen motion stimulus.
  --allow-non-4k        Do not require the exact 3840x2160@30 30000kbps request.
  --no-check-files      Do not verify that paths in the manifest exist on disk.
`)
}
