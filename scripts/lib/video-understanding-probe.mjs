import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import { analyzeRecording } from './recording-analyzer.mjs'

export const VIDEO_UNDERSTANDING_OUTPUT_KEYS = Object.freeze([
  'sceneMap',
  'visualHighlights',
  'thumbnailCandidates',
  'visualEditSuggestions',
  'visualQualityNotes',
  'confidence',
  'missingSignals'
])

const DEFAULT_SAMPLE_FRAMES = 8
const DEFAULT_SCENE_FRAMES = 12
const DEFAULT_SCENE_THRESHOLD = 0.35
const MODEL_PROMPT_TRANSCRIPT_LIMIT = 12000

export function timestampLabel(seconds) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const totalMs = Math.round(safeSeconds * 1000)
  const ms = totalMs % 1000
  const totalSeconds = Math.floor(totalMs / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export function selectFrameTimestamps(durationSeconds, maxFrames = DEFAULT_SAMPLE_FRAMES) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || maxFrames <= 0) {
    return []
  }
  const count = Math.max(1, Math.floor(maxFrames))
  const step = durationSeconds / (count + 1)
  return Array.from({ length: count }, (_, index) => Number((step * (index + 1)).toFixed(3)))
}

export function parseShowinfoTimestamps(stderr) {
  const timestamps = []
  const pattern = /pts_time:([0-9.]+)/g
  let match = pattern.exec(stderr)
  while (match) {
    const value = Number.parseFloat(match[1])
    if (Number.isFinite(value)) {
      timestamps.push(value)
    }
    match = pattern.exec(stderr)
  }
  return timestamps
}

export function validateVideoUnderstandingOutput(value) {
  const failures = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, failures: ['output must be a JSON object'] }
  }

  for (const key of [
    'sceneMap',
    'visualHighlights',
    'thumbnailCandidates',
    'visualEditSuggestions',
    'visualQualityNotes',
    'missingSignals'
  ]) {
    if (!Array.isArray(value[key])) {
      failures.push(`${key} must be an array`)
    }
  }

  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)) {
    failures.push('confidence must be a finite number from 0 to 1')
  } else if (value.confidence < 0 || value.confidence > 1) {
    failures.push('confidence must be from 0 to 1')
  }

  for (const [key, items] of Object.entries(value)) {
    if (
      [
        'sceneMap',
        'visualHighlights',
        'thumbnailCandidates',
        'visualEditSuggestions',
        'visualQualityNotes'
      ].includes(key) &&
      Array.isArray(items)
    ) {
      items.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          failures.push(`${key}[${index}] must be an object`)
        }
      })
    }
  }

  return { ok: failures.length === 0, failures }
}

export function transcriptStats(text) {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) {
    return {
      characterCount: 0,
      lineCount: 0,
      wordEstimate: 0,
      hasTranscript: false
    }
  }
  return {
    characterCount: trimmed.length,
    lineCount: trimmed.split(/\r?\n/).filter(Boolean).length,
    wordEstimate: trimmed.split(/\s+/).filter(Boolean).length,
    hasTranscript: true
  }
}

export function buildTranscriptOnlyBaseline(transcriptText) {
  const stats = transcriptStats(transcriptText)
  return {
    ...stats,
    availableSignals: stats.hasTranscript
      ? ['spoken words', 'rough topic flow', 'audio-only timing if timestamps are present']
      : [],
    missingSignals: [
      'screen contents',
      'camera framing',
      'thumbnail frame strength',
      'visual scene changes',
      'black or unreadable frames',
      'visual edit opportunities'
    ]
  }
}

export function compareVideoAwareToTranscriptOnly(output, transcriptOnly) {
  const validation = validateVideoUnderstandingOutput(output)
  if (!validation.ok) {
    return {
      status: 'missing-video-aware-output',
      visualSignalCount: 0,
      transcriptOnlyMissingSignals: transcriptOnly.missingSignals,
      valueSummary:
        'No valid video-aware JSON was supplied, so the probe can only prepare evidence.',
      validationFailures: validation.failures
    }
  }

  const visualSignalCount =
    output.sceneMap.length +
    output.visualHighlights.length +
    output.thumbnailCandidates.length +
    output.visualEditSuggestions.length +
    output.visualQualityNotes.length

  return {
    status: visualSignalCount > 0 ? 'video-aware-signals-found' : 'no-added-visual-value',
    visualSignalCount,
    transcriptOnlyMissingSignals: transcriptOnly.missingSignals,
    valueSummary:
      visualSignalCount > 0
        ? `Video-aware pass returned ${visualSignalCount} visual signal(s) that transcript-only AI cannot directly see.`
        : 'Video-aware pass did not add visual signals beyond the transcript.',
    validationFailures: []
  }
}

export function decideVideoArtifactValue(comparison, output) {
  if (comparison.status === 'missing-video-aware-output') {
    return {
      status: 'needs-video-aware-pass',
      recommendation:
        'Run a bounded multimodal or Codex/manual pass over the contact sheet, sampled frames, and transcript before productizing visual artifacts.'
    }
  }
  if (comparison.status === 'no-added-visual-value') {
    return {
      status: 'do-not-ship-yet',
      recommendation:
        'Keep this internal; visual output is not adding enough beyond transcript-only AI for this sample.'
    }
  }
  const confidence = typeof output?.confidence === 'number' ? output.confidence : 0
  return {
    status: confidence >= 0.6 ? 'candidate-for-more-samples' : 'needs-more-evidence',
    recommendation:
      confidence >= 0.6
        ? 'Test at least three representative recordings before adding user-facing visual artifact UI.'
        : 'The visual pass found signals, but confidence is low; collect more samples before shipping.'
  }
}

export function summarizeQualityReport(qualityReport) {
  const metrics = qualityReport.metrics ?? {}
  return {
    verdict: qualityReport.verdict ?? { pass: false, failures: [], warnings: [] },
    metrics: {
      avSkewMs: metrics.avSkewMs ?? null,
      codec: metrics.codec ?? null,
      durationSeconds: metrics.durationSeconds ?? null,
      fileBytes: metrics.fileBytes ?? null,
      hasAudio: Boolean(metrics.hasAudio),
      hasVideo: Boolean(metrics.hasVideo),
      height: metrics.height ?? null,
      longestFreezeMs: metrics.longestFreezeMs ?? null,
      longestSilenceMs: metrics.longestSilenceMs ?? null,
      maxFrameGapMs: metrics.maxFrameGapMs ?? null,
      maxRepeatedFrameRun: metrics.maxRepeatedFrameRun ?? null,
      observedFrames: metrics.observedFrames ?? null,
      observedFps: metrics.observedFps ?? null,
      width: metrics.width ?? null
    },
    findings: {
      audioGaps: qualityReport.findings?.audioGaps?.slice(0, 10) ?? [],
      freezes: qualityReport.findings?.freezes?.slice(0, 10) ?? [],
      repeatedBursts: qualityReport.findings?.repeatedBursts?.slice(0, 10) ?? [],
      silences: qualityReport.findings?.silences?.slice(0, 10) ?? []
    }
  }
}

export function buildModelInput({ probe, transcriptText }) {
  return {
    task: 'Inspect the transcript and visual evidence, then return strict JSON only.',
    outputKeys: VIDEO_UNDERSTANDING_OUTPUT_KEYS,
    recording: probe.recording,
    quality: probe.quality,
    visualEvidence: probe.visualEvidence,
    transcript: {
      stats: probe.transcriptOnly,
      text: transcriptText || ''
    }
  }
}

export function buildModelPrompt({ modelInput, transcriptText }) {
  const transcript =
    transcriptText.length > MODEL_PROMPT_TRANSCRIPT_LIMIT
      ? `${transcriptText.slice(0, MODEL_PROMPT_TRANSCRIPT_LIMIT)}\n\n[transcript truncated for prompt]`
      : transcriptText

  return [
    '# Videorc Video-Understanding Probe',
    '',
    'Use the contact sheet and sampled frame paths as visual evidence. Use the transcript only for spoken content and topic flow.',
    '',
    'Return strict JSON with exactly these top-level keys:',
    '',
    '```json',
    JSON.stringify(
      {
        sceneMap: [
          {
            timestamp: '00:00:00.000',
            visualContext: 'What is visible on screen or camera',
            transcriptContext: 'Relevant spoken context, if any',
            confidence: 0.0
          }
        ],
        visualHighlights: [
          {
            timestamp: '00:00:00.000',
            title: 'Visible moment title',
            reason: 'Why this is worth clipping',
            transcriptMissed: true
          }
        ],
        thumbnailCandidates: [
          {
            timestamp: '00:00:00.000',
            reason: 'Why this frame works as a thumbnail',
            visualStrength: 'Readable UI, face, contrast, or clear subject'
          }
        ],
        visualEditSuggestions: [
          {
            timestamp: '00:00:00.000',
            suggestion: 'Crop, zoom, blur, overlay, or cut suggestion',
            reason: 'Visual reason'
          }
        ],
        visualQualityNotes: [
          {
            timestamp: '00:00:00.000',
            issue: 'Black frame, frozen frame, unreadable UI, camera framing, or artifact',
            severity: 'info'
          }
        ],
        confidence: 0.0,
        missingSignals: ['What prevented stronger conclusions']
      },
      null,
      2
    ),
    '```',
    '',
    'Recording metadata:',
    '',
    '```json',
    JSON.stringify(modelInput.recording, null, 2),
    '```',
    '',
    'Quality signals:',
    '',
    '```json',
    JSON.stringify(modelInput.quality, null, 2),
    '```',
    '',
    'Visual evidence paths:',
    '',
    '```json',
    JSON.stringify(modelInput.visualEvidence, null, 2),
    '```',
    '',
    'Transcript:',
    '',
    transcript || '[no transcript supplied]',
    ''
  ].join('\n')
}

export function renderVideoUnderstandingReport(report) {
  const lines = []
  lines.push('# Video Understanding Probe Report')
  lines.push('')
  lines.push(`- Recording: \`${report.recording.basename}\``)
  lines.push(`- Created: ${report.createdAtIso}`)
  lines.push(`- Output directory: \`${report.outputDir}\``)
  lines.push(`- Decision: **${report.decision.status}**`)
  lines.push(`- Recommendation: ${report.decision.recommendation}`)
  lines.push('')
  lines.push('## Recording Metadata')
  lines.push('')
  const metrics = report.quality.metrics
  lines.push(
    `- Video: ${metrics.codec ?? 'n/a'} ${metrics.width ?? '?'}x${metrics.height ?? '?'} at ${formatNumber(metrics.observedFps)} fps`
  )
  lines.push(`- Duration: ${formatNumber(metrics.durationSeconds, 2)}s`)
  lines.push(`- Audio present: ${metrics.hasAudio ? 'yes' : 'no'}`)
  lines.push(
    `- Quality verdict: ${report.quality.verdict.pass ? 'PASS' : 'FAIL'} (${report.quality.verdict.failures.length} failure(s), ${report.quality.verdict.warnings.length} warning(s))`
  )
  lines.push('')
  lines.push('## Extracted Evidence')
  lines.push('')
  lines.push(`- Contact sheet: ${report.visualEvidence.contactSheetPath ?? 'not generated'}`)
  lines.push(`- Sampled frames: ${report.visualEvidence.sampleFrames.length}`)
  lines.push(`- Scene-change frames: ${report.visualEvidence.sceneFrames.length}`)
  lines.push('')
  lines.push('## Transcript-Only Baseline')
  lines.push('')
  lines.push(`- Transcript supplied: ${report.transcriptOnly.hasTranscript ? 'yes' : 'no'}`)
  lines.push(`- Word estimate: ${report.transcriptOnly.wordEstimate}`)
  lines.push(`- Missing visual signals: ${report.transcriptOnly.missingSignals.join(', ')}`)
  lines.push('')
  lines.push('## Video-Aware Comparison')
  lines.push('')
  lines.push(`- Status: ${report.comparison.status}`)
  lines.push(`- Visual signal count: ${report.comparison.visualSignalCount}`)
  lines.push(`- Summary: ${report.comparison.valueSummary}`)
  if (report.comparison.validationFailures.length > 0) {
    lines.push(`- Validation failures: ${report.comparison.validationFailures.join('; ')}`)
  }
  lines.push('')
  if (report.videoAwareOutput) {
    lines.push('## Video-Aware Output Summary')
    lines.push('')
    lines.push(`- Scene map items: ${report.videoAwareOutput.sceneMap.length}`)
    lines.push(`- Visual highlights: ${report.videoAwareOutput.visualHighlights.length}`)
    lines.push(`- Thumbnail candidates: ${report.videoAwareOutput.thumbnailCandidates.length}`)
    lines.push(`- Visual edit suggestions: ${report.videoAwareOutput.visualEditSuggestions.length}`)
    lines.push(`- Visual quality notes: ${report.videoAwareOutput.visualQualityNotes.length}`)
    lines.push(`- Confidence: ${formatNumber(report.videoAwareOutput.confidence, 2)}`)
    lines.push(`- Missing signals: ${report.videoAwareOutput.missingSignals.join(', ') || 'none'}`)
    lines.push('')
  }
  lines.push('## Privacy Notes')
  lines.push('')
  lines.push('- This report and its frame artifacts are local-only probe output.')
  lines.push('- Do not commit recordings, frame dumps, transcripts, or generated probe outputs.')
  lines.push(
    '- Productize visual artifacts only after comparing at least three representative recordings.'
  )
  lines.push('')
  return lines.join('\n')
}

export async function createVideoUnderstandingProbe(recordingPath, options = {}) {
  if (!recordingPath || !existsSync(recordingPath)) {
    throw new Error(`recording not found: ${recordingPath}`)
  }
  const outputDir = options.outDir ?? mkdtempSync(join(tmpdir(), 'videorc-video-understanding-'))
  mkdirSync(outputDir, { recursive: true })

  const ffmpegPath = options.ffmpegPath ?? 'ffmpeg'
  const ffprobePath = options.ffprobePath ?? 'ffprobe'
  const qualityReport = await analyzeRecording(recordingPath, {
    ffmpegPath,
    ffprobePath,
    gates: { requireMotion: false }
  })
  const quality = summarizeQualityReport(qualityReport)
  const durationSeconds = quality.metrics.durationSeconds ?? 0
  const hasVideo = quality.metrics.hasVideo
  const sampleFrameCount = options.sampleFrames ?? DEFAULT_SAMPLE_FRAMES
  const sceneFrameCount = options.sceneFrames ?? DEFAULT_SCENE_FRAMES
  const sampleTimestamps = hasVideo ? selectFrameTimestamps(durationSeconds, sampleFrameCount) : []
  const sampleFrames = hasVideo
    ? await extractSampleFrames(recordingPath, sampleTimestamps, { ffmpegPath, outputDir })
    : []
  const sceneFrames =
    hasVideo && sceneFrameCount > 0
      ? await extractSceneFrames(recordingPath, {
          ffmpegPath,
          maxFrames: sceneFrameCount,
          outputDir,
          threshold: options.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD
        })
      : []
  const contactSheetPath =
    hasVideo && sampleFrameCount > 0
      ? await createContactSheet(recordingPath, {
          durationSeconds,
          ffmpegPath,
          frameCount: sampleFrameCount,
          outputDir
        })
      : null

  const transcriptText = readOptionalText(options.transcriptPath) ?? options.transcriptText ?? ''
  const transcriptOnly = buildTranscriptOnlyBaseline(transcriptText)
  const videoAwareOutput = options.modelOutput ?? readOptionalJson(options.modelJsonPath) ?? null
  const comparison = compareVideoAwareToTranscriptOnly(videoAwareOutput, transcriptOnly)
  const decision = decideVideoArtifactValue(comparison, videoAwareOutput)
  const recording = {
    basename: basename(recordingPath),
    fileBytes: statSync(recordingPath).size,
    path: recordingPath
  }
  const visualEvidence = {
    contactSheetPath,
    sampleFrames,
    sceneFrames
  }
  const report = {
    kind: 'videorc-video-understanding-probe',
    createdAtIso: new Date().toISOString(),
    outputDir,
    recording,
    quality,
    visualEvidence,
    transcriptOnly,
    comparison,
    decision,
    videoAwareOutput
  }
  const modelInput = buildModelInput({ probe: report, transcriptText })
  const modelPrompt = buildModelPrompt({ modelInput, transcriptText })
  const paths = writeProbeFiles({ modelInput, modelPrompt, outputDir, report })
  return { modelInput, modelPrompt, paths, report }
}

async function extractSampleFrames(recordingPath, timestamps, { ffmpegPath, outputDir }) {
  const framesDir = join(outputDir, 'sample-frames')
  mkdirSync(framesDir, { recursive: true })
  const frames = []
  for (let index = 0; index < timestamps.length; index += 1) {
    const timestampSeconds = timestamps[index]
    const timestamp = timestampLabel(timestampSeconds)
    const path = join(
      framesDir,
      `${String(index + 1).padStart(2, '0')}-${timestamp.replaceAll(':', '-')}.jpg`
    )
    await run(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(timestampSeconds),
      '-i',
      recordingPath,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      path
    ])
    frames.push({ index: index + 1, path, timestamp, timestampSeconds })
  }
  return frames
}

async function extractSceneFrames(recordingPath, { ffmpegPath, maxFrames, outputDir, threshold }) {
  const sceneDir = join(outputDir, 'scene-frames')
  mkdirSync(sceneDir, { recursive: true })
  const pattern = join(sceneDir, 'scene-%03d.jpg')
  let stderr = ''
  try {
    const result = await run(ffmpegPath, [
      '-hide_banner',
      '-nostats',
      '-y',
      '-i',
      recordingPath,
      '-vf',
      `select=gt(scene\\,${threshold}),showinfo,scale=480:-2`,
      '-fps_mode',
      'vfr',
      '-frames:v',
      String(maxFrames),
      '-q:v',
      '3',
      pattern
    ])
    stderr = result.stderr
  } catch (error) {
    if (isNoSceneFrameError(error)) {
      return []
    }
    throw error
  }
  const timestamps = parseShowinfoTimestamps(stderr)
  return readdirSync(sceneDir)
    .filter((name) => name.endsWith('.jpg'))
    .sort()
    .map((name, index) => ({
      index: index + 1,
      path: join(sceneDir, name),
      timestamp: timestamps[index] == null ? null : timestampLabel(timestamps[index]),
      timestampSeconds: timestamps[index] ?? null
    }))
}

function isNoSceneFrameError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return /No filtered frames|Nothing was written into output file|Output file is empty/i.test(
    message
  )
}

async function createContactSheet(
  recordingPath,
  { durationSeconds, ffmpegPath, frameCount, outputDir }
) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || frameCount <= 0) {
    return null
  }
  const columns = Math.min(4, Math.max(1, frameCount))
  const rows = Math.max(1, Math.ceil(frameCount / columns))
  const interval = Math.max(0.1, durationSeconds / frameCount)
  const path = join(outputDir, 'contact-sheet.jpg')
  await run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    recordingPath,
    '-vf',
    `fps=1/${interval.toFixed(3)},scale=320:-2,tile=${columns}x${rows}`,
    '-frames:v',
    '1',
    '-q:v',
    '4',
    path
  ])
  return existsSync(path) ? path : null
}

function writeProbeFiles({ modelInput, modelPrompt, outputDir, report }) {
  const reportJsonPath = join(outputDir, 'video-understanding-probe.json')
  const reportMarkdownPath = join(outputDir, 'video-understanding-probe.md')
  const modelInputPath = join(outputDir, 'model-input.json')
  const modelPromptPath = join(outputDir, 'model-prompt.md')
  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2))
  writeFileSync(reportMarkdownPath, renderVideoUnderstandingReport(report))
  writeFileSync(modelInputPath, JSON.stringify(modelInput, null, 2))
  writeFileSync(modelPromptPath, modelPrompt)
  return { modelInputPath, modelPromptPath, reportJsonPath, reportMarkdownPath }
}

function readOptionalText(path) {
  return path ? readFileSync(path, 'utf8') : null
}

function readOptionalJson(path) {
  return path ? JSON.parse(readFileSync(path, 'utf8')) : null
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args)
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', rejectRun)
    child.on('close', (code) => {
      if (code === 0) {
        resolveRun({ stderr, stdout })
        return
      }
      rejectRun(
        new Error(`${command} ${args.join(' ')} failed with code ${code}: ${stderr.trim()}`)
      )
    })
  })
}

function formatNumber(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a'
}
