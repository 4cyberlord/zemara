import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildTranscriptOnlyBaseline,
  compareVideoAwareToTranscriptOnly,
  decideVideoArtifactValue,
  parseShowinfoTimestamps,
  renderVideoUnderstandingReport,
  selectFrameTimestamps,
  timestampLabel,
  validateVideoUnderstandingOutput
} from './video-understanding-probe.mjs'

function validOutput(overrides = {}) {
  return {
    confidence: 0.72,
    missingSignals: [],
    sceneMap: [{ timestamp: '00:00:01.000', visualContext: 'Editor window visible' }],
    thumbnailCandidates: [{ timestamp: '00:00:02.000', reason: 'Readable UI' }],
    visualEditSuggestions: [{ timestamp: '00:00:03.000', suggestion: 'Zoom into terminal' }],
    visualHighlights: [{ timestamp: '00:00:04.000', title: 'Bug appears' }],
    visualQualityNotes: [{ timestamp: '00:00:05.000', issue: 'Small text', severity: 'warning' }],
    ...overrides
  }
}

describe('timestampLabel', () => {
  it('formats seconds as stable video timestamps', () => {
    assert.equal(timestampLabel(0), '00:00:00.000')
    assert.equal(timestampLabel(65.4321), '00:01:05.432')
    assert.equal(timestampLabel(3661.9), '01:01:01.900')
  })
})

describe('selectFrameTimestamps', () => {
  it('selects bounded evenly-spaced timestamps inside the recording', () => {
    assert.deepEqual(selectFrameTimestamps(10, 4), [2, 4, 6, 8])
  })

  it('returns no timestamps for invalid durations', () => {
    assert.deepEqual(selectFrameTimestamps(0, 4), [])
    assert.deepEqual(selectFrameTimestamps(Number.NaN, 4), [])
  })
})

describe('parseShowinfoTimestamps', () => {
  it('extracts scene timestamps from ffmpeg showinfo stderr', () => {
    const stderr = [
      '[Parsed_showinfo_1 @ 0x1] n: 0 pts: 15360 pts_time:1.0 pos: 1',
      '[Parsed_showinfo_1 @ 0x1] n: 1 pts: 30720 pts_time:2.5 pos: 2'
    ].join('\n')

    assert.deepEqual(parseShowinfoTimestamps(stderr), [1, 2.5])
  })
})

describe('validateVideoUnderstandingOutput', () => {
  it('accepts the strict video-aware output shape', () => {
    assert.deepEqual(validateVideoUnderstandingOutput(validOutput()), { ok: true, failures: [] })
  })

  it('rejects missing arrays and invalid confidence', () => {
    const result = validateVideoUnderstandingOutput({ sceneMap: [], confidence: 3 })

    assert.equal(result.ok, false)
    assert.match(result.failures.join('\n'), /visualHighlights must be an array/)
    assert.match(result.failures.join('\n'), /confidence must be from 0 to 1/)
  })
})

describe('video-aware comparison', () => {
  it('surfaces transcript-only missing signals', () => {
    const transcriptOnly = buildTranscriptOnlyBaseline('Hello world')

    assert.equal(transcriptOnly.hasTranscript, true)
    assert.ok(transcriptOnly.missingSignals.includes('thumbnail frame strength'))
  })

  it('marks valid visual output as added video-aware value', () => {
    const transcriptOnly = buildTranscriptOnlyBaseline('We debug the app.')
    const comparison = compareVideoAwareToTranscriptOnly(validOutput(), transcriptOnly)
    const decision = decideVideoArtifactValue(comparison, validOutput())

    assert.equal(comparison.status, 'video-aware-signals-found')
    assert.equal(comparison.visualSignalCount, 5)
    assert.equal(decision.status, 'candidate-for-more-samples')
  })

  it('keeps the probe internal when no valid model output is supplied', () => {
    const transcriptOnly = buildTranscriptOnlyBaseline('')
    const comparison = compareVideoAwareToTranscriptOnly(null, transcriptOnly)
    const decision = decideVideoArtifactValue(comparison, null)

    assert.equal(comparison.status, 'missing-video-aware-output')
    assert.equal(decision.status, 'needs-video-aware-pass')
  })
})

describe('renderVideoUnderstandingReport', () => {
  it('renders the local-only report sections', () => {
    const report = {
      comparison: {
        status: 'video-aware-signals-found',
        validationFailures: [],
        valueSummary: 'Video-aware pass returned signals.',
        visualSignalCount: 1
      },
      createdAtIso: '2026-07-01T00:00:00.000Z',
      decision: {
        recommendation: 'Test more recordings.',
        status: 'candidate-for-more-samples'
      },
      outputDir: '/tmp/probe',
      quality: {
        metrics: {
          codec: 'h264',
          durationSeconds: 3,
          hasAudio: true,
          height: 1080,
          observedFps: 30,
          width: 1920
        },
        verdict: { failures: [], pass: true, warnings: [] }
      },
      recording: { basename: 'sample.mp4' },
      transcriptOnly: {
        hasTranscript: true,
        missingSignals: ['screen contents'],
        wordEstimate: 25
      },
      videoAwareOutput: validOutput({ confidence: 0.8 }),
      visualEvidence: {
        contactSheetPath: '/tmp/probe/contact-sheet.jpg',
        sampleFrames: [{ path: '/tmp/probe/sample.jpg' }],
        sceneFrames: []
      }
    }

    const markdown = renderVideoUnderstandingReport(report)

    assert.match(markdown, /# Video Understanding Probe Report/)
    assert.match(markdown, /Transcript-Only Baseline/)
    assert.match(markdown, /Video-Aware Comparison/)
    assert.match(markdown, /Do not commit recordings/)
  })
})
