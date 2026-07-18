#!/usr/bin/env node

import { createVideoUnderstandingProbe } from './lib/video-understanding-probe.mjs'

function parseArgs(argv) {
  const args = {}
  const positionals = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = () => argv[(index += 1)]
    switch (arg) {
      case '--ffmpeg':
        args.ffmpegPath = next()
        break
      case '--ffprobe':
        args.ffprobePath = next()
        break
      case '--json':
        args.json = true
        break
      case '--model-json':
        args.modelJsonPath = next()
        break
      case '--out-dir':
        args.outDir = next()
        break
      case '--sample-frames':
        args.sampleFrames = Number(next())
        break
      case '--scene-frames':
        args.sceneFrames = Number(next())
        break
      case '--scene-threshold':
        args.sceneThreshold = Number(next())
        break
      case '--transcript':
        args.transcriptPath = next()
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
  args.recordingPath = positionals[0]
  return args
}

const HELP = `Create a local-only video-understanding probe report.

Usage:
  node scripts/video-understanding-probe.mjs <recording> [options]

Options:
  --out-dir <dir>          Output directory. Defaults to /tmp/videorc-video-understanding-*.
  --transcript <path>      Optional transcript text to compare against visual evidence.
  --model-json <path>      Optional strict video-aware JSON produced by a model/manual pass.
  --sample-frames <n>      Number of evenly-spaced still frames to extract. Default: 8.
  --scene-frames <n>       Max scene-change frames to extract. Default: 12.
  --scene-threshold <n>    FFmpeg scene threshold. Default: 0.35.
  --ffmpeg <path>          ffmpeg binary. Default: ffmpeg.
  --ffprobe <path>         ffprobe binary. Default: ffprobe.
  --json                   Print probe report JSON instead of the markdown report.

The script writes frame evidence, a contact sheet, model-input.json, model-prompt.md,
video-understanding-probe.json, and video-understanding-probe.md. Keep outputs in
/tmp or another ignored local directory; do not commit recording-derived artifacts.`

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.recordingPath) {
    console.log(HELP)
    process.exit(args.recordingPath ? 0 : 2)
  }

  const result = await createVideoUnderstandingProbe(args.recordingPath, args)
  if (args.json) {
    console.log(JSON.stringify(result.report, null, 2))
  } else {
    console.log(`Video understanding probe written to ${result.report.outputDir}`)
    console.log('')
    console.log(`Report: ${result.paths.reportMarkdownPath}`)
    console.log(`JSON: ${result.paths.reportJsonPath}`)
    console.log(`Model input: ${result.paths.modelInputPath}`)
    console.log(`Model prompt: ${result.paths.modelPromptPath}`)
    console.log('')
    console.log('Next step: inspect the contact sheet and sampled frames, then fill --model-json.')
  }
}

main().catch((error) => {
  console.error(`video-understanding-probe failed: ${error.message}`)
  process.exit(2)
})
