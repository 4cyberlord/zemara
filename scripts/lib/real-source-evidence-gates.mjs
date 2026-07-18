import { existsSync } from 'node:fs'

export const DEFAULT_REAL_SOURCE_EVIDENCE_GATES = Object.freeze({
  width: 3840,
  height: 2160,
  fps: 30,
  bitrateKbps: 30_000,
  minRecordingMs: 60_000,
  minDurationRatio: 0.98,
  maxPreviewInputToPresentP95Ms: 50,
  maxPreviewInputToPresentP99Ms: 100,
})

export const DEFAULT_SCREEN_RECORDING_EVIDENCE_GATES = Object.freeze({
  minDurationRatio: 0.8,
  nativeScreenPrefix: 'screen:screencapturekit:',
})

export function evaluateRealSourceEvidence(manifest, options = {}) {
  const gates = { ...DEFAULT_REAL_SOURCE_EVIDENCE_GATES, ...options }
  const failures = []
  const exists = options.exists ?? existsSync

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      pass: false,
      failures: ['manifest: expected an evidence manifest object'],
    }
  }

  const request = manifest.request ?? {}
  const result = manifest.result ?? {}
  const paths = manifest.paths ?? {}
  const sources = manifest.sources ?? {}
  const diagnostics = manifest.diagnostics ?? {}

  if (result.blockedBeforeEncoding === true) {
    failures.push('result: run blocked before encoding')
  }
  if (result.acceptancePass !== true) {
    failures.push('result: acceptance gate did not pass')
  }
  if (result.finalFilePass !== true) {
    failures.push('result: final-file analyzer did not pass')
  }
  if (result.startupPass !== true) {
    failures.push('result: startup analyzer did not pass')
  }
  if (options.require4k30 !== false && result.mediaQualityMode !== '4k-accepted') {
    failures.push(`result: expected media quality mode 4k-accepted, got ${result.mediaQualityMode ?? 'unknown'}`)
  }

  if (options.require4k30 !== false) {
    requireEqual(failures, 'request.width', request.width, gates.width)
    requireEqual(failures, 'request.height', request.height, gates.height)
    requireEqual(failures, 'request.fps', request.fps, gates.fps)
    requireEqual(failures, 'request.bitrateKbps', request.bitrateKbps, gates.bitrateKbps)
    if (request.require4kMediaEvidence !== true) {
      failures.push('request: 4K media evidence was not required')
    }
  }
  if (!numberAtLeast(request.recordingMs, gates.minRecordingMs)) {
    failures.push(`request: recordingMs ${format(request.recordingMs)} below ${gates.minRecordingMs}`)
  }
  if (options.requireMotion === true && request.screenMotionStimulus !== true) {
    failures.push('request: screen motion stimulus was not enabled')
  }
  if (options.requireMotion === true && request.screenMotionStimulus === true) {
    if (request.screenMotionStimulusVisible !== true) {
      failures.push('request: screen motion stimulus visibility was not proven')
    }
  }

  requirePath(failures, paths, 'recording', exists, options.checkFiles)
  requirePath(failures, paths, 'baselineReport', exists, options.checkFiles)
  requirePath(failures, paths, 'evidenceManifest', exists, options.checkFiles)
  requirePath(failures, paths, 'qualityJson', exists, options.checkFiles)
  requirePath(failures, paths, 'qualityReport', exists, options.checkFiles)
  requirePath(failures, paths, 'startupJson', exists, options.checkFiles)
  requirePath(failures, paths, 'startupReport', exists, options.checkFiles)

  if (!sources.screen) failures.push('sources: screen source missing')
  if (!sources.camera) failures.push('sources: camera source missing')
  if (!sources.microphone) failures.push('sources: microphone source missing')

  if (diagnostics.previewSurfaceBacking !== 'cametal-layer') {
    failures.push(`preview: expected CAMetalLayer backing, got ${diagnostics.previewSurfaceBacking ?? 'unknown'}`)
  }
  if (!arrayIncludes(diagnostics.previewTransportsObserved, 'native-surface')) {
    failures.push('preview: native-surface transport was not observed')
  }
  if (!arrayIncludes(diagnostics.previewSurfaceBackingsObserved, 'cametal-layer')) {
    failures.push('preview: cametal-layer backing was not observed')
  }
  if ((diagnostics.imagePollDuringSession?.total ?? 0) !== 0) {
    failures.push(`preview: ${diagnostics.imagePollDuringSession?.total ?? 'unknown'} image-poll request(s) during session`)
  }
  if (diagnostics.previewSourcePixelsPresent !== true) {
    failures.push('preview: source pixels were not proven on the native surface')
  }
  if (diagnostics.previewFramePollingSuppressed !== true) {
    failures.push('preview: frame polling was not suppressed during the run')
  }
  if ((diagnostics.previewPendingHostCommandCount ?? 0) !== 0) {
    failures.push(`preview: ${diagnostics.previewPendingHostCommandCount} host command(s) pending`)
  }
  if (!numberAtMost(diagnostics.previewInputToPresentLatencyP95Ms, gates.maxPreviewInputToPresentP95Ms)) {
    failures.push(
      `preview: source-to-present p95 ${format(diagnostics.previewInputToPresentLatencyP95Ms)}ms above ${gates.maxPreviewInputToPresentP95Ms}ms`
    )
  }
  if (!numberAtMost(diagnostics.previewInputToPresentLatencyP99Ms, gates.maxPreviewInputToPresentP99Ms)) {
    failures.push(
      `preview: source-to-present p99 ${format(diagnostics.previewInputToPresentLatencyP99Ms)}ms above ${gates.maxPreviewInputToPresentP99Ms}ms`
    )
  }

  if (diagnostics.compositorBackend !== 'metal') {
    failures.push(`compositor: expected metal backend, got ${diagnostics.compositorBackend ?? 'unknown'}`)
  }
  if ((diagnostics.compositorCpuFallbackFrames ?? 0) !== 0) {
    failures.push(`compositor: ${diagnostics.compositorCpuFallbackFrames} CPU fallback frame(s)`)
  }

  requireDimensionAtLeast(failures, diagnostics.mediaDimensions?.requestedOutput, gates, 'media.requestedOutput')
  requireDimensionAtLeast(failures, diagnostics.mediaDimensions?.screenSource, gates, 'media.screenSource')
  requireDimensionAtLeast(failures, diagnostics.mediaDimensions?.compositorScreenSource, gates, 'media.compositorScreenSource')
  requireDimensionAtLeast(failures, diagnostics.mediaDimensions?.compositorTarget, gates, 'media.compositorTarget')
  requireDimensionAtLeast(failures, diagnostics.mediaDimensions?.compositorMetalTarget, gates, 'media.compositorMetalTarget')

  if ((diagnostics.encoderBridgeRawVideoCopiedFrames ?? 0) !== 0) {
    failures.push(`recording: ${diagnostics.encoderBridgeRawVideoCopiedFrames} raw-YUV copied frame(s)`)
  }
  if ((diagnostics.encoderBridgeMetalTargetCopiedFrames ?? 0) !== 0) {
    failures.push(`recording: ${diagnostics.encoderBridgeMetalTargetCopiedFrames} copied Metal target frame(s)`)
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeMetalTargetFrames, 0)) {
    failures.push('recording: no Metal target frames reached the encoder bridge')
  }
  if (!numberAtLeast(diagnostics.encoderBridgeMetalTargetHandleFrames, diagnostics.encoderBridgeMetalTargetFrames)) {
    failures.push('recording: retained Metal target handles did not cover every Metal target frame')
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeZeroCopyFrames, 0)) {
    failures.push('recording: no zero-copy encoder frames observed')
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeVideoToolboxOutputFrames, 0)) {
    failures.push('recording: no VideoToolbox output frames observed')
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeVideoToolboxOutputBytes, 0)) {
    failures.push('recording: no VideoToolbox output bytes observed')
  }
  if ((diagnostics.encoderBridgeVideoToolboxProbeErrors ?? 0) !== 0) {
    failures.push(`recording: ${diagnostics.encoderBridgeVideoToolboxProbeErrors} VideoToolbox error(s)`)
  }
  if ((diagnostics.encoderBridgeSyntheticFrames ?? 0) !== 0) {
    failures.push(`recording: ${diagnostics.encoderBridgeSyntheticFrames} synthetic filler frame(s)`)
  }

  if ((diagnostics.micDroppedFrames ?? 0) !== 0) {
    failures.push(`audio: ${diagnostics.micDroppedFrames} microphone dropped frame(s)`)
  }
  if (!numberAtLeast(diagnostics.minMicCaptureCoverage, 1)) {
    failures.push(`audio: mic capture coverage ${format(diagnostics.minMicCaptureCoverage)} below 1`)
  }

  const finalFile = diagnostics.finalFile ?? {}
  requireEqual(failures, 'final.width', finalFile.width, gates.width)
  requireEqual(failures, 'final.height', finalFile.height, gates.height)
  if (!numberAtLeast(finalFile.durationSeconds, (request.recordingMs / 1000) * gates.minDurationRatio)) {
    failures.push(`final: duration ${format(finalFile.durationSeconds)}s too short for ${request.recordingMs}ms request`)
  }
  if (!numberAtMost(finalFile.longestFreezeMs ?? 0, 100)) {
    failures.push(`final: longest freeze ${format(finalFile.longestFreezeMs)}ms above 100ms`)
  }

  const startup = diagnostics.startup ?? {}
  requireEqual(failures, 'startup.metadataWidth', startup.metadataWidth, gates.width)
  requireEqual(failures, 'startup.metadataHeight', startup.metadataHeight, gates.height)
  if ((startup.dimensionMismatchCount ?? 0) !== 0) {
    failures.push(`startup: ${startup.dimensionMismatchCount} dimension mismatch frame(s)`)
  }
  if ((startup.previewSizedFrameCount ?? 0) !== 0) {
    failures.push(`startup: ${startup.previewSizedFrameCount} preview-sized frame(s)`)
  }

  return {
    pass: failures.length === 0,
    failures,
  }
}

export function evaluateScreenRecordingEvidence(manifest, options = {}) {
  const gates = { ...DEFAULT_SCREEN_RECORDING_EVIDENCE_GATES, ...options }
  const failures = []
  const exists = options.exists ?? existsSync

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      pass: false,
      failures: ['manifest: expected an evidence manifest object'],
    }
  }

  const request = manifest.request ?? {}
  const result = manifest.result ?? {}
  const paths = manifest.paths ?? {}
  const sources = manifest.sources ?? {}
  const diagnostics = manifest.diagnostics ?? {}
  const finalFile = diagnostics.finalFile ?? {}
  const startup = diagnostics.startup ?? {}
  const screenId = sources.screen?.id

  if (result.blockedBeforeEncoding === true) {
    failures.push('result: run blocked before encoding')
  }
  if (result.startupPass !== true) {
    failures.push('result: startup analyzer did not pass')
  }
  if (!['zero-copy-recording', '4k-accepted'].includes(result.mediaQualityMode)) {
    failures.push(`result: expected zero-copy screen recording, got ${result.mediaQualityMode ?? 'unknown'}`)
  }

  if (typeof screenId !== 'string' || !screenId.startsWith(gates.nativeScreenPrefix)) {
    failures.push(`sources: expected native ScreenCaptureKit screen source, got ${screenId ?? 'missing'}`)
  }
  if (options.requireMotion === true && request.screenMotionStimulus !== true) {
    failures.push('request: screen motion stimulus was not enabled')
  }
  if (options.requireMotion === true && request.screenMotionStimulus === true) {
    if (request.screenMotionStimulusVisible !== true) {
      failures.push('request: screen motion stimulus visibility was not proven')
    }
    if (result.finalFilePass !== true) {
      failures.push('result: final-file analyzer did not pass')
    }
  }

  requirePath(failures, paths, 'recording', exists, options.checkFiles)
  requirePath(failures, paths, 'baselineReport', exists, options.checkFiles)
  requirePath(failures, paths, 'evidenceManifest', exists, options.checkFiles)
  requirePath(failures, paths, 'qualityJson', exists, options.checkFiles)
  requirePath(failures, paths, 'qualityReport', exists, options.checkFiles)
  requirePath(failures, paths, 'startupJson', exists, options.checkFiles)
  requirePath(failures, paths, 'startupReport', exists, options.checkFiles)

  if ((diagnostics.imagePollDuringSession?.total ?? 0) !== 0) {
    failures.push(`preview: ${diagnostics.imagePollDuringSession?.total ?? 'unknown'} image-poll request(s) during session`)
  }
  if (diagnostics.compositorBackend !== 'metal') {
    failures.push(`compositor: expected metal backend, got ${diagnostics.compositorBackend ?? 'unknown'}`)
  }
  if ((diagnostics.compositorCpuFallbackFrames ?? 0) !== 0) {
    failures.push(`compositor: ${diagnostics.compositorCpuFallbackFrames} CPU fallback frame(s)`)
  }
  if ((diagnostics.encoderBridgeRawVideoCopiedFrames ?? 0) !== 0) {
    failures.push(`recording: ${diagnostics.encoderBridgeRawVideoCopiedFrames} raw-YUV copied frame(s)`)
  }
  if ((diagnostics.encoderBridgeMetalTargetCopiedFrames ?? 0) !== 0) {
    failures.push(`recording: ${diagnostics.encoderBridgeMetalTargetCopiedFrames} copied Metal target frame(s)`)
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeZeroCopyFrames, 0)) {
    failures.push('recording: no zero-copy encoder frames observed')
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeVideoToolboxOutputFrames, 0)) {
    failures.push('recording: no VideoToolbox output frames observed')
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeVideoToolboxOutputBytes, 0)) {
    failures.push('recording: no VideoToolbox output bytes observed')
  }
  if ((diagnostics.encoderBridgeSyntheticFrames ?? 0) !== 0) {
    failures.push(`recording: ${diagnostics.encoderBridgeSyntheticFrames} synthetic filler frame(s)`)
  }

  requireEqual(failures, 'final.width', finalFile.width, request.width)
  requireEqual(failures, 'final.height', finalFile.height, request.height)
  if (!numberAtLeast(finalFile.durationSeconds, (request.recordingMs / 1000) * gates.minDurationRatio)) {
    failures.push(`final: duration ${format(finalFile.durationSeconds)}s too short for ${request.recordingMs}ms request`)
  }
  if (!numberGreaterThan(finalFile.observedFrames, 0)) {
    failures.push('final: no decoded video frames observed')
  }
  if (options.requireMotion === true && !numberAtMost(finalFile.longestFreezeMs ?? 0, 100)) {
    failures.push(`final: longest freeze ${format(finalFile.longestFreezeMs)}ms above 100ms`)
  }

  requireEqual(failures, 'startup.metadataWidth', startup.metadataWidth, request.width)
  requireEqual(failures, 'startup.metadataHeight', startup.metadataHeight, request.height)
  if ((startup.dimensionMismatchCount ?? 0) !== 0) {
    failures.push(`startup: ${startup.dimensionMismatchCount} dimension mismatch frame(s)`)
  }
  if ((startup.previewSizedFrameCount ?? 0) !== 0) {
    failures.push(`startup: ${startup.previewSizedFrameCount} preview-sized frame(s)`)
  }

  return {
    pass: failures.length === 0,
    failures,
  }
}

function requirePath(failures, paths, key, exists, checkFiles) {
  const value = paths[key]
  if (typeof value !== 'string' || value.trim() === '') {
    failures.push(`paths.${key}: missing path`)
    return
  }
  if (checkFiles === true && !exists(value)) {
    failures.push(`paths.${key}: file does not exist (${value})`)
  }
}

function requireEqual(failures, label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, got ${format(actual)}`)
  }
}

function requireDimensionAtLeast(failures, value, gates, label) {
  const width = dimensionValue(value, 'width')
  const height = dimensionValue(value, 'height')
  if (!numberAtLeast(width, gates.width) || !numberAtLeast(height, gates.height)) {
    failures.push(`${label}: expected at least ${gates.width}x${gates.height}, got ${format(width)}x${format(height)}`)
  }
}

function dimensionValue(value, key) {
  if (typeof value?.[key] === 'number') return value[key]
  if (typeof value?.max?.[key] === 'number') return value.max[key]
  if (typeof value?.latest?.[key] === 'number') return value.latest[key]
  return null
}

function arrayIncludes(value, item) {
  return Array.isArray(value) && value.includes(item)
}

function numberGreaterThan(value, minimum) {
  return typeof value === 'number' && Number.isFinite(value) && value > minimum
}

function numberAtLeast(value, minimum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum
}

function numberAtMost(value, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value <= maximum
}

function format(value) {
  return value == null || value === '' ? 'n/a' : String(value)
}
