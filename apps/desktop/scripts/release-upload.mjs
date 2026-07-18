// Push the signed + notarized macOS release into Cloudflare R2 in the layout
// videorc-web's download system expects: the dmg plus a release.json manifest
// under releases/macos/<releaseId>/. The web app (lib/download.ts) reads
// release.json with a signed GET and 302s authenticated users to a presigned dmg
// URL — so the bucket stays PRIVATE; we never set public-read. Run after
// `pnpm dist:release`:
//
//   R2_ENDPOINT="https://<account>.r2.cloudflarestorage.com" \
//   R2_BUCKET=videorc-releases \
//   R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
//   RELEASE_ID=0.9.0-beta.1 \            # optional; defaults to the package version
//   pnpm release:upload
//
// We refuse to upload an un-notarized dmg (a download Gatekeeper blocks is worse
// than none). We also publish the electron-updater feed (latest-mac.yml + the zip
// + its blockmap) to a stable updates/macos/ prefix so the in-app Update button
// works — videorc-web's /api/updates/* route proxies that prefix 1:1.
//
// NOTE: `pnpm release:upload:macos` (scripts/upload-macos-beta-release.mjs) is the
// tested pipeline and does the same thing; keep the two in sync.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { AwsClient } from 'aws4fetch'

const HERE = dirname(fileURLToPath(import.meta.url))
const RELEASE_DIR = join(HERE, '..', 'release')
const IMMUTABLE = 'public, max-age=31536000, immutable'
const DEFAULT_MINIMUM_MACOS = 'macOS 13 Ventura or later'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required env: ${name}`)
    process.exit(1)
  }
  return value
}

// Human-readable arch from the electron-builder dmg name (…-mac-arm64.dmg).
function architectureFromFileName(name) {
  if (process.env.VIDEORC_DOWNLOAD_ARCHITECTURE) {
    return process.env.VIDEORC_DOWNLOAD_ARCHITECTURE
  }
  if (/universal/i.test(name)) return 'Universal — Apple Silicon & Intel'
  if (/arm64/i.test(name)) return 'Apple Silicon (Apple M-series)'
  if (/x64|intel/i.test(name)) return 'Intel'
  return 'unknown'
}

async function readFeedArtifacts(dir, { zipName, blockmapName }) {
  try {
    const [latestYml, zip, blockmap] = await Promise.all([
      readFile(join(dir, 'latest-mac.yml')),
      readFile(join(dir, zipName)),
      readFile(join(dir, blockmapName))
    ])
    return { latestYml, zip, blockmap }
  } catch {
    console.error(
      `Missing electron-updater feed artifacts (latest-mac.yml, ${zipName}, ${blockmapName}) in release/. Run \`pnpm dist:release\` first.`
    )
    process.exit(1)
  }
}

async function main() {
  const endpoint = requireEnv('R2_ENDPOINT').replace(/\/+$/, '')
  const bucket = requireEnv('R2_BUCKET')
  const client = new AwsClient({
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    region: 'auto',
    service: 's3'
  })

  const pkg = JSON.parse(await readFile(join(HERE, '..', 'package.json'), 'utf8'))
  const version = pkg.version
  const releaseId = process.env.RELEASE_ID?.trim() || version

  let entries
  try {
    entries = await readdir(RELEASE_DIR)
  } catch {
    console.error('No release/ directory — run `pnpm dist:release` first.')
    process.exit(1)
  }

  const dmgName = entries.find((name) => name.endsWith('.dmg'))
  if (!dmgName) {
    console.error('No .dmg in release/ — run `pnpm dist:release` first.')
    process.exit(1)
  }

  // Never ship a dmg Gatekeeper would block on open.
  try {
    execFileSync('xcrun', ['stapler', 'validate', join(RELEASE_DIR, dmgName)], {
      stdio: 'pipe'
    })
  } catch {
    console.error(`Refusing to upload — ${dmgName} is not notarized/stapled.`)
    process.exit(1)
  }

  const dmg = await readFile(join(RELEASE_DIR, dmgName))
  const sha256 = createHash('sha256').update(dmg).digest('hex')
  const prefix = `releases/macos/${releaseId}`

  // electron-updater feed: a STABLE prefix, overwritten each release, so the
  // videorc-web /api/updates/* route is a trivial 1:1 proxy. electron-updater
  // pulls the zip (not the dmg); its name is the dmg name with a .zip extension.
  const updatesPrefix = (
    process.env.VIDEORC_RELEASE_UPDATES_PREFIX?.trim() || 'updates/macos'
  ).replace(/\/+$/, '')
  const zipName = dmgName.replace(/\.dmg$/, '.zip')
  const blockmapName = `${zipName}.blockmap`
  const feed = await readFeedArtifacts(RELEASE_DIR, { zipName, blockmapName })

  // Field names must match lib/download.ts → downloadReleaseMetadataFromManifest.
  const manifest = {
    releaseId,
    filename: dmgName,
    displayVersion: process.env.DISPLAY_VERSION?.trim() || version,
    bundleVersion: version,
    architecture: architectureFromFileName(dmgName),
    sha256,
    sizeBytes: dmg.length,
    minimumMacOS:
      process.env.VIDEORC_DOWNLOAD_MINIMUM_MACOS?.trim() || DEFAULT_MINIMUM_MACOS,
    ...(process.env.VIDEORC_DOWNLOAD_RELEASE_NOTES_URL
      ? { releaseNotesUrl: process.env.VIDEORC_DOWNLOAD_RELEASE_NOTES_URL.trim() }
      : {})
  }

  // Upload the dmg first so the manifest never points at a missing object.
  const uploads = [
    {
      key: `${prefix}/${dmgName}`,
      body: dmg,
      contentType: 'application/x-apple-diskimage',
      cacheControl: IMMUTABLE
    },
    {
      key: `${prefix}/release.json`,
      body: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'no-cache, must-revalidate'
    },
    // electron-updater feed. The yml must not be cached hard or clients miss new
    // releases; the zip + blockmap are content-addressed, so cache them forever.
    {
      key: `${updatesPrefix}/latest-mac.yml`,
      body: feed.latestYml,
      contentType: 'text/yaml; charset=utf-8',
      cacheControl: 'no-cache, must-revalidate'
    },
    {
      key: `${updatesPrefix}/${zipName}`,
      body: feed.zip,
      contentType: 'application/zip',
      cacheControl: IMMUTABLE
    },
    {
      key: `${updatesPrefix}/${blockmapName}`,
      body: feed.blockmap,
      contentType: 'application/octet-stream',
      cacheControl: IMMUTABLE
    }
  ]

  for (const { key, body, contentType, cacheControl } of uploads) {
    process.stdout.write(`↑ ${key} (${(body.length / 1e6).toFixed(1)} MB) … `)
    const response = await client.fetch(`${endpoint}/${bucket}/${key}`, {
      method: 'PUT',
      body,
      headers: { 'content-type': contentType, 'cache-control': cacheControl }
    })
    if (!response.ok) {
      console.error(`\nFailed (${response.status}): ${await response.text()}`)
      process.exit(1)
    }
    console.log('ok')
  }

  console.log(
    [
      '',
      `Uploaded ${dmgName} + release.json to ${bucket}/${prefix}.`,
      `Uploaded the update feed (latest-mac.yml, ${zipName}, ${blockmapName}) to ${bucket}/${updatesPrefix}.`,
      '',
      'The in-app Update button reads the feed via videorc-web /api/updates/*.',
      '',
      'Set these in videorc-web (Vercel → Production), then redeploy:',
      '  VIDEORC_DOWNLOAD_STORAGE_PROVIDER=s3',
      `  VIDEORC_DOWNLOAD_MANIFEST_OBJECT_KEY=${prefix}/release.json`,
      `  VIDEORC_DOWNLOAD_S3_BUCKET=${bucket}`,
      '  VIDEORC_DOWNLOAD_S3_REGION=auto',
      `  VIDEORC_DOWNLOAD_S3_ENDPOINT_URL=${endpoint}`,
      '  VIDEORC_DOWNLOAD_S3_FORCE_PATH_STYLE=true',
      '  VIDEORC_DOWNLOAD_S3_ACCESS_KEY_ID=<r2 read-only token key>',
      '  VIDEORC_DOWNLOAD_S3_SECRET_ACCESS_KEY=<r2 read-only token secret>',
      '',
      'Then /download/mac serves the signed-in download.'
    ].join('\n')
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
