// Run: node --test scripts/lib/mixed-youtube-4k-twitch-1080p-gate.test.mjs

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { evaluateMixedYoutube4kTwitch1080pEvidence } from './mixed-youtube-4k-twitch-1080p-gate.mjs'

describe('evaluateMixedYoutube4kTwitch1080pEvidence', () => {
  it('passes when YouTube receives 4K and Twitch receives 1080p', () => {
    const verdict = evaluateMixedYoutube4kTwitch1080pEvidence({
      manifest: goodManifest(),
      youtubeStreamProbe: received4k(),
      twitchStreamProbe: received1080p(),
      youtubeAvSyncVerdict: passingSync(),
      twitchAvSyncVerdict: passingSync(),
    })

    assert.equal(verdict.pass, true, verdict.failures.join('; '))
    assert.deepEqual(verdict.failures, [])
    assert.equal(verdict.summary.youtubeReceived.width, 3840)
    assert.equal(verdict.summary.twitchReceived.width, 1920)
  })

  it('fails when Twitch receives the 4K stream', () => {
    const verdict = evaluateMixedYoutube4kTwitch1080pEvidence({
      manifest: goodManifest(),
      youtubeStreamProbe: received4k(),
      twitchStreamProbe: received4k(),
      youtubeAvSyncVerdict: passingSync(),
      twitchAvSyncVerdict: passingSync(),
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /Twitch RTMP-received stream artifact width 3840/)
  })

  it('fails when the companion target is not Twitch', () => {
    const manifest = goodManifest()
    manifest.request.streamCompanionPlatform = 'custom'

    const verdict = evaluateMixedYoutube4kTwitch1080pEvidence({
      manifest,
      youtubeStreamProbe: received4k(),
      twitchStreamProbe: received1080p(),
      youtubeAvSyncVerdict: passingSync(),
      twitchAvSyncVerdict: passingSync(),
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /companion stream target platform "custom"/)
  })

  it('fails when the companion stream A/V sync verdict fails', () => {
    const verdict = evaluateMixedYoutube4kTwitch1080pEvidence({
      manifest: goodManifest(),
      youtubeStreamProbe: received4k(),
      twitchStreamProbe: received1080p(),
      youtubeAvSyncVerdict: passingSync(),
      twitchAvSyncVerdict: {
        pass: false,
        failures: ['RTMP-received FLV A/V offset +95ms exceeds plan gate 60ms'],
        warnings: [],
      },
    })

    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /Twitch stream A\/V sync gate failed/)
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
      streamTargetPlatform: 'youtube',
      streamCompanionEnabled: true,
      streamCompanionPlatform: 'twitch',
    },
    result: {
      blockedBeforeEncoding: false,
      acceptanceFailures: [],
      finalFilePass: true,
      startupPass: true,
      mediaQualityMode: 'record-stream-split-output',
    },
    diagnostics: {
      finalFile: { width: 3840, height: 2160 },
      recordingOutput: { width: 3840, height: 2160, fps: 30, bitrateKbps: 30000 },
      streamOutput: { width: 1920, height: 1080, fps: 30, bitrateKbps: 6000 },
      encoderBridgeActiveVideoToolboxOutputEncoders: 2,
      encoderBridgeSeparateOutputEncodersActive: true,
      encoderBridgeRecordingVideoToolboxOutputFrames: 120,
      encoderBridgeStreamVideoToolboxOutputFrames: 120,
      encoderBridgeRawVideoCopiedFrames: 0,
      encoderBridgeMetalTargetCopiedFrames: 0,
      encoderBridgeZeroCopyFrames: 120,
    },
  }
}

function received4k() {
  return { video: { width: 3840, height: 2160, avgFps: 30, nominalFps: 30 } }
}

function received1080p() {
  return { video: { width: 1920, height: 1080, avgFps: 30, nominalFps: 30 } }
}

function passingSync() {
  return { pass: true, failures: [], warnings: [] }
}
