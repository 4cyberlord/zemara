export function pickDevice(
  devices,
  kind,
  { override, disabled, nativePrefix, requireNative = false, minimumWidth, minimumHeight } = {}
) {
  if (disabled) return null
  if (override) {
    return (
      devices.find((device) => device.id === override) ?? {
        id: override,
        name: '(forced)',
        kind,
        status: 'forced'
      }
    )
  }

  const ofKind = devices.filter((device) => device.kind === kind)
  const available = ofKind.filter((device) => device.status === 'available')
  const pool = available.length ? available : ofKind
  const nativePool = nativePrefix ? pool.filter((device) => device.id.startsWith(nativePrefix)) : []
  const preferredPool =
    requireNative && nativePrefix ? nativePool : nativePool.length ? nativePool : pool
  if (!preferredPool.length) return null

  if (hasMinimumDimensions(minimumWidth, minimumHeight)) {
    return pickBestDimensionMatch(preferredPool, minimumWidth, minimumHeight)
  }

  return preferredPool[0] ?? null
}

function pickBestDimensionMatch(devices, minimumWidth, minimumHeight) {
  const withDimensions = devices.filter((device) => hasDimensions(device))
  const matching = withDimensions
    .filter((device) => device.width >= minimumWidth && device.height >= minimumHeight)
    .sort((left, right) => pixelArea(left) - pixelArea(right))
  if (matching.length) return matching[0]

  const fallback = withDimensions.sort((left, right) => pixelArea(right) - pixelArea(left))[0]
  return fallback ?? devices[0] ?? null
}

function hasMinimumDimensions(width, height) {
  return isPositiveNumber(width) && isPositiveNumber(height)
}

function hasDimensions(device) {
  return isPositiveNumber(device?.width) && isPositiveNumber(device?.height)
}

function pixelArea(device) {
  return device.width * device.height
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
