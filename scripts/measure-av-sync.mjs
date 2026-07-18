#!/usr/bin/env node
// CLI for the A/V sync (lip-sync) measurement — plan Phase 5.
//
// Record against the flash+click fixture (a visual flash + an audio tone on the same
// schedule, or a physical clap on camera), then measure how far the sound lags the
// picture in the finished file:
//
//   node scripts/measure-av-sync.mjs <recording.mp4> [--click-noise-db -55]
//   node scripts/measure-av-sync.mjs <run.evidence.json> [--click-noise-db -55]
//   node scripts/measure-av-sync.mjs <recording.mp4> --json
//
// To generate the reference fixture to play while recording (or to self-test):
//   node scripts/measure-av-sync.mjs --make-fixture out.mp4 [--seconds 10] [--audio-delay-ms 0]
//
// Exits non-zero when the median A/V offset hard-fails (>150ms), or when
// `--require-target` is set and the median misses the 100ms target.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
  DEFAULT_AV_SYNC_GATES,
  buildAvSyncRecommendationReport,
  flashClickFixtureArgs,
  measureAvSync
} from './lib/av-sync.mjs'

async function main() {
  let argv = process.argv.slice(2)
  if (argv[0] === '--') argv = argv.slice(1)
  const ffmpegPath = process.env.VIDEORC_SMOKE_FFMPEG_PATH ?? 'ffmpeg'

  if (argv[0] === '--make-fixture') {
    const out = argv[1]
    if (!out) {
      console.error('Usage: --make-fixture <out.mp4> [--seconds N] [--audio-delay-ms N]')
      process.exit(2)
    }
    const seconds = numFlag(argv, '--seconds') ?? 10
    const audioDelayMs = numFlag(argv, '--audio-delay-ms') ?? 0
    await runFfmpeg(ffmpegPath, flashClickFixtureArgs(out, { seconds, audioDelayMs }))
    console.log(`Wrote flash+click fixture: ${out} (${seconds}s, audio delay ${audioDelayMs}ms)`)
    return 0
  }

  const input = argv[0]
  if (!input) {
    console.error('Usage: node scripts/measure-av-sync.mjs <recording.mp4|run.evidence.json>')
    process.exit(2)
  }
  const json = argv.includes('--json')
  const file = recordingFileFromInput(input, { quiet: json })

  const requireTarget = argv.includes('--require-target')
  const currentMicrophoneSyncOffsetMs = numFlag(argv, '--current-offset-ms') ?? 0
  const clickNoiseDb = numFlag(argv, '--click-noise-db')
  const targetMs = 100
  const gates = { ...DEFAULT_AV_SYNC_GATES, requireTarget, targetMs }
  if (Number.isFinite(clickNoiseDb)) gates.clickNoiseDb = clickNoiseDb
  const result = await measureAvSync(file, {
    ffmpegPath,
    currentMicrophoneSyncOffsetMs,
    gates
  })
  if (json) {
    console.log(JSON.stringify(buildAvSyncRecommendationReport(result, gates), null, 2))
    return result.pass ? 0 : 1
  }
  console.log(
    `A/V sync: ${result.medianOffsetMs == null ? 'n/a' : `${result.medianOffsetMs.toFixed(0)}ms median`} (positive = audio lags video)`
  )
  console.log(
    `  flashes ${result.flashCount}, clicks ${result.clickCount}, pairs ${result.pairs.length}, max |offset| ${result.maxAbsOffsetMs == null ? 'n/a' : `${result.maxAbsOffsetMs.toFixed(0)}ms`}`
  )
  if (result.recommendedMicrophoneSyncOffsetMs != null) {
    const withinTarget = Math.abs(result.medianOffsetMs) <= targetMs
    const label = withinTarget ? 'current within target; zero-error estimate' : 'suggested'
    console.log(
      `  microphoneSyncOffsetMs: current ${result.currentMicrophoneSyncOffsetMs}ms -> ${label} ${result.recommendedMicrophoneSyncOffsetMs}ms`
    )
  }
  for (const f of result.failures) console.log(`  ❌ ${f}`)
  for (const w of result.warnings) console.log(`  ⚠️  ${w}`)
  console.log(result.pass ? 'PASS' : 'FAIL')
  return result.pass ? 0 : 1
}

function recordingFileFromInput(input, { quiet = false } = {}) {
  if (!input.endsWith('.json')) return input
  const manifest = JSON.parse(readFileSync(input, 'utf8'))
  const recording = manifest?.paths?.recording ?? manifest?.diagnostics?.finalFile?.path
  if (typeof recording !== 'string' || recording.trim() === '') {
    throw new Error(`Evidence manifest does not include a recording path: ${input}`)
  }
  if (!quiet) {
    console.log(`Using recording from evidence manifest: ${recording}`)
  }
  return recording
}

function numFlag(argv, name) {
  const i = argv.indexOf(name)
  return i !== -1 && argv[i + 1] != null ? Number(argv[i + 1]) : undefined
}

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(ffmpegPath, args)
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (t) => (stderr += t))
    child.on('error', rejectRun)
    child.on('close', (code) => (code === 0 ? resolveRun() : rejectRun(new Error(stderr.trim()))))
  })
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`measure-av-sync failed: ${error.message}`)
    process.exit(2)
  })
