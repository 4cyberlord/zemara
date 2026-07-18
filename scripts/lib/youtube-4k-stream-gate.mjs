export const YOUTUBE_4K_STREAM_GATES = Object.freeze({
  recording: Object.freeze({
    width: 3840,
    height: 2160,
    fps: 30,
    bitrateKbps: 30000
  }),
  stream: Object.freeze({
    width: 3840,
    height: 2160,
    fps: 30,
    bitrateKbps: 30000
  }),
  activeVideoToolboxOutputEncoders: 2
})

export function evaluateYoutube4kStreamEvidence(
  { manifest, receivedStreamProbe, streamAvSyncVerdict } = {},
  gates = YOUTUBE_4K_STREAM_GATES
) {
  const failures = []
  const warnings = []
  const request = manifest?.request ?? {}
  const result = manifest?.result ?? {}
  const diagnostics = manifest?.diagnostics ?? {}
  const finalFile = diagnostics.finalFile ?? {}
  const recordingOutput = diagnostics.recordingOutput ?? {}
  const streamOutput = diagnostics.streamOutput ?? {}

  requireProfile(failures, 'requested recording profile', request, gates.recording)
  if (request.streamEnabled !== true) {
    failures.push('streaming was not enabled for the baseline session')
  }
  if (request.streamingSettingsEnabled !== true) {
    failures.push('modern streaming settings were not enabled for the baseline session')
  }
  if (request.streamOutputPreset !== 'stream-youtube-4k30') {
    failures.push(
      `stream output preset ${formatValue(request.streamOutputPreset)} was not stream-youtube-4k30`
    )
  }
  requireEquals(failures, 'stream bitrate', request.streamBitrateKbps, gates.stream.bitrateKbps)
  if (request.streamTargetPlatform !== 'youtube') {
    failures.push(
      `stream target platform ${formatValue(request.streamTargetPlatform)} was not youtube`
    )
  }

  requireDimensions(failures, 'local recording artifact', finalFile, gates.recording)
  requireProfile(failures, 'diagnostic recording output', recordingOutput, gates.recording)
  requireProfile(failures, 'diagnostic stream output', streamOutput, gates.stream)
  requireDimensions(
    failures,
    'RTMP-received stream artifact',
    receivedStreamProbe?.video,
    gates.stream
  )
  requireReceivedFps(
    failures,
    'RTMP-received stream artifact',
    receivedStreamProbe?.video,
    gates.stream.fps
  )

  if (result.blockedBeforeEncoding === true) {
    failures.push(
      `recording was blocked before encoding: ${(result.acceptanceFailures ?? []).join('; ') || 'unknown reason'}`
    )
  }
  if (result.finalFilePass !== true) {
    failures.push(
      `local recording final-file gate failed: ${(result.acceptanceFailures ?? []).join('; ') || 'see quality report'}`
    )
  }
  if (result.startupPass !== true) {
    failures.push('local recording startup-resolution gate failed')
  }

  requireEquals(
    failures,
    'active VideoToolbox output encoder count',
    diagnostics.encoderBridgeActiveVideoToolboxOutputEncoders,
    gates.activeVideoToolboxOutputEncoders
  )
  requireTrue(
    failures,
    'separate output encoders',
    diagnostics.encoderBridgeSeparateOutputEncodersActive
  )
  requirePositive(
    failures,
    'recording VideoToolbox output frames',
    diagnostics.encoderBridgeRecordingVideoToolboxOutputFrames
  )
  requirePositive(
    failures,
    'recording VideoToolbox output bytes',
    diagnostics.encoderBridgeRecordingVideoToolboxOutputBytes
  )
  requirePositive(
    failures,
    'stream VideoToolbox output frames',
    diagnostics.encoderBridgeStreamVideoToolboxOutputFrames
  )
  requirePositive(
    failures,
    'stream VideoToolbox output bytes',
    diagnostics.encoderBridgeStreamVideoToolboxOutputBytes
  )
  requireEquals(
    failures,
    'raw-video copied frames',
    diagnostics.encoderBridgeRawVideoCopiedFrames,
    0
  )
  requireEquals(
    failures,
    'Metal target copied frames',
    diagnostics.encoderBridgeMetalTargetCopiedFrames,
    0
  )
  requirePositive(failures, 'zero-copy frames', diagnostics.encoderBridgeZeroCopyFrames)

  const repeatedRun = diagnostics.finalFile?.maxRepeatedFrameRun
  if (isFiniteNumber(repeatedRun) && repeatedRun > 2) {
    warnings.push(
      `local recording artifact reported repeated-frame run ${repeatedRun}; final-file gate verdict remains authoritative`
    )
  }
  const longestFreezeMs = diagnostics.finalFile?.longestFreezeMs
  if (isFiniteNumber(longestFreezeMs) && longestFreezeMs > 100) {
    warnings.push(
      `local recording artifact reported freeze ${longestFreezeMs.toFixed(0)}ms; final-file gate verdict remains authoritative`
    )
  }

  if (streamAvSyncVerdict) {
    if (streamAvSyncVerdict.pass !== true) {
      failures.push(
        `stream A/V sync gate failed: ${(streamAvSyncVerdict.failures ?? []).join('; ') || 'unknown failure'}`
      )
    }
    warnings.push(...(streamAvSyncVerdict.warnings ?? []))
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    summary: {
      recordingOutput,
      streamOutput,
      receivedStream: receivedStreamProbe?.video
        ? {
            width: receivedStreamProbe.video.width ?? null,
            height: receivedStreamProbe.video.height ?? null,
            avgFps: receivedStreamProbe.video.avgFps ?? null,
            nominalFps: receivedStreamProbe.video.nominalFps ?? null
          }
        : null,
      streamTargetPlatform: request.streamTargetPlatform ?? null,
      activeVideoToolboxOutputEncoders:
        diagnostics.encoderBridgeActiveVideoToolboxOutputEncoders ?? null,
      separateOutputEncodersActive: diagnostics.encoderBridgeSeparateOutputEncodersActive ?? null,
      mediaQualityMode: result.mediaQualityMode ?? null
    }
  }
}

function requireDimensions(failures, label, actual, expected) {
  requireEquals(failures, `${label} width`, actual?.width, expected.width)
  requireEquals(failures, `${label} height`, actual?.height, expected.height)
}

function requireProfile(failures, label, actual, expected) {
  requireDimensions(failures, label, actual, expected)
  requireEquals(failures, `${label} fps`, actual?.fps, expected.fps)
  requireEquals(failures, `${label} bitrate`, actual?.bitrateKbps, expected.bitrateKbps)
}

function requireReceivedFps(failures, label, actual, expectedFps) {
  const fps = actual?.avgFps ?? actual?.nominalFps
  if (!isFiniteNumber(fps)) {
    failures.push(`${label} fps was not reported`)
  } else if (Math.abs(fps - expectedFps) > 1) {
    failures.push(`${label} fps ${fps} was not within 1fps of ${expectedFps}`)
  }
}

function requirePositive(failures, label, actual) {
  if (!isFiniteNumber(actual) || actual <= 0) {
    failures.push(`${label} was not positive: ${formatValue(actual)}`)
  }
}

function requireTrue(failures, label, actual) {
  if (actual !== true) {
    failures.push(`${label} was not true: ${formatValue(actual)}`)
  }
}

function requireEquals(failures, label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} ${formatValue(actual)} did not equal ${formatValue(expected)}`)
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatValue(value) {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}
