import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  evaluateRealSourceEvidence,
  evaluateScreenRecordingEvidence,
} from './real-source-evidence-gates.mjs'

const dimensions = (width, height) => ({
  latest: { width, height },
  max: { width, height },
})

const healthyManifest = () => ({
  request: {
    width: 3840,
    height: 2160,
    fps: 30,
    bitrateKbps: 30_000,
    recordingMs: 60_000,
    require4kMediaEvidence: true,
    screenMotionStimulus: true,
    screenMotionStimulusVisible: true,
    screenMotionStimulusVisibility: {
      visibility: {
        visible: true,
        reason: 'stimulus color signature present',
      },
    },
  },
  result: {
    blockedBeforeEncoding: false,
    acceptancePass: true,
    finalFilePass: true,
    startupPass: true,
    mediaQualityMode: '4k-accepted',
  },
  paths: {
    recording: '/tmp/videorc-session.mp4',
    baselineReport: '/tmp/videorc-session.baseline.md',
    evidenceManifest: '/tmp/videorc-session.evidence.json',
    qualityJson: '/tmp/videorc-session.quality.json',
    qualityReport: '/tmp/videorc-session.quality.md',
    startupJson: '/tmp/videorc-session.startup.json',
    startupReport: '/tmp/videorc-session.startup.md',
  },
  sources: {
    screen: { id: 'screen:screencapturekit:1', name: 'Built-in Display' },
    camera: { id: 'camera:native:1', name: 'FaceTime HD Camera' },
    microphone: { id: 'mic:coreaudio:1', name: 'MacBook Microphone' },
  },
  diagnostics: {
    previewTransportRequested: 'native-surface',
    previewTransportsObserved: ['native-surface'],
    previewSurfaceBacking: 'cametal-layer',
    previewSurfaceBackingsObserved: ['cametal-layer'],
    imagePollDuringSession: { total: 0 },
    previewSourcePixelsPresent: true,
    previewFramePollingSuppressed: true,
    previewPendingHostCommandCount: 0,
    previewInputToPresentLatencyP95Ms: 42,
    previewInputToPresentLatencyP99Ms: 87,
    compositorBackend: 'metal',
    compositorCpuFallbackFrames: 0,
    mediaDimensions: {
      requestedOutput: { width: 3840, height: 2160, fps: 30 },
      screenSource: dimensions(3840, 2160),
      compositorScreenSource: dimensions(3840, 2160),
      compositorTarget: dimensions(3840, 2160),
      compositorMetalTarget: dimensions(3840, 2160),
    },
    encoderBridgeRawVideoCopiedFrames: 0,
    encoderBridgeMetalTargetCopiedFrames: 0,
    encoderBridgeMetalTargetFrames: 1800,
    encoderBridgeMetalTargetHandleFrames: 1800,
    encoderBridgeZeroCopyFrames: 1800,
    encoderBridgeVideoToolboxOutputFrames: 1800,
    encoderBridgeVideoToolboxOutputBytes: 8_500_000,
    encoderBridgeVideoToolboxProbeErrors: 0,
    encoderBridgeRepeatedFrames: 0,
    encoderBridgeMaxRepeatedFrameRun: 1,
    encoderBridgeSyntheticFrames: 0,
    micDroppedFrames: 0,
    minMicCaptureCoverage: 1,
    minEncoderSpeed: 1.02,
    finalFile: {
      width: 3840,
      height: 2160,
      durationSeconds: 60.1,
      observedFrames: 1803,
      observedFps: 30,
      maxRepeatedFrameRun: 1,
      longestFreezeMs: 0,
      avSkewMs: 20,
    },
    startup: {
      metadataWidth: 3840,
      metadataHeight: 2160,
      expectedWidth: 3840,
      expectedHeight: 2160,
      startupFrameCount: 60,
      dimensionMismatchCount: 0,
      previewSizedFrameCount: 0,
      maxRepeatedFrameRun: 1,
    },
  },
})

describe('evaluateRealSourceEvidence', () => {
  it('passes a complete 4K30 real-source evidence manifest', () => {
    const verdict = evaluateRealSourceEvidence(healthyManifest(), {
      checkFiles: false,
      requireMotion: true,
    })

    assert.deepEqual(verdict, { pass: true, failures: [] })
  })

  it('fails blocked runs', () => {
    const manifest = healthyManifest()
    manifest.result.blockedBeforeEncoding = true
    manifest.result.acceptancePass = false

    const verdict = evaluateRealSourceEvidence(manifest, { checkFiles: false })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join(' '), /blocked before encoding/)
    assert.match(verdict.failures.join(' '), /acceptance gate did not pass/)
  })

  it('fails raw-YUV copied frames', () => {
    const manifest = healthyManifest()
    manifest.diagnostics.encoderBridgeRawVideoCopiedFrames = 1

    const verdict = evaluateRealSourceEvidence(manifest, { checkFiles: false })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join(' '), /raw-YUV copied/)
  })

  it('fails when the manifest is too short for the requested endurance gate', () => {
    const verdict = evaluateRealSourceEvidence(healthyManifest(), {
      checkFiles: false,
      minRecordingMs: 600_000,
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join(' '), /recordingMs 60000 below 600000/)
  })

  it('fails missing real sources and missing path files when file checks are enabled', () => {
    const manifest = healthyManifest()
    manifest.sources.camera = null

    const verdict = evaluateRealSourceEvidence(manifest, {
      checkFiles: true,
      exists: () => false,
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join(' '), /camera source missing/)
    assert.match(verdict.failures.join(' '), /file does not exist/)
  })
})

describe('evaluateScreenRecordingEvidence', () => {
  it('passes real ScreenCaptureKit screen recordings without requiring OBS-preview acceptance', () => {
    const manifest = healthyManifest()
    manifest.request.width = 1920
    manifest.request.height = 1080
    manifest.request.bitrateKbps = 6000
    manifest.request.recordingMs = 8000
    manifest.request.require4kMediaEvidence = false
    manifest.result.acceptancePass = false
    manifest.result.finalFilePass = true
    manifest.result.mediaQualityMode = 'zero-copy-recording'
    manifest.sources.screen = { id: 'screen:screencapturekit:1', name: 'Display 1' }
    manifest.sources.camera = null
    manifest.sources.microphone = null
    manifest.diagnostics.previewTransportsObserved = ['electron-proof-surface']
    manifest.diagnostics.previewSurfaceBacking = 'electron-browser-window'
    manifest.diagnostics.previewSurfaceBackingsObserved = ['electron-browser-window']
    manifest.diagnostics.previewSourcePixelsPresent = false
    manifest.diagnostics.previewFramePollingSuppressed = false
    manifest.diagnostics.mediaDimensions.requestedOutput = { width: 1920, height: 1080, fps: 30 }
    manifest.diagnostics.finalFile = {
      width: 1920,
      height: 1080,
      durationSeconds: 8.3,
      observedFrames: 249,
      observedFps: 30,
      longestFreezeMs: 0,
    }
    manifest.diagnostics.startup = {
      metadataWidth: 1920,
      metadataHeight: 1080,
      expectedWidth: 1920,
      expectedHeight: 1080,
      startupFrameCount: 60,
      dimensionMismatchCount: 0,
      previewSizedFrameCount: 0,
    }

    const verdict = evaluateScreenRecordingEvidence(manifest, {
      checkFiles: false,
      requireMotion: true,
    })

    assert.deepEqual(verdict, { pass: true, failures: [] })
  })

  it('fails motion-required screen recordings when final-file motion analysis fails', () => {
    const manifest = healthyManifest()
    manifest.request.width = 1920
    manifest.request.height = 1080
    manifest.request.recordingMs = 8000
    manifest.result.finalFilePass = false
    manifest.result.mediaQualityMode = 'zero-copy-recording'
    manifest.sources.screen = { id: 'screen:screencapturekit:1', name: 'Display 1' }
    manifest.sources.camera = null
    manifest.sources.microphone = null
    manifest.diagnostics.finalFile.width = 1920
    manifest.diagnostics.finalFile.height = 1080
    manifest.diagnostics.finalFile.durationSeconds = 8.3
    manifest.diagnostics.finalFile.longestFreezeMs = 867
    manifest.diagnostics.startup.metadataWidth = 1920
    manifest.diagnostics.startup.metadataHeight = 1080

    const verdict = evaluateScreenRecordingEvidence(manifest, {
      checkFiles: false,
      requireMotion: true,
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join(' '), /final-file analyzer did not pass/)
    assert.match(verdict.failures.join(' '), /longest freeze 867ms above 100ms/)
  })

  it('fails motion-required screen recordings when stimulus visibility was not proven', () => {
    const manifest = healthyManifest()
    manifest.request.width = 1920
    manifest.request.height = 1080
    manifest.request.recordingMs = 8000
    manifest.request.screenMotionStimulusVisible = false
    manifest.result.mediaQualityMode = 'zero-copy-recording'
    manifest.sources.screen = { id: 'screen:screencapturekit:1', name: 'Display 1' }
    manifest.sources.camera = null
    manifest.sources.microphone = null
    manifest.diagnostics.finalFile.width = 1920
    manifest.diagnostics.finalFile.height = 1080
    manifest.diagnostics.finalFile.durationSeconds = 8.3
    manifest.diagnostics.startup.metadataWidth = 1920
    manifest.diagnostics.startup.metadataHeight = 1080

    const verdict = evaluateScreenRecordingEvidence(manifest, {
      checkFiles: false,
      requireMotion: true,
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join(' '), /stimulus visibility was not proven/)
  })

  it('fails when screen recording blocked before encoding', () => {
    const manifest = healthyManifest()
    manifest.result.blockedBeforeEncoding = true
    manifest.sources.screen = { id: 'screen:screencapturekit:1', name: 'Display 1' }

    const verdict = evaluateScreenRecordingEvidence(manifest, { checkFiles: false })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join(' '), /blocked before encoding/)
  })

  it('fails legacy AVFoundation screen sources', () => {
    const manifest = healthyManifest()
    manifest.result.mediaQualityMode = 'zero-copy-recording'
    manifest.sources.screen = { id: 'screen:avfoundation:7', name: 'Capture screen 1' }

    const verdict = evaluateScreenRecordingEvidence(manifest, { checkFiles: false })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join(' '), /native ScreenCaptureKit screen source/)
  })
})
