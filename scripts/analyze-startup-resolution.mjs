#!/usr/bin/env node
// CLI for the first-2-seconds startup-resolution analyzer.
//
//   node scripts/analyze-startup-resolution.mjs <file> --width 1920 --height 1080 --fps 30

import {
  analyzeStartupResolution,
  renderStartupMarkdownReport,
  writeStartupReports,
} from './lib/startup-resolution-analyzer.mjs'

function parseArgs(argv) {
  const args = { gates: {}, thumbnails: true }
  const positionals = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => argv[(i += 1)]
    switch (arg) {
      case '--width':
        args.expectedWidth = Number(next())
        break
      case '--height':
        args.expectedHeight = Number(next())
        break
      case '--fps':
        args.intendedFps = Number(next())
        break
      case '--seconds':
        args.seconds = Number(next())
        break
      case '--frames':
        args.frameLimit = Number(next())
        break
      case '--preview-width':
        args.previewWidth = Number(next())
        break
      case '--preview-height':
        args.previewHeight = Number(next())
        break
      case '--max-repeat-run':
        args.gates.maxRepeatedFrameRun = Number(next())
        break
      case '--out-dir':
        args.outDir = next()
        break
      case '--no-report':
        args.noReport = true
        break
      case '--no-thumbnails':
        args.thumbnails = false
        break
      case '--json':
        args.json = true
        break
      case '--ffmpeg':
        args.ffmpegPath = next()
        break
      case '--ffprobe':
        args.ffprobePath = next()
        break
      case '-h':
      case '--help':
        args.help = true
        break
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`)
        }
        positionals.push(arg)
    }
  }
  args.file = positionals[0]
  return args
}

const HELP = `Analyze the first seconds of a recording for startup resolution glitches.

Usage: node scripts/analyze-startup-resolution.mjs <file> --width 1920 --height 1080 --fps 30

Options:
  --seconds <n>          Startup window to inspect (default 2)
  --frames <n>           Max startup frames to inspect/hash (default 60)
  --preview-width <n>    Known preview width that must not leak into output (default 640)
  --preview-height <n>   Known preview height that must not leak into output (default 360)
  --out-dir <dir>        Where to write reports (default: beside the recording)
  --no-report            Print only; do not write report files
  --no-thumbnails        Skip startup thumbnail contact sheet
  --json                 Print JSON report
  --ffmpeg <path>        ffmpeg binary (or VIDEORC_SMOKE_FFMPEG_PATH)
  --ffprobe <path>       ffprobe binary (or VIDEORC_SMOKE_FFPROBE_PATH)

Exits 0 when the startup window passes every hard gate, 1 when it fails one.`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.file) {
    console.log(HELP)
    process.exit(args.file ? 0 : 2)
  }

  const ffmpegPath = args.ffmpegPath ?? process.env.VIDEORC_SMOKE_FFMPEG_PATH ?? 'ffmpeg'
  const ffprobePath = args.ffprobePath ?? process.env.VIDEORC_SMOKE_FFPROBE_PATH ?? 'ffprobe'
  const gates = Object.keys(args.gates).length > 0 ? args.gates : undefined

  const report = await analyzeStartupResolution(args.file, {
    ffmpegPath,
    ffprobePath,
    expectedWidth: Number.isFinite(args.expectedWidth) ? args.expectedWidth : undefined,
    expectedHeight: Number.isFinite(args.expectedHeight) ? args.expectedHeight : undefined,
    intendedFps: Number.isFinite(args.intendedFps) ? args.intendedFps : undefined,
    seconds: Number.isFinite(args.seconds) ? args.seconds : undefined,
    frameLimit: Number.isFinite(args.frameLimit) ? args.frameLimit : undefined,
    previewWidth: Number.isFinite(args.previewWidth) ? args.previewWidth : undefined,
    previewHeight: Number.isFinite(args.previewHeight) ? args.previewHeight : undefined,
    gates,
  })

  if (args.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(renderStartupMarkdownReport(report))
  }

  if (!args.noReport) {
    const { jsonPath, mdPath, thumbnailPath } = await writeStartupReports(report, {
      outDir: args.outDir,
      ffmpegPath,
      thumbnails: args.thumbnails,
    })
    if (!args.json) {
      console.log(`\nReports written:\n  ${mdPath}\n  ${jsonPath}`)
      if (thumbnailPath) console.log(`  ${thumbnailPath}`)
    }
  }

  process.exit(report.verdict.pass ? 0 : 1)
}

main().catch((error) => {
  console.error(`analyze-startup-resolution failed: ${error.message}`)
  process.exit(2)
})
