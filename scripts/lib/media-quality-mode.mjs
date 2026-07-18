// Shared media-path quality vocabulary for diagnostics and acceptance reports.
// Keep this classifier evidence-based: it names the strongest path proved by the
// current run, not the path we intended to use.

export const MEDIA_QUALITY_MODES = Object.freeze([
  'fallback-baseline',
  'native-preview-only',
  'zero-copy-recording',
  'record-stream-split-output',
  '4k-accepted',
])

export const MEDIA_QUALITY_MODE_LABELS = Object.freeze({
  'fallback-baseline': 'Fallback baseline',
  'native-preview-only': 'Native preview only',
  'zero-copy-recording': 'Zero-copy recording',
  'record-stream-split-output': 'Record/stream split output',
  '4k-accepted': '4K accepted',
})

export const MEDIA_QUALITY_MODE_DESCRIPTIONS = Object.freeze({
  'fallback-baseline':
    'Legacy, copied, blocked, or otherwise fallback media path. Useful for measurement, not a product-accepted mode.',
  'native-preview-only':
    'Native CAMetalLayer preview evidence exists, but recording still lacks zero-copy output proof.',
  'zero-copy-recording':
    'Recording used the Metal-to-VideoToolbox zero-copy path without raw-video or copied Metal target frames.',
  'record-stream-split-output':
    'Recording and streaming are both active through separate output targets/encoders.',
  '4k-accepted':
    'A 4K30 local recording path passed acceptance with native preview and zero-copy recording evidence.',
})

export function classifyMediaQualityMode(input = {}) {
  const diagnostics = input.diagnostics ?? {}
  const requestedOutput = input.requestedOutput ?? {}
  const recordingEnabled = input.recordingEnabled !== false
  const streamEnabled = input.streamEnabled === true
  const separateOutputEncoders =
    input.separateOutputEncoders === true ||
    diagnostics.encoderBridgeSeparateOutputEncodersActive === true
  const activeOutputEncoders =
    input.activeVideoToolboxOutputEncoders ?? diagnostics.encoderBridgeActiveVideoToolboxOutputEncoders
  const recordingOutputFrames = diagnostics.encoderBridgeRecordingVideoToolboxOutputFrames
  const recordingOutputBytes = diagnostics.encoderBridgeRecordingVideoToolboxOutputBytes
  const streamOutputFrames = diagnostics.encoderBridgeStreamVideoToolboxOutputFrames
  const streamOutputBytes = diagnostics.encoderBridgeStreamVideoToolboxOutputBytes
  const streamOutput = input.streamOutput ?? outputProfileFromDiagnostics(diagnostics, 'stream')
  const acceptancePass = input.acceptancePass === true
  const claimsNativePreview =
    input.claimsNative === true ||
    diagnostics.previewTransport === 'native-surface' ||
    diagnostics.previewSurfaceBacking === 'cametal-layer'

  const zeroCopyRecording =
    recordingEnabled &&
    numberGreaterThan(diagnostics.encoderBridgeZeroCopyFrames, 0) &&
    numberGreaterThan(diagnostics.encoderBridgeVideoToolboxOutputFrames, 0) &&
    numberEquals(diagnostics.encoderBridgeRawVideoCopiedFrames, 0) &&
    numberEquals(diagnostics.encoderBridgeMetalTargetCopiedFrames, 0) &&
    numberGreaterThanAny(
      diagnostics.encoderBridgeMetalTargetHandleFrames,
      diagnostics.encoderBridgeMetalTargetFrames
    ) &&
    diagnostics.compositorBackend === 'metal'

  const requested4k30 =
    numberAtLeast(requestedOutput.width, 3840) &&
    numberAtLeast(requestedOutput.height, 2160) &&
    numberAtLeast(requestedOutput.fps, 30)

  const splitOutput =
    zeroCopyRecording &&
    streamEnabled &&
    separateOutputEncoders &&
    numberAtLeast(activeOutputEncoders, 2) &&
    numberGreaterThan(recordingOutputFrames, 0) &&
    numberGreaterThan(recordingOutputBytes, 0) &&
    numberGreaterThan(streamOutputFrames, 0) &&
    numberGreaterThan(streamOutputBytes, 0) &&
    outputLooks1080p(streamOutput)

  if (requested4k30 && acceptancePass && claimsNativePreview && zeroCopyRecording && (!streamEnabled || splitOutput)) {
    return qualityMode('4k-accepted', [
      `requested ${requestedOutput.width}x${requestedOutput.height}@${requestedOutput.fps}`,
      'acceptance gates passed',
      'native preview proved',
      'zero-copy recording proved',
    ])
  }

  if (splitOutput) {
    return qualityMode('record-stream-split-output', [
      'recording and streaming requested together',
      'separate output encoders proved',
      `${recordingOutputFrames} recording encoder frame(s) and ${streamOutputFrames} stream encoder frame(s)`,
      'stream output is platform-safe 1080p or lower',
    ])
  }

  if (zeroCopyRecording) {
    return qualityMode('zero-copy-recording', [
      `${diagnostics.encoderBridgeZeroCopyFrames} zero-copy frame(s)`,
      `${diagnostics.encoderBridgeVideoToolboxOutputFrames} VideoToolbox output frame(s)`,
      'no raw-video or copied Metal target frames observed',
    ])
  }

  if (claimsNativePreview) {
    return qualityMode('native-preview-only', [
      `preview transport ${diagnostics.previewTransport ?? 'unknown'}`,
      `preview backing ${diagnostics.previewSurfaceBacking ?? 'unknown'}`,
      fallbackRecordingReason(diagnostics),
    ])
  }

  return qualityMode('fallback-baseline', fallbackReasons(diagnostics))
}

function qualityMode(mode, reasons) {
  return {
    mode,
    label: MEDIA_QUALITY_MODE_LABELS[mode],
    description: MEDIA_QUALITY_MODE_DESCRIPTIONS[mode],
    reasons: reasons.filter(Boolean),
  }
}

function fallbackReasons(diagnostics) {
  const reasons = []
  if (diagnostics.recordingStartupBarrierState === 'blocked') {
    reasons.push(`startup blocked: ${diagnostics.recordingStartupBarrierTimeoutReason ?? 'unknown reason'}`)
  }
  if (diagnostics.compositorBackend && diagnostics.compositorBackend !== 'metal') {
    reasons.push(`compositor backend ${diagnostics.compositorBackend}`)
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeZeroCopyFrames, 0)) {
    reasons.push('zero-copy recording frames not proved')
  }
  if (numberGreaterThan(diagnostics.encoderBridgeRawVideoCopiedFrames, 0)) {
    reasons.push(`${diagnostics.encoderBridgeRawVideoCopiedFrames} raw-video copied frame(s)`)
  }
  if (!diagnostics.previewTransport || diagnostics.previewTransport === 'latest-jpeg-polling' || diagnostics.previewTransport === 'mjpeg-stream') {
    reasons.push(`preview transport ${diagnostics.previewTransport ?? 'unknown'}`)
  }
  return reasons.length ? reasons : ['insufficient native media-path evidence']
}

function fallbackRecordingReason(diagnostics) {
  if (numberGreaterThan(diagnostics.encoderBridgeRawVideoCopiedFrames, 0)) {
    return `${diagnostics.encoderBridgeRawVideoCopiedFrames} raw-video copied frame(s)`
  }
  if (numberGreaterThan(diagnostics.encoderBridgeMetalTargetCopiedFrames, 0)) {
    return `${diagnostics.encoderBridgeMetalTargetCopiedFrames} copied Metal target frame(s)`
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeVideoToolboxOutputFrames, 0)) {
    return 'VideoToolbox output frames not proved'
  }
  if (!numberGreaterThan(diagnostics.encoderBridgeZeroCopyFrames, 0)) {
    return 'zero-copy frames not proved'
  }
  return 'recording path has not met zero-copy criteria'
}

function outputLooks1080p(output) {
  if (!output) return false
  return numberAtLeast(output.width, 1) && numberAtLeast(output.height, 1) && output.width <= 1920 && output.height <= 1080
}

function outputProfileFromDiagnostics(diagnostics, prefix) {
  const width = diagnostics?.[`${prefix}OutputWidth`]
  const height = diagnostics?.[`${prefix}OutputHeight`]
  const fps = diagnostics?.[`${prefix}OutputFps`]
  const bitrateKbps = diagnostics?.[`${prefix}OutputBitrateKbps`]
  if (
    typeof width !== 'number' &&
    typeof height !== 'number' &&
    typeof fps !== 'number' &&
    typeof bitrateKbps !== 'number'
  ) {
    return null
  }
  return { width, height, fps, bitrateKbps }
}

function numberGreaterThan(value, threshold) {
  return typeof value === 'number' && Number.isFinite(value) && value > threshold
}

function numberGreaterThanAny(...values) {
  return values.some((value) => numberGreaterThan(value, 0))
}

function numberAtLeast(value, threshold) {
  return typeof value === 'number' && Number.isFinite(value) && value >= threshold
}

function numberEquals(value, expected) {
  return typeof value === 'number' && Number.isFinite(value) && value === expected
}
