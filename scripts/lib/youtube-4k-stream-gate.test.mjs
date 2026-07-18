// Run: node --test scripts/lib/youtube-4k-stream-gate.test.mjs

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { evaluateYoutube4kStreamEvidence } from './youtube-4k-stream-gate.mjs'

describe('evaluateYoutube4kStreamEvidence', () => {
  it('passes when YouTube 4K recording and 4K stream evidence are both proved', () => {
    const verdict = evaluateYoutube4kStreamEvidence({
      manifest: goodManifest(),
      receivedStreamProbe: goodReceivedStreamProbe(),
      streamAvSyncVerdict: { pass: true, failures: [], warnings: [] }
    })

    assert.equal(verdict.pass, true, verdict.failures.join('; '))
    assert.deepEqual(verdict.failures, [])
    assert.equal(verdict.summary.streamTargetPlatform, 'youtube')
    assert.equal(verdict.summary.activeVideoToolboxOutputEncoders, 2)
  })

  it('fails when the modern stream target is not YouTube', () => {
    const manifest = goodManifest()
    manifest.request.streamTargetPlatform = 'custom'

    const verdict = evaluateYoutube4kStreamEvidence({
      manifest,
      receivedStreamProbe: goodReceivedStreamProbe()
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /stream target platform "custom" was not youtube/)
  })

  it('fails when the stream preset is not the YouTube 4K profile', () => {
    const manifest = goodManifest()
    manifest.request.streamOutputPreset = 'stream-safe-1080p30'
    manifest.request.streamBitrateKbps = 6000

    const verdict = evaluateYoutube4kStreamEvidence({
      manifest,
      receivedStreamProbe: goodReceivedStreamProbe()
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /was not stream-youtube-4k30/)
    assert.match(verdict.failures.join('; '), /stream bitrate 6000/)
  })

  it('fails when the received stream artifact is downscaled', () => {
    const verdict = evaluateYoutube4kStreamEvidence({
      manifest: goodManifest(),
      receivedStreamProbe: {
        video: { width: 1920, height: 1080, avgFps: 30, nominalFps: 30 }
      }
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /RTMP-received stream artifact width 1920/)
  })

  it('fails when true 4K stream encoder diagnostics are missing', () => {
    const manifest = goodManifest()
    manifest.diagnostics.encoderBridgeActiveVideoToolboxOutputEncoders = 1
    manifest.diagnostics.encoderBridgeSeparateOutputEncodersActive = false
    manifest.diagnostics.encoderBridgeStreamVideoToolboxOutputFrames = 0

    const verdict = evaluateYoutube4kStreamEvidence({
      manifest,
      receivedStreamProbe: goodReceivedStreamProbe()
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /active VideoToolbox output encoder count 1/)
    assert.match(verdict.failures.join('; '), /separate output encoders/)
    assert.match(verdict.failures.join('; '), /stream VideoToolbox output frames/)
  })

  it('fails when the stream A/V sync verdict fails', () => {
    const verdict = evaluateYoutube4kStreamEvidence({
      manifest: goodManifest(),
      receivedStreamProbe: goodReceivedStreamProbe(),
      streamAvSyncVerdict: {
        pass: false,
        failures: ['RTMP-received FLV A/V offset +95ms exceeds plan gate 60ms'],
        warnings: []
      }
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /stream A\/V sync gate failed/)
  })
})

function goodManifest() {
  return {
    request: {
      width: 3840,
      height: 2160,
      fps: 30,
      bitrateKbps: 30000,
      streamEnabled: true,
      streamingSettingsEnabled: true,
      streamOutputPreset: 'stream-youtube-4k30',
      streamBitrateKbps: 30000,
      streamTargetPlatform: 'youtube'
    },
    result: {
      blockedBeforeEncoding: false,
      acceptancePass: true,
      acceptanceFailures: [],
      finalFilePass: true,
      startupPass: true,
      mediaQualityMode: 'zero-copy-recording'
    },
    diagnostics: {
      finalFile: {
        width: 3840,
        height: 2160,
        observedFps: 30,
        maxRepeatedFrameRun: 1,
        longestFreezeMs: 0
      },
      recordingOutput: { width: 3840, height: 2160, fps: 30, bitrateKbps: 30000 },
      streamOutput: { width: 3840, height: 2160, fps: 30, bitrateKbps: 30000 },
      encoderBridgeActiveVideoToolboxOutputEncoders: 2,
      encoderBridgeSeparateOutputEncodersActive: true,
      encoderBridgeRecordingVideoToolboxOutputFrames: 120,
      encoderBridgeRecordingVideoToolboxOutputBytes: 20_000_000,
      encoderBridgeStreamVideoToolboxOutputFrames: 120,
      encoderBridgeStreamVideoToolboxOutputBytes: 20_000_000,
      encoderBridgeRawVideoCopiedFrames: 0,
      encoderBridgeMetalTargetCopiedFrames: 0,
      encoderBridgeZeroCopyFrames: 120
    }
  }
}

function goodReceivedStreamProbe() {
  return {
    video: {
      width: 3840,
      height: 2160,
      avgFps: 30,
      nominalFps: 30
    }
  }
}
