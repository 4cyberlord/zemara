// electron-builder notarizes + staples the .app *inside* the dmg, but leaves the
// dmg wrapper itself unsigned + un-notarized — so a downloaded .dmg trips
// Gatekeeper ("Apple cannot check it for malicious software") even though the app
// is fine. This signs + notarizes + staples each release/*.dmg so the download
// opens cleanly. Runs as the last step of `pnpm dist:release`, reusing the same
// APPLE_* env the app-notarize step uses.
// See "2026-06-30 - Videorc Desktop Distribution Channel Plan".

import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const RELEASE_DIR = join(HERE, '..', 'release')
const SIGN_IDENTITY = 'Developer ID Application: Uros Miric (C2PA37RB58)'
const TEAM_ID = process.env.APPLE_TEAM_ID || 'C2PA37RB58'

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' })
}

async function main() {
  const appleId = process.env.APPLE_ID
  const password = process.env.APPLE_APP_SPECIFIC_PASSWORD
  if (!appleId || !password) {
    console.error('staple-dmg: APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD are required.')
    process.exit(1)
  }

  // Only the CURRENT version's dmg: release/ accumulates artifacts from prior
  // releases, and sweeping them wasted a notarization round-trip per stale dmg
  // — then hard-failed the whole release when Apple's ticket lookup rejected an
  // already-shipped one (0.9.3 cut, 2026-07-02).
  const { version } = JSON.parse(await readFile(join(HERE, '..', 'package.json'), 'utf8'))
  let dmgs
  try {
    dmgs = (await readdir(RELEASE_DIR)).filter(
      (name) => name.endsWith('.dmg') && name.includes(`-${version}-`)
    )
  } catch {
    console.error('staple-dmg: no release/ directory — run dist:release first.')
    process.exit(1)
  }
  if (dmgs.length === 0) {
    console.error(`staple-dmg: no .dmg for version ${version} found in release/.`)
    process.exit(1)
  }

  for (const name of dmgs) {
    const dmg = join(RELEASE_DIR, name)
    console.log(`\n[staple-dmg] ${name}: sign → notarize → staple`)
    run('codesign', ['--force', '--sign', SIGN_IDENTITY, '--timestamp', dmg])
    run('xcrun', [
      'notarytool',
      'submit',
      dmg,
      '--apple-id',
      appleId,
      '--password',
      password,
      '--team-id',
      TEAM_ID,
      '--wait'
    ])
    run('xcrun', ['stapler', 'staple', dmg])
    console.log(`[staple-dmg] ${name}: done.`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
