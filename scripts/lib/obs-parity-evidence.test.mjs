import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyObsParityEvidence } from './obs-parity-evidence.mjs'

function cleanInput() {
  return {
    analyzerVerdict: { pass: true, failures: [] },
    startupVerdict: { pass: true, failures: [] },
    claimsNative: true,
    diagnostics: {
      previewSurfaceBacking: 'cametal-layer',
      imagePollDuringSession: { total: 0 },
      compositorBackend: 'metal',
      compositorCpuFallbackFrames: 0,
      encoderBridgeMetalTargetFrames: 120,
      encoderBridgeRawVideoCopiedFrames: 0,
      encoderBridgeMetalTargetCopiedFrames: 0,
      encoderBridgeMetalTargetHandleFrames: 120,
      encoderBridgeZeroCopyFrames: 120,
      encoderBridgeRepeatedFrames: 0,
      encoderBridgeSyntheticFrames: 0,
      previewInputToPresentLatencyP95Ms: 18,
      previewInputToPresentLatencyP99Ms: 32,
      previewCompositorFrameLag: 0,
      previewFramePollingSuppressed: false,
      previewSourcePixelsPresent: true,
      previewPendingHostCommandCount: 0,
      minEncoderSpeed: 1.0,
    },
  }
}

function byArea(items, area) {
  const item = items.find((candidate) => candidate.area === area)
  assert.ok(item, `missing area ${area}`)
  return item
}

test('obs parity evidence passes metric-owned areas on a clean native run', () => {
  const items = classifyObsParityEvidence(cleanInput())

  assert.equal(byArea(items, 'First 2 seconds').status, 'pass')
  assert.equal(byArea(items, 'Preview lag while recording').status, 'pass')
  assert.equal(byArea(items, 'Recording hot path').status, 'pass')

  const quality = byArea(items, 'Preview quality vs OBS')
  assert.equal(quality.status, 'needs-manual')
  assert.match(quality.owner, /visual sampling/)
})

test('obs parity evidence assigns first seconds failures to startup/source readiness', () => {
  const input = cleanInput()
  input.startupVerdict = {
    pass: false,
    failures: ['metadata width 640 does not match expected 1920'],
  }
  input.diagnostics.encoderBridgeSyntheticFrames = 2

  const startup = byArea(classifyObsParityEvidence(input), 'First 2 seconds')

  assert.equal(startup.status, 'fail')
  assert.match(startup.owner, /startup barrier/)
  assert.match(startup.evidence.join(' '), /metadata width 640/)
  assert.match(startup.evidence.join(' '), /2 synthetic/)
})

test('obs parity evidence assigns preview problems to proof transport and image polling', () => {
  const input = cleanInput()
  input.claimsNative = false
  input.diagnostics.previewSurfaceBacking = 'electron-browser-window'
  input.diagnostics.imagePollDuringSession = { total: 240 }

  const items = classifyObsParityEvidence(input)
  const lag = byArea(items, 'Preview lag while recording')
  const quality = byArea(items, 'Preview quality vs OBS')

  assert.equal(lag.status, 'fail')
  assert.match(lag.owner, /proof preview transport/)
  assert.match(lag.owner, /image-poll fallback transport/)
  assert.equal(quality.status, 'fail')
  assert.match(quality.owner, /native Metal preview host/)
  assert.match(quality.owner, /PNG\/JPEG fallback preview/)
})

test('obs parity evidence flags proof host when source pixels are suppressed', () => {
  const input = cleanInput()
  input.claimsNative = false
  input.diagnostics.previewSurfaceBacking = 'electron-browser-window'
  input.diagnostics.previewFramePollingSuppressed = true
  input.diagnostics.previewSourcePixelsPresent = false

  const quality = byArea(classifyObsParityEvidence(input), 'Preview quality vs OBS')

  assert.equal(quality.status, 'fail')
  assert.match(quality.owner, /proof preview source suppression/)
  assert.match(quality.owner, /preview source-pixel proof/)
  assert.match(quality.evidence.join(' '), /frame polling suppressed/)
  assert.match(quality.evidence.join(' '), /source pixels not proven/)
})

test('obs parity evidence treats native polling suppression as expected manual visual proof', () => {
  const input = cleanInput()
  input.diagnostics.previewFramePollingSuppressed = true
  input.diagnostics.previewSourcePixelsPresent = true

  const quality = byArea(classifyObsParityEvidence(input), 'Preview quality vs OBS')

  assert.equal(quality.status, 'needs-manual')
  assert.equal(quality.owner, 'visual sampling / color parity')
  assert.match(quality.evidence.join(' '), /native CAMetalLayer/)
})

test('obs parity evidence flags undrained preview host commands', () => {
  const input = cleanInput()
  input.claimsNative = false
  input.diagnostics.previewSurfaceBacking = 'none'
  input.diagnostics.previewSourcePixelsPresent = false
  input.diagnostics.previewPendingHostCommandCount = 1

  const items = classifyObsParityEvidence(input)
  const lag = byArea(items, 'Preview lag while recording')
  const quality = byArea(items, 'Preview quality vs OBS')

  assert.equal(lag.status, 'fail')
  assert.match(lag.owner, /undrained preview host commands/)
  assert.match(lag.evidence.join(' '), /1 host command/)
  assert.equal(quality.status, 'fail')
  assert.match(quality.owner, /undrained preview host commands/)
})

test('obs parity evidence marks preview areas unmeasured for no-preview comparisons', () => {
  const input = cleanInput()
  input.previewMeasured = false
  input.claimsNative = false
  input.diagnostics.previewSurfaceBacking = 'none'

  const items = classifyObsParityEvidence(input)
  const lag = byArea(items, 'Preview lag while recording')
  const quality = byArea(items, 'Preview quality vs OBS')

  assert.equal(lag.status, 'needs-manual')
  assert.equal(lag.owner, 'no-preview comparison')
  assert.match(lag.evidence.join(' '), /disabled/)
  assert.equal(quality.status, 'needs-manual')
  assert.equal(quality.owner, 'no-preview comparison')
})

test('obs parity evidence highlights GPU fallback and missing Metal target export', () => {
  const input = cleanInput()
  input.diagnostics.compositorCpuFallbackFrames = 412
  input.diagnostics.compositorFallbackReason = 'camera frame unavailable'
  input.diagnostics.encoderBridgeMetalTargetFrames = 0
  input.diagnostics.encoderBridgeMetalTargetHandleFrames = 0
  input.diagnostics.encoderBridgeZeroCopyFrames = 0

  const items = classifyObsParityEvidence(input)
  const lag = byArea(items, 'Preview lag while recording')
  const quality = byArea(items, 'Preview quality vs OBS')
  const hotPath = byArea(items, 'Recording hot path')

  assert.equal(lag.status, 'fail')
  assert.match(lag.owner, /GPU fallback/)
  assert.match(lag.evidence.join(' '), /camera frame unavailable/)
  assert.match(quality.owner, /GPU compositor parity/)
  assert.match(hotPath.owner, /Metal target export evidence/)
})

test('obs parity evidence highlights copied Metal target export as a zero-copy gap', () => {
  const input = cleanInput()
  input.diagnostics.encoderBridgeRawVideoCopiedFrames = 120
  input.diagnostics.encoderBridgeMetalTargetCopiedFrames = 120
  input.diagnostics.encoderBridgeMetalTargetHandleFrames = 120
  input.diagnostics.encoderBridgeZeroCopyFrames = 0

  const hotPath = byArea(classifyObsParityEvidence(input), 'Recording hot path')

  assert.equal(hotPath.status, 'fail')
  assert.match(hotPath.owner, /zero-copy encoder export/)
  assert.match(hotPath.evidence.join(' '), /120 Metal target frame/)
})

test('obs parity evidence highlights missing retained Metal target handles', () => {
  const input = cleanInput()
  input.diagnostics.encoderBridgeMetalTargetFrames = 120
  input.diagnostics.encoderBridgeMetalTargetHandleFrames = 0

  const hotPath = byArea(classifyObsParityEvidence(input), 'Recording hot path')

  assert.equal(hotPath.status, 'fail')
  assert.match(hotPath.owner, /retained Metal target handoff/)
  assert.match(hotPath.evidence.join(' '), /0 retained Metal target handles/)
})

test('obs parity evidence assigns timestamp stretch to the H.264 mux boundary', () => {
  const input = cleanInput()
  input.analyzerVerdict = {
    pass: false,
    failures: [
      'timestamp/duration stretch: container duration 38.80s vs 6.83s implied by 205 frame(s) at 30fps',
    ],
  }

  const hotPath = byArea(classifyObsParityEvidence(input), 'Recording hot path')

  assert.equal(hotPath.status, 'fail')
  assert.match(hotPath.owner, /H\.264 timestamp\/mux boundary/)
  assert.match(hotPath.evidence.join(' '), /timestamp\/duration stretch/)
})

test('obs parity evidence warns on residual bridge repeats after final-file pass', () => {
  const input = cleanInput()
  input.diagnostics.encoderBridgeRepeatedFrames = 32
  input.diagnostics.targetFps = 30
  input.diagnostics.compositorTickGapP95Ms = 57.6
  input.diagnostics.compositorTickGapMaxMs = 131.5

  const hotPath = byArea(classifyObsParityEvidence(input), 'Recording hot path')

  assert.equal(hotPath.status, 'warn')
  assert.match(hotPath.owner, /cadence risk/)
  assert.match(hotPath.owner, /compositor wakeup cadence/)
  assert.match(hotPath.evidence.join(' '), /32 duplicate encoder/)
  assert.match(hotPath.evidence.join(' '), /tick gap p95 57\.6ms/)
})

test('obs parity evidence assigns high native latency to presenter currentness', () => {
  const input = cleanInput()
  input.diagnostics.previewInputToPresentLatencyP95Ms = 72
  input.diagnostics.previewCompositorFrameLag = 5

  const lag = byArea(classifyObsParityEvidence(input), 'Preview lag while recording')

  assert.equal(lag.status, 'fail')
  assert.match(lag.owner, /native presenter currentness/)
  assert.match(lag.evidence.join(' '), /72ms/)
  assert.match(lag.evidence.join(' '), /5 compositor/)
})
