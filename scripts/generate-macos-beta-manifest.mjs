#!/usr/bin/env node

import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildMacosBetaReleaseManifest,
  findLatestDmg,
  formatSha256File,
  sha256File
} from './lib/beta-release-manifest.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(repoRoot, 'apps', 'desktop', 'release')

async function main() {
  const artifactPath = await resolveArtifactPath()
  if (!artifactPath) {
    throw new Error('No macOS DMG found under apps/desktop/release.')
  }

  const packageVersion = await readPackageVersion()
  const info = await stat(artifactPath)
  const sha256 = await sha256File(artifactPath)
  const manifest = buildMacosBetaReleaseManifest({
    artifactPath,
    packageVersion,
    sha256,
    sizeBytes: info.size
  })

  const outputDir = resolve(process.env.VIDEORC_RELEASE_MANIFEST_DIR ?? dirname(artifactPath))
  await mkdir(outputDir, { recursive: true })

  const manifestPath = join(outputDir, 'release.json')
  const shaPath = join(outputDir, `${manifest.filename}.sha256`)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(shaPath, formatSha256File({ sha256, filename: manifest.filename }))

  console.log(`macos-beta-release-manifest: wrote ${relativeToRepo(manifestPath)}`)
  console.log(`macos-beta-release-manifest: wrote ${relativeToRepo(shaPath)}`)
  console.log(`macos-beta-release-manifest: ${manifest.releaseId} ${manifest.filename}`)
}

async function resolveArtifactPath() {
  const explicit = process.env.VIDEORC_RELEASE_ARTIFACT
  if (explicit) {
    return resolve(explicit)
  }

  return (await findLatestDmg(releaseDir))?.path ?? null
}

async function readPackageVersion() {
  const packageJson = JSON.parse(
    await import('node:fs/promises').then(({ readFile }) =>
      readFile(join(repoRoot, 'apps', 'desktop', 'package.json'), 'utf8')
    )
  )
  const version = packageJson.version
  if (typeof version !== 'string' || version.trim().length === 0) {
    throw new Error('apps/desktop/package.json must include a version.')
  }
  return version
}

function relativeToRepo(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path
}

main().catch((error) => {
  console.error(`macos-beta-release-manifest: FAIL (${error?.message ?? 'unexpected error'})`)
  process.exit(1)
})
