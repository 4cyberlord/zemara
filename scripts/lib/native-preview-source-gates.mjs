const LIVE_SOURCE_IMPORT_FIELDS = Object.freeze({
  camera: {
    label: 'camera',
    iosurface: 'maxCompositorCameraSourceIosurfaceImportFrames',
    cvpixelbuffer: 'maxCompositorCameraSourceCvpixelbufferImportFrames',
    byteUpload: 'maxCompositorCameraSourceByteUploadFrames',
    failures: 'maxCompositorCameraSourceImportFailures'
  },
  screen: {
    label: 'screen',
    iosurface: 'maxCompositorScreenSourceIosurfaceImportFrames',
    cvpixelbuffer: 'maxCompositorScreenSourceCvpixelbufferImportFrames',
    byteUpload: 'maxCompositorScreenSourceByteUploadFrames',
    failures: 'maxCompositorScreenSourceImportFailures'
  }
})

export function assertSourceCompleteCompositorHealthy({
  scenarioLabel,
  stats,
  sourceComplete,
  allowSyntheticSourceOnly = false,
  requiredLiveSourceKinds = []
}) {
  if (!sourceComplete) {
    return
  }

  const prefix = scenarioLabel ? `[${scenarioLabel}] ` : ''
  const fallbackFrames = count(stats.maxCompositorCpuFallbackFrames)
  const metalTargets = count(stats.maxEncoderBridgeMetalTargetFrames)
  const reason =
    typeof stats.lastCompositorFallbackReason === 'string' ? stats.lastCompositorFallbackReason : ''

  if (fallbackFrames > 0) {
    throw new Error(
      `${prefix}Source-complete native-preview smoke rendered ${fallbackFrames} CPU fallback frame(s)${reason ? `: ${reason}` : ''}.`
    )
  }
  if (metalTargets <= 0) {
    throw new Error(
      `${prefix}Source-complete native-preview smoke never reached the Metal compositor target path.`
    )
  }
  if (count(stats.maxCompositorSourceImportFailures) > 0) {
    throw new Error(
      `${prefix}Source-complete native-preview smoke reported ${count(stats.maxCompositorSourceImportFailures)} source import failure(s).`
    )
  }
  if (
    (!Array.isArray(requiredLiveSourceKinds) || requiredLiveSourceKinds.length === 0) &&
    !allowSyntheticSourceOnly
  ) {
    throw new Error(
      `${prefix}Source-complete native-preview smoke declared no required live source kinds.`
    )
  }
  for (const kind of requiredLiveSourceKinds) {
    assertLiveSourceKindHealthy(prefix, stats, kind)
  }
}

function assertLiveSourceKindHealthy(prefix, stats, kind) {
  const fields = LIVE_SOURCE_IMPORT_FIELDS[kind]
  if (!fields) {
    throw new Error(
      `${prefix}Source-complete native-preview smoke cannot gate unknown live source kind "${kind}".`
    )
  }
  const importFailures = count(stats[fields.failures])
  const byteUploads = count(stats[fields.byteUpload])
  const zeroCopyImports = count(stats[fields.iosurface]) + count(stats[fields.cvpixelbuffer])

  if (importFailures > 0) {
    throw new Error(
      `${prefix}Source-complete native-preview smoke reported ${importFailures} ${fields.label} source import failure(s).`
    )
  }
  if (byteUploads > 0) {
    throw new Error(
      `${prefix}Source-complete native-preview smoke used ${byteUploads} ${fields.label} source byte-upload frame(s).`
    )
  }
  if (zeroCopyImports <= 0) {
    throw new Error(
      `${prefix}Source-complete native-preview smoke expected ${fields.label} source zero-copy import frames, got none.`
    )
  }
}

function count(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
