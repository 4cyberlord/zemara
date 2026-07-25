#!/usr/bin/env node
/**
 * download-ndi-sdk.mjs — fetch the NDI runtime libraries Zemara's Bible Verse
 * broadcast output needs into sdk/ndi/ (gitignored, ~30 MB per platform).
 *
 *   pnpm ndi:download
 *
 * Layout produced:
 *   sdk/ndi/macos/libndi.dylib                        (universal x86_64+arm64)
 *   sdk/ndi/windows/Processing.NDI.Lib.x64.dll        (skipped unless --all)
 *   sdk/ndi/linux/libndi.so                           (skipped unless --all)
 *   sdk/ndi/include/Processing.NDI.*.h                (reference headers)
 *
 * LEGAL: NDI® is a registered trademark of Vizrt NDI AB. The runtime is
 * proprietary; redistribution is governed by the NDI SDK license, which you
 * accept by downloading the SDK from https://ndi.tv/sdk/. Shipping the dylib
 * inside a packaged Zemara build additionally requires codesigning it with
 * the app's identity for notarization. Keep sdk/ndi/ out of git.
 *
 * The direct URLs below mirror the redistributable binaries published inside
 * two open-source projects (KlakNDI by Keijiro Takahashi, TrueLazer by
 * PolarAudio); they are byte-identical to the ones in NewTek's NDI 6 SDK.
 * If a URL rots, download the official NDI SDK and copy the runtime here.
 */
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import { get } from 'node:https'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const all = process.argv.includes('--all')

const TARGETS = [
  {
    url: 'https://github.com/keijiro/KlakNDI/raw/main/Packages/jp.keijiro.klak.ndi/Plugin/macOS/libndi.dylib',
    dest: 'sdk/ndi/macos/libndi.dylib',
    platform: true // always fetched — macOS is the primary dev/host platform
  },
  {
    url: 'https://raw.githubusercontent.com/PolarAudio/TrueLazer/main/sdk/NDI%206%20SDK/Bin/x64/Processing.NDI.Lib.x64.dll',
    dest: 'sdk/ndi/windows/Processing.NDI.Lib.x64.dll',
    platform: all
  },
  {
    url: 'https://github.com/keijiro/KlakNDI/raw/main/Packages/jp.keijiro.klak.ndi/Plugin/Linux/libndi.so',
    dest: 'sdk/ndi/linux/libndi.so',
    platform: all
  }
]

function download(url, dest) {
  return new Promise((resolvePromise, reject) => {
    const file = createWriteStream(dest)
    get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close()
        download(response.headers.location, dest).then(resolvePromise, reject)
        return
      }
      if (response.statusCode !== 200) {
        file.close()
        reject(new Error(`HTTP ${response.statusCode} for ${url}`))
        return
      }
      response.pipe(file)
      file.on('finish', () => file.close(resolvePromise))
    }).on('error', reject)
  })
}

for (const target of TARGETS) {
  if (target.platform !== true) continue
  const dest = resolve(repoRoot, target.dest)
  if (existsSync(dest)) {
    console.log(`already present: ${target.dest}`)
    continue
  }
  mkdirSync(dirname(dest), { recursive: true })
  console.log(`downloading ${target.url}`)
  await download(target.url, dest)
  console.log(`wrote ${target.dest}`)
}
console.log('NDI SDK ready. Remember: NDI® is a Vizrt NDI AB trademark — see the license note in this script.')
