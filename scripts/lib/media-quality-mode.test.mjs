// Run: node --test scripts/lib/media-quality-mode.test.mjs

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classifyMediaQualityMode } from './media-quality-mode.mjs'

const zeroCopyDiagnostics = () => ({
  compositorBackend: 'metal',
  previewTransport: 'native-surface',
  previewSurfaceBacking: 'cametal-layer',
  encoderBridgeMetalTargetFrames: 120,
  encoderBridgeMetalTargetHandleFrames: 120,
  encoderBridgeRawVideoCopiedFrames: 0,
  encoderBridgeMetalTargetCopiedFrames: 0,
  encoderBridgeZeroCopyFrames: 120,
  encoderBridgeVideoToolboxOutputFrames: 120,
})

const splitOutputDiagnostics = () => ({
  ...zeroCopyDiagnostics(),
  encoderBridgeVideoToolboxOutputBytes: 1_000_000,
  encoderBridgeSeparateOutputEncodersActive: true,
  encoderBridgeActiveVideoToolboxOutputEncoders: 2,
  encoderBridgeRecordingVideoToolboxOutputFrames: 120,
  encoderBridgeRecordingVideoToolboxOutputBytes: 800_000,
  encoderBridgeStreamVideoToolboxOutputFrames: 120,
  encoderBridgeStreamVideoToolboxOutputBytes: 200_000,
  streamOutputWidth: 1920,
  streamOutputHeight: 1080,
  streamOutputFps: 30,
  streamOutputBitrateKbps: 6000,
})

describe('classifyMediaQualityMode', () => {
  it('classifies copied or unknown paths as fallback-baseline', () => {
    const result = classifyMediaQualityMode({
      diagnostics: {
        previewTransport: 'latest-jpeg-polling',
        encoderBridgeRawVideoCopiedFrames: 30,
        encoderBridgeZeroCopyFrames: 0,
      },
    })

    assert.equal(result.mode, 'fallback-baseline')
    assert.match(result.reasons.join(' '), /zero-copy recording frames not proved/)
  })

  it('classifies native preview without zero-copy output as native-preview-only', () => {
    const result = classifyMediaQualityMode({
      claimsNative: true,
      diagnostics: {
        previewTransport: 'native-surface',
        previewSurfaceBacking: 'cametal-layer',
        encoderBridgeRawVideoCopiedFrames: 30,
        encoderBridgeZeroCopyFrames: 0,
      },
    })

    assert.equal(result.mode, 'native-preview-only')
    assert.match(result.reasons.join(' '), /raw-video copied/)
  })

  it('classifies clean Metal-to-VideoToolbox recording as zero-copy-recording', () => {
    const result = classifyMediaQualityMode({
      claimsNative: true,
      diagnostics: zeroCopyDiagnostics(),
    })

    assert.equal(result.mode, 'zero-copy-recording')
  })

  it('classifies simultaneous recording and 1080p streaming with separate encoders', () => {
    const result = classifyMediaQualityMode({
      diagnostics: splitOutputDiagnostics(),
      streamEnabled: true,
      separateOutputEncoders: true,
      streamOutput: { width: 1920, height: 1080, fps: 30 },
    })

    assert.equal(result.mode, 'record-stream-split-output')
  })

  it('uses diagnostics proof fields for split-output classification', () => {
    const result = classifyMediaQualityMode({
      diagnostics: splitOutputDiagnostics(),
      streamEnabled: true,
    })

    assert.equal(result.mode, 'record-stream-split-output')
  })

  it('does not classify stream sessions as split-output without separate encoder proof', () => {
    const result = classifyMediaQualityMode({
      diagnostics: {
        ...zeroCopyDiagnostics(),
        encoderBridgeActiveVideoToolboxOutputEncoders: 2,
        encoderBridgeRecordingVideoToolboxOutputFrames: 120,
        encoderBridgeRecordingVideoToolboxOutputBytes: 800_000,
        encoderBridgeStreamVideoToolboxOutputFrames: 120,
        encoderBridgeStreamVideoToolboxOutputBytes: 200_000,
        streamOutputWidth: 1920,
        streamOutputHeight: 1080,
        streamOutputFps: 30,
      },
      streamEnabled: true,
    })

    assert.equal(result.mode, 'zero-copy-recording')
  })

  it('does not classify split-output until two active encoders are proved', () => {
    const result = classifyMediaQualityMode({
      diagnostics: {
        ...splitOutputDiagnostics(),
        encoderBridgeActiveVideoToolboxOutputEncoders: 1,
      },
      streamEnabled: true,
    })

    assert.equal(result.mode, 'zero-copy-recording')
  })

  it('does not classify split-output until both output encoders produce frames', () => {
    const result = classifyMediaQualityMode({
      diagnostics: {
        ...splitOutputDiagnostics(),
        encoderBridgeStreamVideoToolboxOutputFrames: 0,
        encoderBridgeStreamVideoToolboxOutputBytes: 0,
      },
      streamEnabled: true,
    })

    assert.equal(result.mode, 'zero-copy-recording')
  })

  it('does not classify split-output when the stream output is above 1080p', () => {
    const result = classifyMediaQualityMode({
      diagnostics: {
        ...splitOutputDiagnostics(),
        streamOutputWidth: 2560,
        streamOutputHeight: 1440,
      },
      streamEnabled: true,
    })

    assert.equal(result.mode, 'zero-copy-recording')
  })

  it('classifies accepted 4K30 evidence as 4k-accepted', () => {
    const result = classifyMediaQualityMode({
      diagnostics: zeroCopyDiagnostics(),
      claimsNative: true,
      acceptancePass: true,
      requestedOutput: { width: 3840, height: 2160, fps: 30 },
    })

    assert.equal(result.mode, '4k-accepted')
  })

  it('does not call a failing 4K run accepted', () => {
    const result = classifyMediaQualityMode({
      diagnostics: zeroCopyDiagnostics(),
      claimsNative: true,
      acceptancePass: false,
      requestedOutput: { width: 3840, height: 2160, fps: 30 },
    })

    assert.equal(result.mode, 'zero-copy-recording')
  })
})
