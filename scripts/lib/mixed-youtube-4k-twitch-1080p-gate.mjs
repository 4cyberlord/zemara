export function evaluateMixedYoutube4kTwitch1080pEvidence({
  manifest,
  youtubeStreamProbe,
  twitchStreamProbe,
  youtubeAvSyncVerdict,
  twitchAvSyncVerdict,
} = {}) {
  const failures = []
  const warnings = []
  const request = manifest?.request ?? {}
  const result = manifest?.result ?? {}
  const diagnostics = manifest?.diagnostics ?? {}

  requireProfile(failures, 'requested recording profile', request, {
    width: 3840,
    height: 2160,
    fps: 30,
    bitrateKbps: 30000,
  })
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
  if (request.streamTargetPlatform !== 'youtube') {
    failures.push(
      `primary stream target platform ${formatValue(request.streamTargetPlatform)} was not youtube`
    )
  }
  if (request.streamCompanionPlatform !== 'twitch') {
    failures.push(
      `companion stream target platform ${formatValue(request.streamCompanionPlatform)} was not twitch`
    )
  }

  requireDimensions(failures, 'local recording artifact', diagnostics.finalFile, {
    width: 3840,
    height: 2160,
  })
  requireProfile(failures, 'diagnostic recording output', diagnostics.recordingOutput, {
    width: 3840,
    height: 2160,
    fps: 30,
    bitrateKbps: 30000,
  })
  requireProfile(failures, 'diagnostic companion stream output', diagnostics.streamOutput, {
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateKbps: 6000,
  })
  requireDimensions(failures, 'YouTube RTMP-received stream artifact', youtubeStreamProbe?.video, {
    width: 3840,
    height: 2160,
  })
  requireReceivedFps(failures, 'YouTube RTMP-received stream artifact', youtubeStreamProbe?.video, 30)
  requireDimensions(failures, 'Twitch RTMP-received stream artifact', twitchStreamProbe?.video, {
    width: 1920,
    height: 1080,
  })
  requireReceivedFps(failures, 'Twitch RTMP-received stream artifact', twitchStreamProbe?.video, 30)

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
    2
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
    'stream VideoToolbox output frames',
    diagnostics.encoderBridgeStreamVideoToolboxOutputFrames
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

  for (const [label, verdict] of [
    ['YouTube stream A/V sync', youtubeAvSyncVerdict],
    ['Twitch stream A/V sync', twitchAvSyncVerdict],
  ]) {
    if (verdict?.pass !== true) {
      failures.push(`${label} gate failed: ${(verdict?.failures ?? []).join('; ') || 'unknown failure'}`)
    }
    warnings.push(...(verdict?.warnings ?? []))
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    summary: {
      recordingOutput: diagnostics.recordingOutput ?? null,
      companionStreamOutput: diagnostics.streamOutput ?? null,
      youtubeReceived: compactVideoProbe(youtubeStreamProbe?.video),
      twitchReceived: compactVideoProbe(twitchStreamProbe?.video),
      activeVideoToolboxOutputEncoders:
        diagnostics.encoderBridgeActiveVideoToolboxOutputEncoders ?? null,
      separateOutputEncodersActive:
        diagnostics.encoderBridgeSeparateOutputEncodersActive ?? null,
      mediaQualityMode: result.mediaQualityMode ?? null,
    },
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

function compactVideoProbe(video) {
  return video
    ? {
        width: video.width ?? null,
        height: video.height ?? null,
        avgFps: video.avgFps ?? null,
        nominalFps: video.nominalFps ?? null,
      }
    : null
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatValue(value) {
  return value === undefined ? 'undefined' : JSON.stringify(value)
}
