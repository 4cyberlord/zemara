export function evaluateRequired4kSourcePreflight(sources, requestedOutput, options = {}) {
  const nativeScreenPrefix = options.nativeScreenPrefix ?? 'screen:screencapturekit:'
  const failures = []
  const screen = sources?.screen ?? null

  if (!isAtLeast(requestedOutput?.width, 3840) || !isAtLeast(requestedOutput?.height, 2160)) {
    return { pass: true, failures }
  }

  if (screen && !String(screen.id ?? '').startsWith(nativeScreenPrefix)) {
    failures.push(
      `4K accepted evidence requires a ScreenCaptureKit screen source, got ${screen.name ?? 'screen'} [${screen.id ?? 'unknown'}]. ` +
        'ScreenCaptureKit discovery must complete, or force a screen:screencapturekit:* id with VIDEORC_BASELINE_SCREEN_ID.'
    )
  }

  if (screen && hasDimensions(screen) && dimensionBelow(screen, requestedOutput)) {
    failures.push(
      `4K accepted evidence requires selected screen source ${formatDimension(requestedOutput.width, requestedOutput.height)} or larger, ` +
        `got ${screen.name ?? 'screen'} [${screen.id ?? 'unknown'}] at ${formatDimension(screen.width, screen.height)}. ` +
        'Connect/select a real 4K ScreenCaptureKit display or run a non-4K baseline.'
    )
  }

  return { pass: failures.length === 0, failures }
}

function hasDimensions(device) {
  return isAtLeast(device?.width, 1) && isAtLeast(device?.height, 1)
}

function dimensionBelow(device, requestedOutput) {
  return device.width < requestedOutput.width || device.height < requestedOutput.height
}

function isAtLeast(value, minimum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum
}

function formatDimension(width, height) {
  return `${width ?? 'n/a'}x${height ?? 'n/a'}`
}
